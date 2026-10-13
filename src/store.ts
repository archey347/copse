import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix, relative, resolve, sep } from "node:path";

export function storeRoot(): string {
  const override = process.env.COPSE_STORE;
  if (override) return resolve(override);
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "copse");
}

export function repoGitDir(key: string): string {
  return join(storeRoot(), `${key}.git`);
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/;
// scp-like `[user@]host:path`: git reads it this way only when no slash comes before the colon.
const SCP = /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/;

export function looksLikeUrl(name: string): boolean {
  return SCHEME.test(name) || SCP.test(name) || /^(\/|\.\.?\/|~)/.test(name);
}

/**
 * SSH and HTTPS clones of one repo must share a key, so user, port and `.git` are dropped;
 * forges serve SSH and HTTPS on different ports (see BRAIN.md, "store keys").
 */
export function repoKey(url: string, cwd: string = process.cwd()): string {
  const scheme = SCHEME.exec(url);
  if (scheme) {
    const rest = scheme[2] ?? "";
    if (scheme[1]?.toLowerCase() === "file") return localKey(rest, cwd);
    const slash = rest.indexOf("/");
    const authority = slash === -1 ? rest : rest.slice(0, slash);
    const host = authority.replace(/^[^@]*@/, "").replace(/:\d*$/, "");
    return joinKey(url, host.toLowerCase(), slash === -1 ? "" : rest.slice(slash));
  }

  const scp = SCP.exec(url);
  if (scp) return joinKey(url, (scp[1] ?? "").toLowerCase(), scp[2] ?? "");

  return localKey(url, cwd);
}

function localKey(path: string, cwd: string): string {
  let absolute = resolve(cwd, path.replace(/^~(?=\/|$)/, homedir()));
  if (existsSync(absolute)) absolute = realpathSync(absolute);
  return joinKey(path, "local", absolute);
}

function joinKey(url: string, host: string, path: string): string {
  const cleaned = path.replace(/\/+$/, "").replace(/\.git$/, "").replace(/^\/+/, "");
  const segments = cleaned.split("/");
  if (host === "" || cleaned === "" || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`cannot make a store key from "${url}"`);
  }
  return posix.join(host, cleaned);
}

/** Every repo in the store, by key; a `.git` directory is a repo, and nothing inside one is. */
export function listRepoKeys(): string[] {
  const root = storeRoot();
  const keys: string[] = [];

  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (entry.name.endsWith(".git")) {
        keys.push(relative(root, path).split(sep).join("/").slice(0, -".git".length));
      } else {
        walk(path);
      }
    }
  };
  walk(root);

  return keys.sort();
}

function matchesName(key: string, name: string): boolean {
  return key === name || key.endsWith(`/${name}`);
}

/** The one repo `name` picks out: a whole-segment suffix of its key, the key itself, or a URL. */
export function resolveRepo(name: string): string {
  const keys = listRepoKeys();
  // A full key can also be a suffix of a longer one, and must still be nameable.
  if (keys.includes(name)) return name;

  const matches = looksLikeUrl(name)
    ? keys.filter((key) => key === repoKey(name))
    : keys.filter((key) => matchesName(key, name.replace(/\/+$/, "")));

  if (matches.length === 1) return matches[0] as string;
  if (matches.length === 0) {
    throw new Error(`no repo "${name}" in the store (${storeRoot()}); add it with cps clone <url>`);
  }
  throw new Error(`"${name}" matches several repos: ${matches.join(", ")}; name one more fully`);
}

/** The shortest suffix of `key` that still picks it out, so what cps prints can be typed back. */
export function displayName(key: string, keys: string[]): string {
  const segments = key.split("/");
  for (let count = 1; count < segments.length; count++) {
    const suffix = segments.slice(-count).join("/");
    if (keys.filter((other) => matchesName(other, suffix)).length === 1) return suffix;
  }
  return key;
}
