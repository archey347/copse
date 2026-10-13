import { join } from "node:path";
import { expect, test } from "bun:test";
import { git, makeUpstream, withSandbox } from "../helpers/fixtures.ts";

function storeDir(sandbox: { root: string; upstreams: Record<string, string> }, name: string): string {
  return join(sandbox.root, "store", "local", `${sandbox.upstreams[name]}.git`);
}

test("cps clone puts a bare clone in the store at the URL's key", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const gitDir = storeDir(sandbox, "api");
    expect((await git(["--git-dir", gitDir, "rev-parse", "--is-bare-repository"], sandbox.root)).trim()).toBe("true");
  });
});

test("branches that existed at clone time live only as origin/*, with HEAD still naming the default", async () => {
  await withSandbox([], async (sandbox) => {
    const upstream = await makeUpstream(join(sandbox.root, "upstreams"), { name: "api" });
    await git(["branch", "feature"], upstream.path);
    expect((await sandbox.cps(["clone", upstream.path])).exitCode).toBe(0);
    const gitDir = storeDir({ root: sandbox.root, upstreams: { api: upstream.path } }, "api");

    const refs = await git(["--git-dir", gitDir, "for-each-ref", "--format=%(refname)"], sandbox.root);
    const names = refs.trim().split("\n");
    expect(names.filter((ref) => ref.startsWith("refs/heads/"))).toEqual([]);
    expect(names).toContain("refs/remotes/origin/feature");
    expect(names).toContain("refs/remotes/origin/main");
    expect((await git(["--git-dir", gitDir, "symbolic-ref", "HEAD"], sandbox.root)).trim()).toBe("refs/heads/main");
  });
});

test("cps clone refuses a repo already in the store", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const result = await sandbox.cps(["clone", sandbox.upstreams.api as string]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("is already in the store");
  });
});

test("a failed clone leaves nothing behind, so it can be re-run", async () => {
  await withSandbox([], async (sandbox) => {
    const missing = join(sandbox.root, "nowhere");
    expect((await sandbox.cps(["clone", missing])).exitCode).not.toBe(0);

    const retried = await sandbox.cps(["clone", missing]);
    expect(retried.stderr).not.toContain("already in the store");
  });
});
