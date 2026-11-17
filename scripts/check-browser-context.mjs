/**
 * Live check: the Browserbase Context keeps a login through a clean close, a
 * dropped connection and a navigation timeout.
 *
 * Run it with the project's key:
 *   node --env-file=.env scripts/check-browser-context.mjs
 *
 * It uses a throwaway Context (never the owner's saved `browser_context_id`)
 * and deletes it afterwards. The three cases mirror how a turn ends:
 *   1. close()            — the normal end of a reply.
 *   2. disconnect()       — the CDP connection goes away mid-session.
 *   3. a page wait that times out while the page is open.
 *
 * It also records the browser's timezone each session: there is no proxy, so
 * the profile must not wander between cities from one session to the next.
 */

import assert from "node:assert/strict";
import { Stagehand, browserbase } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";

const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();

if (!apiKey) {
  console.error("BROWSERBASE_API_KEY is not set. Run with: node --env-file=.env scripts/check-browser-context.mjs");
  process.exit(1);
}

const client = new Browserbase({ apiKey });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timezones = [];

function log(line) {
  console.log(line);
}

/**
 * Starts a session on the test Context, retrying while the old one releases.
 * The Stagehand instance is what attaches the page context, exactly as
 * `openCloudBrowser` does; the model is never called by this check.
 */
async function openSession(label) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const browser = await browserbase.launch({
        apiKey,
        ...(projectId ? { projectId } : {}),
        keepAlive: false,
        browserSettings: {
          context: { id: context.id, persist: true },
          blockAds: true,
        },
      });
      const stagehand = await Stagehand.create({
        apiKey,
        browser,
        model: { modelName: "google/gemini-2.5-flash" },
      });
      return { browser, stagehand, sessionId: browser.sessionId };
    } catch (error) {
      if (attempt === 8) throw error;
      log(`  ${label}: session start failed (${error.message?.slice(0, 90)}); retrying in 3s`);
      await sleep(3_000);
    }
  }
  throw new Error("unreachable");
}

async function closeSession(handle) {
  await handle.stagehand.close().catch(() => undefined);
  await handle.browser.close().catch(() => undefined);
}

async function activePage(handle) {
  const pages = await handle.browser.context.pages();
  return pages.at(-1) ?? (await handle.browser.context.newPage());
}

async function waitForSessionEnd(sessionId) {
  for (let i = 0; i < 20; i += 1) {
    const session = await client.sessions.retrieve(sessionId).catch(() => null);
    if (!session || session.status !== "RUNNING") return;
    await sleep(1_000);
  }
}

async function release(sessionId) {
  await client.sessions.update(sessionId, { status: "REQUEST_RELEASE" }).catch(() => undefined);
  await waitForSessionEnd(sessionId);
  // Let the Context finish writing and unlock for the next session.
  await sleep(2_000);
}

async function visitExample(handle) {
  const page = await activePage(handle);
  await page.goto("https://example.com", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (zone) timezones.push(zone);
  return page;
}

async function cookieValue(handle, name) {
  const cookies = await handle.browser.context.cookies(["https://example.com"]);
  return cookies.find((cookie) => cookie.name === name)?.value ?? null;
}

async function assertLoginState(handle, expected, label) {
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(await cookieValue(handle, name), value, `${label}: cookie ${name} is missing`);
  }
  log(`  ${label}: ${Object.keys(expected).join(", ")} still present`);
}

let context;
const openHandles = [];

try {
  context = await client.contexts.create(projectId ? { projectId } : undefined);
  log(`Context ${context.id}`);

  // 1. A clean close: what a normal reply does at the end.
  log("1. clean close");
  const first = await openSession("close");
  openHandles.push(first);
  const firstPage = await visitExample(first);
  await first.browser.context.addCookies([
    { name: "buffy_close", value: "kept", url: "https://example.com", sameSite: "Lax" },
  ]);
  await firstPage.evaluate(() => localStorage.setItem("buffy_local", "kept"));
  await closeSession(first);
  openHandles.pop();
  await release(first.sessionId);

  const second = await openSession("verify-close");
  openHandles.push(second);
  const secondPage = await visitExample(second);
  await assertLoginState(second, { buffy_close: "kept" }, "after close");
  assert.equal(
    await secondPage.evaluate(() => localStorage.getItem("buffy_local")),
    "kept",
    "after close: localStorage is missing",
  );
  log("  after close: localStorage still present");

  // 2. A dropped connection: the session never gets a graceful close.
  log("2. dropped connection");
  await second.browser.context.addCookies([
    { name: "buffy_drop", value: "kept", url: "https://example.com", httpOnly: true, sameSite: "Lax" },
  ]);
  await second.browser.disconnect();
  openHandles.pop();
  await release(second.sessionId);

  const third = await openSession("verify-drop");
  openHandles.push(third);
  await visitExample(third);
  await assertLoginState(third, { buffy_close: "kept", buffy_drop: "kept" }, "after drop");

  // 3. A wait that times out while the page is open.
  log("3. page timeout");
  await third.browser.context.addCookies([
    { name: "buffy_timeout", value: "kept", url: "https://example.com", sameSite: "Lax" },
  ]);
  const timeoutPage = await activePage(third);
  let timedOut = false;
  try {
    // A control that never appears: the wait is allowed 1.5s and must fail.
    const found = await timeoutPage.waitForSelector("#buffy-signin-form", { timeout: 1_500 });
    timedOut = found === false;
  } catch (error) {
    timedOut = /timeout/i.test(`${error.name} ${error.message}`);
    log(`  wait ended with ${error.name}: ${String(error.message).slice(0, 90)}`);
  }
  assert.ok(timedOut, "the page wait did not time out, so this case proves nothing");
  await closeSession(third);
  openHandles.pop();
  await release(third.sessionId);

  const fourth = await openSession("verify-timeout");
  openHandles.push(fourth);
  await visitExample(fourth);
  await assertLoginState(
    fourth,
    { buffy_close: "kept", buffy_drop: "kept", buffy_timeout: "kept" },
    "after timeout",
  );
  await closeSession(fourth);
  openHandles.pop();
  await release(fourth.sessionId);

  assert.ok(timezones.length >= 2, "not enough sessions to compare timezones");
  assert.equal(new Set(timezones).size, 1, `timezone changed between sessions: ${timezones.join(", ")}`);
  log(`stable timezone across sessions: ${timezones[0]}`);

  log("PASS: the context kept the login through close, a dropped connection and a timeout.");
} finally {
  for (const handle of openHandles) {
    await closeSession(handle);
  }
  if (context) {
    await client.contexts.delete(context.id).catch((error) => {
      console.error(`could not delete test context ${context.id}:`, error.message);
    });
  }
}
