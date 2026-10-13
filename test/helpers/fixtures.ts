import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCps } from "./cli.ts";
import { type RunResult, run } from "./proc.ts";

async function git(args: string[], cwd: string): Promise<string> {
  const result = await run(["git", ...args], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} (in ${cwd}) failed:\n${result.stderr}`);
  }
  return result.stdout;
}

export interface TempRoot {
  path: string;
  cleanup(): Promise<void>;
}

/**
 * /tmp is tmpfs on this machine, so a future reflink test needs its root under /home
 * (btrfs) instead — tmpfs would exercise only the non-reflink fallback.
 */
export async function tempRoot(prefix = "copse-test-"): Promise<TempRoot> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    async cleanup() {
      if (process.env.COPSE_TEST_KEEP === "1") {
        console.log(`COPSE_TEST_KEEP=1: kept ${path}`);
        return;
      }
      await rm(path, { recursive: true, force: true });
    },
  };
}

export interface Upstream {
  path: string;
}

export interface MakeUpstreamOptions {
  /** relative path -> contents, written and committed as the initial commit */
  files?: Record<string, string>;
  /** directory name under `root`; defaults to "upstream" */
  name?: string;
}

export async function makeUpstream(root: string, opts: MakeUpstreamOptions = {}): Promise<Upstream> {
  await mkdir(root, { recursive: true });
  const path = join(root, opts.name ?? "upstream");
  await git(["init", "-q", "-b", "main", path], root);

  for (const [rel, contents] of Object.entries(opts.files ?? {})) {
    await writeFile(join(path, rel), contents);
  }
  if (Object.keys(opts.files ?? {}).length > 0) {
    await git(["add", "."], path);
  }
  await git(["commit", "-q", "--allow-empty", "-m", "init"], path);

  return { path };
}

/** Advances upstream's current branch, simulating a fetch target that moved past the local base. */
export async function advanceUpstream(upstream: Upstream, message = "upstream advance"): Promise<string> {
  await git(["commit", "-q", "--allow-empty", "-m", message], upstream.path);
  return (await git(["rev-parse", "HEAD"], upstream.path)).trim();
}

export { git };

/**
 * A store of the test's own: the session-wide default would be shared by every test, and
 * each test's `api` would make the short name ambiguous for the next.
 */
export function storeEnv(root: string): { COPSE_STORE: string } {
  return { COPSE_STORE: join(root, "store") };
}

export interface Sandbox {
  root: string;
  env: { COPSE_STORE: string };
  /** repo name -> upstream path */
  upstreams: Record<string, string>;
  cps(args: string[], cwd?: string): Promise<RunResult>;
}

/** Upstreams under `<root>/upstreams/<name>`, each already cloned into the sandbox's store. */
export async function withSandbox(repos: string[], fn: (sandbox: Sandbox) => Promise<void>): Promise<void> {
  const root = await tempRoot();
  try {
    const env = storeEnv(root.path);
    const cps = (args: string[], cwd = root.path) => runCps(args, { cwd, env });

    const upstreams: Record<string, string> = {};
    for (const name of repos) {
      upstreams[name] = (await makeUpstream(join(root.path, "upstreams"), { name })).path;
      const cloned = await cps(["clone", upstreams[name] as string]);
      if (cloned.exitCode !== 0) throw new Error(`cps clone failed:\n${cloned.stderr}`);
    }

    await fn({ root: root.path, env, upstreams, cps });
  } finally {
    await root.cleanup();
  }
}
