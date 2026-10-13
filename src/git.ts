import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { $ } from "bun";

/**
 * Only this module invokes git — keeps the VCS swappable later (see BRAIN.md).
 */

async function text(command: ReturnType<typeof $>): Promise<string> {
  try {
    return (await command.text()).trim();
  } catch (err) {
    // .text() buffers stderr instead of streaming it, so forward it by hand.
    if (err instanceof $.ShellError) process.stderr.write(err.stderr.toString());
    throw err;
  }
}

const FETCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

/**
 * Built under a temporary name and renamed into place last, so a clone that fails partway
 * leaves nothing that makes a re-run refuse with "already in the store".
 */
export async function cloneBare(url: string, gitDir: string): Promise<void> {
  const partial = `${gitDir}.partial`;
  if (existsSync(partial)) await rm(partial, { recursive: true, force: true });

  await $`git clone --bare -q ${url} ${partial}`;
  // `git clone --bare` sets up neither a fetch refspec nor origin/* refs (see BRAIN.md).
  await $`git --git-dir ${partial} config remote.origin.fetch ${FETCH_REFSPEC}`;
  await $`git --git-dir ${partial} config fetch.prune true`;
  await $`git --git-dir ${partial} fetch -q origin`;

  // The local copies of remote branches never move again, so origin/* is the only record kept.
  const format = "%(refname)";
  const locals = await text($`git --git-dir ${partial} for-each-ref --format=${format} refs/heads`);
  for (const ref of locals.split("\n").filter((line) => line !== "")) {
    await $`git --git-dir ${partial} update-ref -d ${ref}`;
  }

  await rename(partial, gitDir);
}

export async function fetchOrigin(gitDir: string): Promise<{ ok: boolean; stderr: string }> {
  const result = await $`git --git-dir ${gitDir} fetch -q origin`.nothrow().quiet();
  return { ok: result.exitCode === 0, stderr: result.stderr.toString().trim() };
}

// HEAD dangles once the local branches are gone, but still names the default branch.
export async function defaultBranch(gitDir: string): Promise<string> {
  return text($`git --git-dir ${gitDir} symbolic-ref --short HEAD`);
}

export async function resolveRef(gitDir: string, ref: string): Promise<string | null> {
  const result = await $`git --git-dir ${gitDir} rev-parse --verify -q ${`${ref}^{commit}`}`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  return result.stdout.toString().trim();
}

export async function addWorktreeDetached(gitDir: string, target: string, ref: string): Promise<void> {
  await $`git --git-dir ${gitDir} worktree add -q --detach ${target} ${ref}`;
}

export async function addWorktreeOnBranch(gitDir: string, target: string, branch: string): Promise<void> {
  await $`git --git-dir ${gitDir} worktree add -q ${target} ${branch}`;
}

export async function addWorktreeTracking(gitDir: string, target: string, branch: string, remoteRef: string): Promise<void> {
  await $`git --git-dir ${gitDir} worktree add -q --track -b ${branch} ${target} ${remoteRef}`;
}

export async function addWorktreeNewBranch(gitDir: string, target: string, branch: string, from: string): Promise<void> {
  await $`git --git-dir ${gitDir} worktree add -q --no-track -b ${branch} ${target} ${from}`;
}

// No --force: git itself refuses when the worktree has uncommitted changes.
export async function removeWorktreeIn(gitDir: string, target: string): Promise<void> {
  await $`git --git-dir ${gitDir} worktree remove ${target}`;
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  /** full ref, e.g. refs/heads/main; null when detached or bare */
  branch: string | null;
  bare: boolean;
  /** its directory is gone, but git still has it registered */
  prunable: boolean;
}

export async function listWorktreeEntries(gitDir: string): Promise<WorktreeEntry[]> {
  const out = await text($`git --git-dir ${gitDir} worktree list --porcelain`);

  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), head: null, branch: null, bare: false, prunable: false };
      entries.push(current);
    } else if (current === null) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
    }
  }

  return entries;
}

/** Short names of every branch that exists, local or on origin, deduped. */
export async function listBranchNames(gitDir: string): Promise<string[]> {
  // Interpolated, not inline: Bun's shell parses a literal "(" in the template as syntax.
  const format = "%(refname)";
  const out = await text($`git --git-dir ${gitDir} for-each-ref --format=${format} refs/heads refs/remotes/origin`);

  const names = new Set<string>();
  for (const line of out.split("\n")) {
    const ref = line.trim();
    if (ref === "" || ref === "refs/remotes/origin/HEAD") continue;
    names.add(ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/origin\//, ""));
  }
  return [...names].sort();
}
