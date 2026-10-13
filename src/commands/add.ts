import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import {
  addWorktreeDetached,
  addWorktreeNewBranch,
  addWorktreeOnBranch,
  addWorktreeTracking,
  defaultBranch,
  fetchOrigin,
  resolveRef,
} from "../git.ts";
import { repoGitDir, resolveRepo } from "../store.ts";

export interface AddOptions {
  /** a new branch to create, off the default branch's tip */
  create?: string;
}

export async function addWorktree(name: string, path: string, branch: string | undefined, options: AddOptions): Promise<void> {
  if (branch !== undefined && options.create !== undefined) {
    throw new Error("give either a branch to check out or -b <branch> to create, not both");
  }

  const key = resolveRepo(name);
  const gitDir = repoGitDir(key);
  const target = resolve(path);
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} already exists`);
  }

  // Offline shouldn't block starting work, so carry on from whatever the store already has.
  const fetched = await fetchOrigin(gitDir);
  if (!fetched.ok) {
    process.stderr.write(pc.yellow(`warning: could not fetch ${key}; using what the store already has\n`));
    if (fetched.stderr !== "") process.stderr.write(`${fetched.stderr}\n`);
  }

  const base = `refs/remotes/origin/${await defaultBranch(gitDir)}`;
  const local = async (name: string) => (await resolveRef(gitDir, `refs/heads/${name}`)) !== null;
  const remote = async (name: string) => (await resolveRef(gitDir, `refs/remotes/origin/${name}`)) !== null;

  if (options.create !== undefined) {
    const create = options.create;
    // Forking a same-named local branch beside an existing one leaves it silently diverged
    // from the branch it looks like (see BRAIN.md), so an existing name is a checkout.
    if ((await local(create)) || (await remote(create))) {
      throw new Error(`${key}: branch ${create} already exists; check it out with cps add ${name} ${path} ${create}`);
    }
    await requireRef(gitDir, key, base);
    // No upstream: tracking the default branch would report every feature branch as ahead of it.
    await addWorktreeNewBranch(gitDir, target, create, base);
    console.log(pc.green(`worktree ready: ${target} (new branch ${create})`));
    return;
  }

  if (branch !== undefined) {
    if (await local(branch)) {
      await addWorktreeOnBranch(gitDir, target, branch);
    } else if (await remote(branch)) {
      await addWorktreeTracking(gitDir, target, branch, `refs/remotes/origin/${branch}`);
    } else {
      throw new Error(`${key}: no branch ${branch} locally or on origin; create it with -b ${branch}`);
    }
    console.log(pc.green(`worktree ready: ${target} (on ${branch})`));
    return;
  }

  await requireRef(gitDir, key, base);
  await addWorktreeDetached(gitDir, target, base);
  console.log(pc.green(`worktree ready: ${target} (detached at ${base.replace("refs/remotes/", "")})`));
}

async function requireRef(gitDir: string, key: string, ref: string): Promise<void> {
  if ((await resolveRef(gitDir, ref)) === null) {
    throw new Error(`${key}: ${ref} does not name a commit`);
  }
}
