import { existsSync } from "node:fs";
import pc from "picocolors";
import { cloneBare } from "../git.ts";
import { repoGitDir, repoKey } from "../store.ts";

export async function cloneRepo(url: string): Promise<void> {
  const key = repoKey(url);
  const gitDir = repoGitDir(key);
  if (existsSync(gitDir)) {
    throw new Error(`${key} is already in the store, at ${gitDir}`);
  }

  await cloneBare(url, gitDir);
  console.log(pc.green(`cloned ${key}`));
}
