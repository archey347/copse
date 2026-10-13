import { expect, test } from "bun:test";
import { run } from "./proc.ts";
import { tempRoot } from "./fixtures.ts";
import { makeFakeBinDir } from "./fake-bin.ts";

test("a fake bin shadows the real command, returns its scripted output, and records argv", async () => {
  const root = await tempRoot();
  try {
    const binDir = await makeFakeBinDir(root.path);
    const systemctl = await binDir.fakeBin("systemctl", { exitCode: 7, stdout: "fake output\n" });

    const result = await run(["systemctl", "--user", "start", "copse-thing.service"], {
      cwd: root.path,
      env: binDir.env,
    });

    expect(result.exitCode).toBe(7);
    expect(result.stdout).toBe("fake output\n");
    expect(await systemctl.calls()).toEqual([["--user", "start", "copse-thing.service"]]);
  } finally {
    await root.cleanup();
  }
});

test("records each call separately, in order", async () => {
  const root = await tempRoot();
  try {
    const binDir = await makeFakeBinDir(root.path);
    const systemctl = await binDir.fakeBin("systemctl");

    await run(["systemctl", "start", "a"], { cwd: root.path, env: binDir.env });
    await run(["systemctl", "stop", "a"], { cwd: root.path, env: binDir.env });

    expect(await systemctl.calls()).toEqual([["start", "a"], ["stop", "a"]]);
  } finally {
    await root.cleanup();
  }
});

test("real git, sh and bun still resolve alongside a fake bin", async () => {
  const root = await tempRoot();
  try {
    const binDir = await makeFakeBinDir(root.path);
    await binDir.fakeBin("systemctl");

    const gitVersion = await run(["git", "--version"], { cwd: root.path, env: binDir.env });
    const sh = await run(["sh", "-c", "echo ok"], { cwd: root.path, env: binDir.env });
    const bunVersion = await run(["bun", "--version"], { cwd: root.path, env: binDir.env });

    expect(gitVersion.exitCode).toBe(0);
    expect(sh.stdout).toBe("ok\n");
    expect(bunVersion.exitCode).toBe(0);
  } finally {
    await root.cleanup();
  }
});
