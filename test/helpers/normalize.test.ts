import { expect, test } from "bun:test";
import pc from "picocolors";
import { normalize } from "./normalize.ts";

test("strips ANSI escape codes", () => {
  const colored = "\x1b[32mworktree ready\x1b[0m";

  expect(normalize(colored, [])).toBe("worktree ready");
});

test("replaces a temp root with <tmp>", () => {
  const text = "worktree ready: /tmp/copse-test-abc123/container/feature-a";

  expect(normalize(text, "/tmp/copse-test-abc123")).toBe("worktree ready: <tmp>/container/feature-a");
});

test("replaces multiple temp roots", () => {
  const text = "from /tmp/root-a/x to /tmp/root-b/y";

  expect(normalize(text, ["/tmp/root-a", "/tmp/root-b"])).toBe("from <tmp>/x to <tmp>/y");
});

test("replaces commit hashes with <sha>, after root replacement so a root's own hex-looking suffix survives", () => {
  const text = "HEAD is now at 892cbe6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d init";

  expect(normalize(text, [])).toBe("HEAD is now at <sha> init");
});

test("does not touch a temp root whose random suffix looks like a short hash", () => {
  const text = "root: /tmp/copse-test-abc1234/container";

  expect(normalize(text, "/tmp/copse-test-abc1234")).toBe("root: <tmp>/container");
});

test("guard: picocolors reports colour disabled in the hermetic test env", () => {
  expect(pc.isColorSupported).toBe(false);
});
