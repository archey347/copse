import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { advanceUpstream, git, makeUpstream, withSandbox } from "../helpers/fixtures.ts";

function headRef(worktree: string): Promise<string> {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], worktree).then((out) => out.trim());
}

function sha(dir: string, ref = "HEAD"): Promise<string> {
  return git(["rev-parse", ref], dir).then((out) => out.trim());
}

test("with no branch, the worktree is detached at origin's default tip", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "anywhere", "api-scratch");
    const result = await sandbox.cps(["add", "api", target]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("detached at origin/main");
    expect(await headRef(target)).toBe("HEAD");
    expect(await sha(target)).toBe(await sha(sandbox.upstreams.api as string));
  });
});

test("the worktree's link to the store is absolute", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    await sandbox.cps(["add", "api", target]);

    expect(readFileSync(join(target, ".git"), "utf8")).toStartWith(`gitdir: ${sandbox.root}/store/`);
  });
});

test("fetches first, so a new worktree starts from the latest upstream commit", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const advanced = await advanceUpstream({ path: sandbox.upstreams.api as string });
    const target = join(sandbox.root, "wt");

    await sandbox.cps(["add", "api", target]);
    expect(await sha(target)).toBe(advanced);
  });
});

test("a failed fetch warns and carries on from what the store has", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const gitDir = join(sandbox.root, "store", "local", `${sandbox.upstreams.api}.git`);
    await git(["--git-dir", gitDir, "remote", "set-url", "origin", join(sandbox.root, "gone")], sandbox.root);

    const result = await sandbox.cps(["add", "api", join(sandbox.root, "wt")]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("could not fetch");
  });
});

test("a branch only on origin is checked out as a local branch tracking it", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const upstream = sandbox.upstreams.api as string;
    await git(["checkout", "-q", "-b", "colleague"], upstream);
    await git(["commit", "-q", "--allow-empty", "-m", "their work"], upstream);
    const theirs = await sha(upstream);
    await git(["checkout", "-q", "main"], upstream);

    const target = join(sandbox.root, "wt");
    const result = await sandbox.cps(["add", "api", target, "colleague"]);

    expect(result.exitCode).toBe(0);
    expect(await headRef(target)).toBe("colleague");
    expect(await sha(target)).toBe(theirs);
    expect((await git(["rev-parse", "--abbrev-ref", "@{u}"], target)).trim()).toBe("origin/colleague");
  });
});

test("an existing local branch is reused, e.g. after its worktree was removed", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const first = join(sandbox.root, "first");
    await sandbox.cps(["add", "api", first, "-b", "mine"]);
    await git(["commit", "-q", "--allow-empty", "-m", "local work"], first);
    const work = await sha(first);
    await sandbox.cps(["rm", first]);

    const second = join(sandbox.root, "second");
    const result = await sandbox.cps(["add", "api", second, "mine"]);

    expect(result.exitCode).toBe(0);
    expect(await sha(second)).toBe(work);
  });
});

test("a branch that exists nowhere is refused, pointing at -b", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const result = await sandbox.cps(["add", "api", join(sandbox.root, "wt"), "nope"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no branch nope locally or on origin; create it with -b nope");
  });
});

test("-b creates a branch off origin's default tip, with no upstream", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    const result = await sandbox.cps(["add", "api", target, "-b", "feature"]);

    expect(result.exitCode).toBe(0);
    expect(await headRef(target)).toBe("feature");
    expect(await sha(target)).toBe(await sha(sandbox.upstreams.api as string));
    const upstream = await git(["rev-parse", "--abbrev-ref", "@{u}"], target).catch(() => "none");
    expect(upstream).toBe("none");
  });
});

test("-b refuses a name that already exists on origin, rather than forking beside it", async () => {
  await withSandbox(["api"], async (sandbox) => {
    await git(["branch", "colleague"], sandbox.upstreams.api as string);

    const result = await sandbox.cps(["add", "api", join(sandbox.root, "wt"), "-b", "colleague"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("branch colleague already exists");
  });
});

test("refuses a path that already holds files", async () => {
  await withSandbox(["api"], async (sandbox) => {
    await writeFile(join(sandbox.root, "occupied"), "");
    const result = await sandbox.cps(["add", "api", sandbox.root]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("already exists");
  });
});

test("an ambiguous repo name is refused", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const other = await makeUpstream(join(sandbox.root, "elsewhere"), { name: "api" });
    await sandbox.cps(["clone", other.path]);

    const result = await sandbox.cps(["add", "api", join(sandbox.root, "wt")]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"api" matches several repos');
  });
});
