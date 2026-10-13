import { $ } from "bun";
import { expect, test } from "bun:test";
import { run } from "./proc.ts";

test("returns stdout, stderr and exit code", async () => {
  const result = await run(["sh", "-c", "echo out; echo err >&2; exit 3"], { cwd: process.cwd() });

  expect(result.stdout).toBe("out\n");
  expect(result.stderr).toBe("err\n");
  expect(result.exitCode).toBe(3);
});

test("passes overrides through to the child, on top of the current process env", async () => {
  const result = await run(["sh", "-c", "echo $COPSE_TEST_VAR"], {
    cwd: process.cwd(),
    env: { COPSE_TEST_VAR: "hello" },
  });

  expect(result.stdout).toBe("hello\n");
});

test("does not inherit stdin: a child reading it sees EOF instead of blocking", async () => {
  const result = await run(["cat"], { cwd: process.cwd() });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("");
});

test("kills a child that outlives its timeout and names the command in the error", async () => {
  await expect(run(["sleep", "5"], { cwd: process.cwd(), timeoutMs: 100 })).rejects.toThrow(/sleep 5/);
});

test("guard: through run(), git sees no global gpgsign config", async () => {
  const result = await run(["git", "config", "--global", "--get", "commit.gpgsign"], { cwd: process.cwd() });

  expect(result.stdout).toBe("");
});

test("guard: through Bun's $, git sees no global gpgsign config", async () => {
  const result = await $`git config --global --get commit.gpgsign`.nothrow().quiet();

  expect(result.stdout.toString()).toBe("");
});

test("an undefined override unsets a variable the current env has", async () => {
  const result = await run(["sh", "-c", 'printf %s "${NO_COLOR-unset}"'], { cwd: "/", env: { NO_COLOR: undefined } });
  expect(result.stdout).toBe("unset");
});
