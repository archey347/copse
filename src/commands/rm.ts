import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import pc from "picocolors";
import { listWorktreeEntries, removeWorktreeIn } from "../git.ts";
import { listRepoKeys, repoGitDir } from "../store.ts";

// git prints worktree paths resolved, so a path reached through a symlink wouldn't match.
function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export async function rmWorktree(path: string): Promise<void> {
  const target = realpathOr(resolve(path));

  let found: { gitDir: string; path: string } | null = null;
  for (const key of listRepoKeys()) {
    const gitDir = repoGitDir(key);
    const entry = (await listWorktreeEntries(gitDir)).find((entry) => !entry.bare && realpathOr(entry.path) === target);
    if (entry !== undefined) {
      found = { gitDir, path: entry.path };
      break;
    }
  }
  if (found === null) {
    throw new Error(`${target} is not a worktree of any repo in the store`);
  }

  if (existsSync(target)) {
    const fromTarget = relative(target, realpathOr(process.cwd()));
    if (!fromTarget.startsWith("..") && !isAbsolute(fromTarget)) {
      throw new Error(`refusing to remove ${target}: you are standing in it`);
    }
  }

  // Branches stay: their commits in the store are the one thing worth keeping.
  await removeWorktreeIn(found.gitDir, found.path);
  console.log(pc.green(`worktree removed: ${target}`));
}
