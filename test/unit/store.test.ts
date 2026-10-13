import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { displayName, listRepoKeys, repoKey, resolveRepo } from "../../src/store.ts";
import { type TempRoot, tempRoot } from "../helpers/fixtures.ts";

test("SSH, scp-like and HTTPS URLs of one repo share a key", () => {
  expect(repoKey("git@github.com:org/api.git")).toBe("github.com/org/api");
  expect(repoKey("ssh://git@github.com:22/org/api.git")).toBe("github.com/org/api");
  expect(repoKey("https://github.com/org/api.git")).toBe("github.com/org/api");
  expect(repoKey("https://GitHub.com/org/api/")).toBe("github.com/org/api");
});

test("keeps a nested path's case and every segment", () => {
  expect(repoKey("https://gitlab.example.com/Group/Sub/Api.git")).toBe("gitlab.example.com/Group/Sub/Api");
});

test("local paths and file:// URLs are keyed under local/, resolved against cwd", () => {
  expect(repoKey("/srv/git/api.git")).toBe("local/srv/git/api");
  expect(repoKey("file:///srv/git/api.git")).toBe("local/srv/git/api");
  expect(repoKey("../api", "/srv/git/web")).toBe("local/srv/git/api");
});

test("refuses a URL that would climb out of the store", () => {
  expect(() => repoKey("https://host/org/../../etc")).toThrow("cannot make a store key");
  expect(() => repoKey("https://host")).toThrow("cannot make a store key");
});

let root: TempRoot;
const previousStore = process.env.COPSE_STORE;

beforeEach(async () => {
  root = await tempRoot();
  process.env.COPSE_STORE = join(root.path, "store");
  for (const key of ["github.com/org/api", "github.com/other/api", "github.com/org/web", "a/b", "x/a/b"]) {
    await mkdir(join(root.path, "store", `${key}.git`), { recursive: true });
  }
});

afterEach(async () => {
  if (previousStore === undefined) delete process.env.COPSE_STORE;
  else process.env.COPSE_STORE = previousStore;
  await root.cleanup();
});

test("lists every .git directory in the store as a key", () => {
  expect(listRepoKeys()).toEqual(["a/b", "github.com/org/api", "github.com/org/web", "github.com/other/api", "x/a/b"]);
});

test("a unique whole-segment suffix names a repo", () => {
  expect(resolveRepo("web")).toBe("github.com/org/web");
  expect(resolveRepo("org/api")).toBe("github.com/org/api");
  expect(() => resolveRepo("eb")).toThrow('no repo "eb"');
});

test("an ambiguous name is refused with the candidates, never guessed", () => {
  expect(() => resolveRepo("api")).toThrow('"api" matches several repos: github.com/org/api, github.com/other/api');
});

test("a full key names its repo even when it is a suffix of another", () => {
  expect(resolveRepo("a/b")).toBe("a/b");
});

test("a URL names the repo at its key", () => {
  expect(resolveRepo("git@github.com:org/api.git")).toBe("github.com/org/api");
});

test("displayName is the shortest suffix that still resolves", () => {
  const keys = listRepoKeys();
  expect(displayName("github.com/org/web", keys)).toBe("web");
  expect(displayName("github.com/org/api", keys)).toBe("org/api");
  expect(displayName("a/b", keys)).toBe("a/b");
});
