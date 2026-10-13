import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { git, withSandbox } from "../helpers/fixtures.ts";

test("removes the worktree and keeps its branch", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    await sandbox.cps(["add", "api", target, "-b", "feature"]);

    const result = await sandbox.cps(["rm", target]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(false);
    const gitDir = join(sandbox.root, "store", "local", `${sandbox.upstreams.api}.git`);
    expect((await git(["--git-dir", gitDir, "branch", "--list", "feature"], sandbox.root)).trim()).toBe("feature");
  });
});

test("refuses a worktree with uncommitted changes", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    await sandbox.cps(["add", "api", target]);
    await writeFile(join(target, "untracked.txt"), "work\n");

    const result = await sandbox.cps(["rm", target]);

    expect(result.exitCode).not.toBe(0);
    expect(existsSync(join(target, "untracked.txt"))).toBe(true);
  });
});

test("refuses the worktree cwd is standing in", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    await sandbox.cps(["add", "api", target]);

    const result = await sandbox.cps(["rm", "."], target);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("you are standing in it");
  });
});

test("clears the entry of a worktree already deleted by hand", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "wt");
    await sandbox.cps(["add", "api", target, "-b", "feature"]);
    await rm(target, { recursive: true });

    expect((await sandbox.cps(["rm", target])).exitCode).toBe(0);
    expect((await sandbox.cps(["list"])).stdout).toBe("api  -  no worktrees\n");
    expect((await sandbox.cps(["add", "api", target, "feature"])).exitCode).toBe(0);
  });
});

test("refuses a path that is no worktree of the store", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const result = await sandbox.cps(["rm", sandbox.root]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("is not a worktree of any repo in the store");
  });
});
