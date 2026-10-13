import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests must never read the real git config (it signs commits) or touch the real store or ~/.config.

const sessionHome = mkdtempSync(join(tmpdir(), "copse-test-home-"));
// "exit" handlers never fire in a bun test preload; a global afterAll runs once, after every file.
afterAll(() => rmSync(sessionHome, { recursive: true, force: true }));

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "copse test",
  GIT_AUTHOR_EMAIL: "copse-test@example.com",
  GIT_COMMITTER_NAME: "copse test",
  GIT_COMMITTER_EMAIL: "copse-test@example.com",
  // A fetch must fail fast rather than hang on a credential prompt.
  GIT_TERMINAL_PROMPT: "0",
  HOME: sessionHome,
  XDG_CONFIG_HOME: join(sessionHome, ".config"),
  XDG_DATA_HOME: join(sessionHome, ".local", "share"),
  // picocolors lets NO_COLOR win over a TTY, CI and FORCE_COLOR, so output is plain in every test.
  NO_COLOR: "1",
});
delete process.env.FORCE_COLOR;
delete process.env.CI;
