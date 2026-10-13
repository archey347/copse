import pc from "picocolors";
import { listWorktreeEntries } from "../git.ts";
import { displayName, listRepoKeys, repoGitDir, resolveRepo } from "../store.ts";

interface Row {
  repo: string;
  path: string;
  state: string;
}

export async function listWorktrees(name?: string): Promise<void> {
  const keys = listRepoKeys();
  const selected = name === undefined ? keys : [resolveRepo(name)];

  const rows: Row[] = [];
  for (const key of selected) {
    const repo = displayName(key, keys);
    const entries = (await listWorktreeEntries(repoGitDir(key))).filter((entry) => !entry.bare);
    // A placeholder path keeps every line at three fields for scripts splitting on whitespace.
    if (entries.length === 0) rows.push({ repo, path: "-", state: pc.dim("no worktrees") });
    for (const entry of entries) {
      rows.push({ repo, path: entry.path, state: describe(entry) });
    }
  }

  const repoWidth = Math.max(0, ...rows.map((row) => row.repo.length));
  const pathWidth = Math.max(0, ...rows.map((row) => row.path.length));
  for (const row of rows) {
    console.log(`${row.repo.padEnd(repoWidth)}  ${row.path.padEnd(pathWidth)}  ${row.state}`);
  }
}

function describe(entry: { head: string | null; branch: string | null; prunable: boolean }): string {
  if (entry.prunable) return pc.yellow("missing");
  const head = (entry.head ?? "").slice(0, 7);
  if (entry.branch !== null) return `on ${entry.branch.replace(/^refs\/heads\//, "")} @ ${head}`;
  return `detached @ ${head}`;
}
