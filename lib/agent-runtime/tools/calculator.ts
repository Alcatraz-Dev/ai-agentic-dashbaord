import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";

/**
 * Arithmetic without `eval`: a small recursive-descent parser over numbers,
 * + - * / % ^, parentheses, a few functions and the constants pi/e.
 */

type Token = { type: "number" | "name" | "op" | "paren"; value: string };

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sqrt: ([x]) => Math.sqrt(x),
  abs: ([x]) => Math.abs(x),
  round: ([x, digits]) =>
    digits === undefined ? Math.round(x) : Math.round(x * 10 ** digits) / 10 ** digits,
  floor: ([x]) => Math.floor(x),
  ceil: ([x]) => Math.ceil(x),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
  log: ([x]) => Math.log10(x),
  ln: ([x]) => Math.log(x),
  exp: ([x]) => Math.exp(x),
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let number = "";
      while (index < input.length && /[0-9._]/.test(input[index]!)) {
        number += input[index];
        index += 1;
      }
      // Scientific notation: 1e3, 2.5e-4
      if (input[index] === "e" || input[index] === "E") {
        let exponent = input[index]!;
        index += 1;
        if (input[index] === "+" || input[index] === "-") {
          exponent += input[index];
          index += 1;
        }
        while (index < input.length && /[0-9]/.test(input[index]!)) {
          exponent += input[index];
          index += 1;
        }
        number += exponent;
      }

      const cleaned = number.replace(/_/g, "");
      if (!Number.isFinite(Number(cleaned))) throw new Error(`Invalid number "${number}".`);
      tokens.push({ type: "number", value: cleaned });
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let name = "";
      while (index < input.length && /[a-zA-Z]/.test(input[index]!)) {
        name += input[index];
        index += 1;
      }
      tokens.push({ type: "name", value: name.toLowerCase() });
      continue;
    }

    if ("+-*/%^".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }

    if ("(),".includes(char)) {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected character "${char}".`);
  }

  return tokens;
}

export function evaluateExpression(input: string): number {
  const tokens = tokenize(input);
  let position = 0;

  const peek = () => tokens[position];
  const eat = (value: string) => {
    const token = peek();
    if (!token || token.value !== value) throw new Error(`Expected "${value}".`);
    position += 1;
    return token;
  };

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new Error("The expression ends too early.");

    if (token.type === "number") {
      position += 1;
      return Number(token.value);
    }

    if (token.type === "paren" && token.value === "(") {
      position += 1;
      const value = parseExpression();
      eat(")");
      return value;
    }

    if (token.type === "name") {
      position += 1;

      if (token.value === "pi") return Math.PI;
      if (token.value === "e") return Math.E;

      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`Unknown name "${token.value}".`);

      eat("(");
      const args: number[] = [];

      if (!(peek()?.value === ")")) {
        args.push(parseExpression());
        while (peek()?.value === ",") {
          position += 1;
          args.push(parseExpression());
        }
      }

      eat(")");
      if (args.length === 0) throw new Error(`"${token.value}" needs an argument.`);

      const result = fn(args);
      if (!Number.isFinite(result)) throw new Error("The result isn't a finite number.");
      return result;
    }

    throw new Error(`Unexpected "${token.value}".`);
  }

  // Unary minus sits outside the power, so -2^2 is -(2^2) = -4.
  function parseUnary(): number {
    const token = peek();
    if (token?.type === "op" && (token.value === "-" || token.value === "+")) {
      position += 1;
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    const token = peek();
    if (token?.type === "op" && token.value === "^") {
      position += 1;
      return base ** parseUnary();
    }
    return base;
  }

  function parseTerm(): number {
    let value = parseUnary();

    while (true) {
      const token = peek();
      if (token?.type !== "op" || !"*/%".includes(token.value)) break;
      position += 1;
      const right = parseUnary();

      if (token.value === "*") value *= right;
      else if (token.value === "/") {
        if (right === 0) throw new Error("Division by zero.");
        value /= right;
      } else {
        if (right === 0) throw new Error("Division by zero.");
        value %= right;
      }
    }

    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();

    while (true) {
      const token = peek();
      if (token?.type !== "op" || (token.value !== "+" && token.value !== "-")) break;
      position += 1;
      const right = parseTerm();
      value = token.value === "+" ? value + right : value - right;
    }

    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length) throw new Error("Unexpected input after the expression.");
  if (!Number.isFinite(result)) throw new Error("The result isn't a finite number.");

  return result;
}

const calculateParameters = z.object({
  expression: z
    .string()
    .describe('Expression to evaluate, e.g. "(18 * 7 + 4) / 3" or "sqrt(2) * 100".'),
});

export const calculate: Tool<AgentToolRunState> = tool<
  typeof calculateParameters,
  AgentToolRunState
>({
  name: "calculate",
  description:
    "Evaluate an arithmetic expression exactly instead of estimating. Supports + - * / % ^, parentheses, sqrt, abs, round, floor, ceil, min, max, log, ln, exp, pi and e.",
  parameters: calculateParameters,
  execute: async ({ expression }) => {
    if (expression.length > 200) return "That expression is too long.";

    try {
      const value = evaluateExpression(expression);
      return `${expression} = ${Number(value.toPrecision(12))}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid expression.";
      return `Couldn't evaluate that: ${message}`;
    }
  },
});
