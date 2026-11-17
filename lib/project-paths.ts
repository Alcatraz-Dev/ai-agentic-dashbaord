/**
 * Which paths the project pane may touch — one rule for the reader, the patch
 * writer and the folder uploader, so they can never disagree.
 *
 * Environment files, key material and git's own folder stay closed. Templates
 * (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`) hold placeholder
 * names rather than secrets and exist to be read, so they do not count as
 * environment files; refusing them produced "That file is not readable here."
 * on the one file whose job is to say which variables a project needs.
 *
 * The message says which rule matched instead of a single dead end, because
 * "not readable" told the owner nothing about whether they picked the wrong
 * file or the pane was wrong.
 */

const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template|dist|defaults?)$/i;
const ENV_FILE = /(^|\/)\.env/i;
const GIT_DIR = /(^|\/)\.git(\/|$)/i;
const BUILD_DIR =
  /(^|\/)(node_modules|\.next|\.turbo|\.vercel|dist|build|coverage)(\/|$)/i;
const KEY_MATERIAL = /\.(pem|key|p12|pfx|keystore|jks)$/i;

/**
 * The reason this relative path stays closed, or null when it may be read.
 * Takes a project-relative path with `/` separators, exactly as it is shown.
 */
export function deniedProjectPath(shown: string): string | null {
  const value = String(shown ?? "").replace(/\\/g, "/");
  if (!value) return null;

  // Checked first: a template is an environment-looking name that is safe.
  if (ENV_TEMPLATE.test(value)) return null;

  if (ENV_FILE.test(value)) {
    return "Environment files stay closed here. A template such as .env.example is readable.";
  }
  if (GIT_DIR.test(value)) {
    return "Git's own folder stays closed here; the Changes tab reads it for you.";
  }
  if (BUILD_DIR.test(value)) {
    return "Dependency and build folders are not opened here.";
  }
  if (KEY_MATERIAL.test(value)) {
    return "Key material stays closed here. Pick a source file instead.";
  }

  return null;
}

/** True when the path stays closed, for filters that only need a yes or no. */
export function isDeniedProjectPath(shown: string): boolean {
  return deniedProjectPath(shown) !== null;
}
