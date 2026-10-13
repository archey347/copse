import { listBranchNames, listWorktreeEntries } from "./git.ts";
import { displayName, listRepoKeys, repoGitDir, resolveRepo } from "./store.ts";

export const COMPLETION_SHELLS = ["bash", "zsh"] as const;
export type Shell = (typeof COMPLETION_SHELLS)[number];

const VALUE_FLAGS = new Set(["-b", "--new-branch"]);

export async function complete(commands: string[], words: string[], current: string): Promise<string[]> {
  const candidates = await candidatesFor(commands, words, current);
  return candidates.filter((candidate) => candidate.startsWith(current)).sort();
}

function positionals(words: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (VALUE_FLAGS.has(word)) i++;
    else if (!word.startsWith("-")) result.push(word);
  }
  return result;
}

// An empty result makes the shell fall back to filenames, which is what a path wants.
async function candidatesFor(commands: string[], words: string[], current: string): Promise<string[]> {
  const positional = positionals(words);
  const subcommand = positional[0];
  if (subcommand === undefined) return commands;
  const args = positional.slice(1);

  switch (subcommand) {
    case "add":
      if (VALUE_FLAGS.has(words.at(-1) ?? "")) return [];
      if (current.startsWith("-")) return ["-b"];
      if (args.length === 0) return repoNames();
      if (args.length === 2 && !words.some((word) => VALUE_FLAGS.has(word))) return freeBranches(args[0] as string);
      return [];
    case "list":
      return args.length === 0 ? repoNames() : [];
    case "completion":
      return [...COMPLETION_SHELLS];
    default:
      return [];
  }
}

function repoNames(): string[] {
  const keys = listRepoKeys();
  return keys.map((key) => displayName(key, keys));
}

// A branch checked out in another worktree is one git refuses, so never offer it.
async function freeBranches(name: string): Promise<string[]> {
  const gitDir = repoGitDir(resolveRepo(name));
  const [names, entries] = await Promise.all([listBranchNames(gitDir), listWorktreeEntries(gitDir)]);
  const taken = new Set(entries.map((entry) => entry.branch?.replace(/^refs\/heads\//, "")).filter((b) => b != null));
  return names.filter((name) => !taken.has(name));
}

/**
 * Both scripts rebuild the words from COMP_LINE rather than the shell's own split, because
 * bash breaks words on ":", which scp-style URLs contain.
 */
export function completionScript(shell: Shell): string {
  if (shell === "zsh") {
    return `#compdef cps
_cps() {
  local -a cands
  cands=(\${(f)"\$(cps __complete \${words[2,CURRENT-1]} -- \${words[CURRENT]} 2>/dev/null)"})
  if (( \$#cands )); then compadd -- \$cands; else _files; fi
}
compdef _cps cps
`;
  }

  return `_cps() {
  local line=\${COMP_LINE:0:COMP_POINT}
  local words=(\$line) cur=""
  if [[ \$line != *[[:space:]] ]]; then
    cur=\${words[-1]}
    unset 'words[-1]'
  fi

  local IFS=\$'\\n'
  COMPREPLY=(\$(cps __complete "\${words[@]:1}" -- "\$cur" 2>/dev/null))

  # bash splits the word on ":", so give back only the part after the last one.
  if [[ \$cur == *:* ]]; then
    local head=\${cur%"\${cur##*:}"}
    COMPREPLY=("\${COMPREPLY[@]#"\$head"}")
  fi
  return 0
}
complete -o default -F _cps cps
`;
}
