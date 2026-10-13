import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { advanceUpstream, git, makeUpstream, tempRoot } from "./fixtures.ts";

test("tempRoot creates an empty dir and cleanup removes it", async () => {
  const root = await tempRoot();
  expect(existsSync(root.path)).toBe(true);

  await root.cleanup();
  expect(existsSync(root.path)).toBe(false);
});

test("COPSE_TEST_KEEP=1 keeps the temp root instead of removing it", async () => {
  const previous = process.env.COPSE_TEST_KEEP;
  process.env.COPSE_TEST_KEEP = "1";
  const root = await tempRoot();
  try {
    await root.cleanup();
    expect(existsSync(root.path)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.COPSE_TEST_KEEP;
    else process.env.COPSE_TEST_KEEP = previous;
    await rm(root.path, { recursive: true, force: true });
  }
});

test("makeUpstream commits the given files on main", async () => {
  const root = await tempRoot();
  try {
    const upstream = await makeUpstream(root.path, { files: { "README.md": "hello\n" } });

    expect((await git(["branch", "--show-current"], upstream.path)).trim()).toBe("main");
    expect((await git(["show", "HEAD:README.md"], upstream.path)).trim()).toBe("hello");
  } finally {
    await root.cleanup();
  }
});

test("advanceUpstream moves the remote ahead of a clone until it fetches", async () => {
  const root = await tempRoot();
  try {
    const upstream = await makeUpstream(root.path);
    const clone = join(root.path, "clone");
    await git(["clone", "-q", upstream.path, clone], root.path);
    const before = (await git(["rev-parse", "origin/main"], clone)).trim();

    const upstreamHead = await advanceUpstream(upstream);
    expect((await git(["rev-parse", "origin/main"], clone)).trim()).toBe(before);

    await git(["fetch", "-q", "origin"], clone);
    expect((await git(["rev-parse", "origin/main"], clone)).trim()).toBe(upstreamHead);
  } finally {
    await root.cleanup();
  }
});
