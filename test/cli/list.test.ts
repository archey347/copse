import { rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { withSandbox } from "../helpers/fixtures.ts";
import { normalize } from "../helpers/normalize.ts";

test("lists every worktree in the store, by each repo's shortest name", async () => {
  await withSandbox(["api", "web"], async (sandbox) => {
    await sandbox.cps(["add", "api", join(sandbox.root, "a1"), "-b", "feature"]);
    await sandbox.cps(["add", "api", join(sandbox.root, "a2")]);
    await sandbox.cps(["add", "web", join(sandbox.root, "w1")]);

    const result = await sandbox.cps(["list"]);

    expect(result.exitCode).toBe(0);
    expect(normalize(result.stdout, sandbox.root).split("\n")).toEqual([
      "api  <tmp>/a1  on feature @ <sha>",
      "api  <tmp>/a2  detached @ <sha>",
      "web  <tmp>/w1  detached @ <sha>",
      "",
    ]);
  });
});

test("cps list <repo> shows only that repo's worktrees", async () => {
  await withSandbox(["api", "web"], async (sandbox) => {
    await sandbox.cps(["add", "api", join(sandbox.root, "a1")]);
    await sandbox.cps(["add", "web", join(sandbox.root, "w1")]);

    const result = await sandbox.cps(["list", "web"]);
    expect(normalize(result.stdout, sandbox.root)).toBe("web  <tmp>/w1  detached @ <sha>\n");
  });
});

test("a worktree deleted by hand shows as missing", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const target = join(sandbox.root, "gone");
    await sandbox.cps(["add", "api", target]);
    await rm(target, { recursive: true });

    const result = await sandbox.cps(["list"]);
    expect(normalize(result.stdout, sandbox.root)).toBe("api  <tmp>/gone  missing\n");
  });
});

test("a repo with no worktrees still gets a line", async () => {
  await withSandbox(["api", "web"], async (sandbox) => {
    await sandbox.cps(["add", "api", join(sandbox.root, "a1")]);

    const result = await sandbox.cps(["list"]);
    const lines = normalize(result.stdout, sandbox.root).split("\n").map((line) => line.replace(/ +/g, " "));
    expect(lines).toEqual(["api <tmp>/a1 detached @ <sha>", "web - no worktrees", ""]);
    expect((await sandbox.cps(["list", "web"])).stdout).toBe("web  -  no worktrees\n");
  });
});
