import { join } from "node:path";
import { expect, test } from "bun:test";
import { git, withSandbox } from "../helpers/fixtures.ts";

async function candidates(sandbox: { cps(args: string[]): Promise<{ exitCode: number; stdout: string }> }, words: string[]) {
  const result = await sandbox.cps(["__complete", ...words]);
  expect(result.exitCode).toBe(0);
  return result.stdout.split("\n").filter((line) => line !== "");
}

test("completes subcommand names, filtered by what is typed", async () => {
  await withSandbox([], async (sandbox) => {
    expect(await candidates(sandbox, [""])).toContain("add");
    expect(await candidates(sandbox, ["c"])).toEqual(["clone", "completion"]);
  });
});

test("cps add and cps list complete repo names", async () => {
  await withSandbox(["api", "web"], async (sandbox) => {
    expect(await candidates(sandbox, ["add", ""])).toEqual(["api", "web"]);
    expect(await candidates(sandbox, ["list", "w"])).toEqual(["web"]);
  });
});

test("cps add leaves the path to the shell, then offers branches not checked out anywhere", async () => {
  await withSandbox(["api"], async (sandbox) => {
    const upstream = sandbox.upstreams.api as string;
    await git(["branch", "free"], upstream);
    await git(["branch", "taken"], upstream);
    await sandbox.cps(["add", "api", join(sandbox.root, "wt"), "taken"]);

    expect(await candidates(sandbox, ["add", "api", ""])).toEqual([]);
    expect(await candidates(sandbox, ["add", "api", "wt2", ""])).toEqual(["free", "main"]);
    expect(await candidates(sandbox, ["add", "-b", "x", "api", "wt2", ""])).toEqual([]);
  });
});

test("an unknown repo completes to nothing rather than an error", async () => {
  await withSandbox([], async (sandbox) => {
    expect(await candidates(sandbox, ["add", "nope", "wt", ""])).toEqual([]);
  });
});
