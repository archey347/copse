#!/usr/bin/env bun
import { $ } from "bun";
import { Command } from "commander";
import { addWorktree } from "./commands/add.ts";
import { cloneRepo } from "./commands/clone.ts";
import { listWorktrees } from "./commands/list.ts";
import { rmWorktree } from "./commands/rm.ts";
import { COMPLETION_SHELLS, type Shell, complete, completionScript } from "./completion.ts";

const program = new Command();

program
  .name("cps")
  .description("one global store of bare clones, with worktrees of them anywhere");

program
  .command("clone")
  .description("Bare-clone <url> into the store, keyed by its host and path. Makes no worktree.")
  .argument("<url>")
  .action(async (url: string) => {
    await cloneRepo(url);
  });

program
  .command("add")
  .description(
    "Create a worktree of <repo> at <path>: on <branch> if given (local, else from origin with " +
      "tracking), on a new branch with -b, or else detached at origin's default branch.",
  )
  .argument("<repo>", "any unique suffix of the repo's host/path, e.g. api or org/api")
  .argument("<path>")
  .argument("[branch]")
  .option("-b, --new-branch <branch>", "create <branch> off origin's default branch")
  .action(async (repo: string, path: string, branch: string | undefined, options: { newBranch?: string }) => {
    await addWorktree(repo, path, branch, { create: options.newBranch });
  });

program
  .command("list")
  .description("List every worktree in the store, or only <repo>'s.")
  .argument("[repo]")
  .action(async (repo: string | undefined) => {
    await listWorktrees(repo);
  });

program
  .command("rm")
  .description("Remove the worktree at <path>. Its branch, if any, is kept.")
  .argument("<path>")
  .action(async (path: string) => {
    await rmWorktree(path);
  });

program
  .command("completion")
  .description(`Print a shell completion script for cps. Supported shells: ${COMPLETION_SHELLS.join(", ")}.`)
  .argument("<shell>", COMPLETION_SHELLS.join(" | "))
  .action((shell: string) => {
    if (!(COMPLETION_SHELLS as readonly string[]).includes(shell)) {
      throw new Error(`unsupported shell "${shell}"; try ${COMPLETION_SHELLS.join(" or ")}`);
    }
    process.stdout.write(completionScript(shell as Shell));
  });

// Called by the completion scripts, never by hand: the last word is the partial one being
// completed, empty when the line ends in a space. `--` can't mark it — commander eats it.
program
  .command("__complete", { hidden: true })
  .allowUnknownOption()
  .argument("[words...]")
  .action(async (words: string[]) => {
    const current = words.at(-1) ?? "";
    const typed = words.slice(0, -1);
    const commands = program.commands.map((command) => command.name()).filter((name) => !name.startsWith("__"));

    // A completion that errors would spray onto the user's command line, so stay silent.
    try {
      const candidates = await complete(commands, typed, current);
      if (candidates.length > 0) process.stdout.write(`${candidates.join("\n")}\n`);
    } catch {}
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof $.ShellError) {
    // git already printed its own error to the terminal.
    process.exit(err.exitCode ?? 1);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
