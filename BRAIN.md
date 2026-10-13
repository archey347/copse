# copse — ideas & constraints

## What it is
One bare clone of every repo you work on, in a global store, and worktrees of
any of them anywhere on the machine — with repos nameable from anywhere
(`cps add api ~/scratch/hotfix`). That is all copse does: dev-environment
work — setup, services, ports — is out of scope.

Other tools may build on the store, so its conventions — layout, key
normalisation, the bare-clone fixes, later the following hook — live in one
importable module (`src/store.ts`) rather than being re-implemented by each.

## Terminology

- **store** — the directory holding every bare clone.
- **repo key** — a repo's normalised `host/path`, e.g. `github.com/org/api`;
  also its path in the store, plus `.git`.
- **repo name** — anything that picks out one repo key: a unique suffix
  (`api`, `org/api`), the full key, or a URL.
- **worktree** — a checkout of a store repo, anywhere on disk.
- **following** (not built) — a detached worktree tracking a ref, moved to its
  new tip whenever the ref moves.

## Layout
```
~/.local/share/copse/            the store: $COPSE_STORE, else $XDG_DATA_HOME/copse
  github.com/org/api.git         one bare clone per repo, at its key
  local/home/me/src/tool.git     a clone of a local path
```
Worktrees go wherever `cps add` is told to put them.

## Constraints
- `copse` must not know anything project-specific — no bun/nuxt/db
  assumptions. That lives in the repos.
- **The store is global state, deliberately.** This reverses the old rule that
  copse is cwd-sensitive like git, with no `--repo` flag and no global state:
  naming a repo from anywhere is the whole point now. Commands name their repo
  explicitly; nothing is inferred from cwd yet.
- **Derive state from git and the filesystem, don't keep a ledger.** Which
  repos exist is the store's directories; which worktrees exist is
  `git worktree list` of each. copse writes no index of either — one would
  drift the first time someone runs `git worktree remove` by hand.
- Commands should be safe to re-run / fail loudly rather than silently
  clobber.
- Bun is the only hard runtime dependency.
- **The VCS must be easily swappable.** copse needs only a handful of
  operations from it. Keep every git call in `src/git.ts` so a jj backend stays
  possible. Design the *semantics* in jj's terms, since its model is a superset
  of git's (non-exclusive working copies, non-blocking conflicts, stable change
  IDs), and implement git first. Don't build the abstraction itself until there
  is a second implementation to justify it. See `proposals/jujutsu-backend.md`
  — jj's `jj workspace add <path>` is the same shape as a store plus worktrees
  anywhere.

## Decided: store keys are normalised `host/path`

`git@github.com:org/api.git`, `ssh://git@github.com/org/api` and
`https://github.com/org/api.git` are all `github.com/org/api`. The user and
port are dropped, the host lowercased, and `.git` and trailing slashes
stripped. The path's case is kept: GitHub ignores it, other hosts don't.

SSH and HTTPS clones of one repo must be one repo; keying the store by raw URL
would clone the same repo twice. The port goes too because forges serve SSH
and HTTPS on different ports for the same repo; two different repos on one
host told apart only by port is rare enough to accept.

Local paths and `file://` URLs are keyed `local/<absolute path>`, resolved
against cwd, so a clone of a local repo is still one store entry.

## Decided: repos are named by any unique suffix

A repo name matches a key when it equals it or is a whole-segment suffix of it
(`api` and `org/api` both match `github.com/org/api`; `pi` doesn't). A URL is
normalised first and must match exactly. More than one match is refused with
the candidates listed — never guessed, since picking the wrong repo silently is
the one outcome worse than an error. `cps list` shows each repo by its shortest
unique suffix, so what it prints can be typed back.

In `cps add` the repo is a required positional, never inferred from cwd: a
positional that sometimes means a repo and sometimes something else changes
meaning under you.

## Decided: clones hold no local branches

`git clone --bare` copies every remote branch into a local branch that never
moves again (verified 2026-09-13). So `cps clone` deletes every local branch
after fetching, leaving `origin/*` as the only record of remote branches. HEAD
stays a symref to the default branch even though it now dangles, which is how
copse knows the default; git accepts a dangling HEAD in a bare repo and adds
worktrees from it fine (verified 2026-09-26, git 2.55).

The other bare-clone fixes still apply: set `remote.origin.fetch` to
`+refs/heads/*:refs/remotes/origin/*` and fetch, since `git clone --bare`
creates neither the refspec nor any `origin/*` refs (verified). `fetch.prune`
is on, so branches deleted upstream leave the store too.

## Decided: worktree links are absolute

Relative links only help when the store and its worktrees move together; they
live in unrelated places, so relative buys nothing, whereas absolute at least
means only the store must stay put. copse passes no flag, so git's default
(absolute) applies unless the user has `worktree.useRelativePaths` set
themselves. That also drops the git ≥ 2.48 requirement `--relative-paths` had.

Moving a worktree is `git worktree move`, or a plain `mv` then
`git worktree repair` in it. Moving the store breaks every worktree until
`git worktree repair` runs in each.

## Current commands

- `cps clone <url>` — bare-clone into the store at the URL's key, with the
  fixes above. Refuses a repo already in the store. Makes no worktree.
- `cps add <repo> <path> [<branch>]` — create a worktree of `<repo>` at
  `<path>`, after fetching the repo:
  - no branch — detached at `origin/<default>`.
  - `<branch>` — the local branch if there is one, else a local branch from
    `origin/<branch>` with tracking, else refused pointing at `-b`.
  - `-b <branch>` — a new branch off `origin/<default>`, refusing a name that
    exists locally *or* on origin, because forking a same-named local branch
    beside a remote one silently diverges from it (verified 2026-09-13). No
    upstream is set:
    tracking `origin/<default>` would make every feature branch report itself
    ahead of main.
  - A failed fetch warns and carries on from what the store has, so working
    offline isn't blocked. A branch already checked out elsewhere is refused
    by git itself.
- `cps list [<repo>]` — every worktree in the store, one line each:
  `<repo>  <path>  on <branch> @ <sha>`, `detached @ <sha>`, or `missing`.
  A repo with no worktrees gets `<repo>  -  no worktrees`, so a fresh clone
  doesn't look absent.
- `cps rm <path>` — remove a worktree. No `--force`: git refuses on
  uncommitted changes. Refuses the worktree cwd is in. Keeps the branch — its
  commits in the store are the thing worth keeping. A directory already deleted
  by hand still has its entry removed (`git worktree remove` handles a missing
  directory, verified 2026-09-26).
- `cps completion <bash|zsh>` — see "completion" below.

No `cps fetch`: `git fetch` in any worktree already updates the store for every
worktree of that repo.

## Traps

- **A hand-deleted worktree stays registered**, and its branch stays "checked
  out" — `git worktree add` refuses it — until the entry goes. `cps list` shows
  it as `missing`; `cps rm <path>` clears it. `git gc` prunes such entries after
  `gc.worktreePruneExpire` (3 months), which also catches a worktree on a drive
  that's merely unmounted; `git worktree repair` from inside it recovers.
- **Config in a store repo is shared** by every worktree of it — which is also
  why `extensions.worktreeConfig` will be needed for following (see below).

## Decided: the project is `copse`, the command is `cps`

Renamed from `wtw`/worktree-wand. The project, and anything derived from it on
disk, is spelled out in full: `~/.local/share/copse/`, `~/.config/copse/`. Only
the installed binary is shortened, to `cps`.

## Decided: TypeScript on Bun

copse is mostly subprocess orchestration, so the language was chosen on how it
spawns processes.

- **Bun's shell (`$`) fits the job.** Verified, not assumed: interpolated
  values pass as single literal arguments, non-zero exits throw with the exit
  code and stderr attached, and fan-out across repos is `Promise.allSettled`.
- **Node rejected.** `child_process` is weak for shell-heavy code, and Node
  isn't installed here anyway. Bun already is.
- **Go was the serious alternative** — static binary, solid `os/exec`,
  long-term compatibility. Those pay off when distributing to other people or
  leaving a tool untouched for years. Neither fits a personal project whose
  design is still churning, where iteration speed wins. Porting a settled tool
  later is cheap; porting one mid-redesign isn't.

Libraries, each added only when a command first needs it:
- `commander` — subcommands, flags, `--help`.
- `@clack/prompts` — confirmations, selects, spinners, step logs.
- `cli-table3` — tables, borderless for a `docker ps` look.
- `picocolors` — colour.

Output is line-oriented, like git: `cps list | grep` must keep working. When
stdout isn't a TTY, drop spinners and colour, and never block on a prompt —
fail or require `--yes`.

Traps:
- Commands that use exit code as a boolean (`git show-ref --verify --quiet`,
  `git diff --quiet`) need `.nothrow()`, or they throw.
- `$` streams a command's stdout to the terminal unless you call `.text()` or
  `.quiet()`. Reading `result.stdout` off a `.nothrow()` call does not count, so
  raw SHAs and refs leak into copse's own output — `.nothrow().quiet()`.
- `.text()` buffers stderr instead of streaming it, so on failure forward it by
  hand or git's own error message is lost.
- `$` parses the template as shell syntax, so a literal `(` in it throws
  "Unexpected token: `(`" — `--format=%(refname)` has to be interpolated from a
  variable, which passes it as one literal argument (verified 2026-09-13).
- Bun's shell is its own implementation, not `sh`. Anything needing real shell
  semantics (user-supplied command strings) goes via
  `Bun.spawn(["sh", "-c", cmd])`, not Bun's `$`.
- `Bun.spawn` and `Bun.spawnSync` default to the environment the process
  started with, ignoring later changes to `process.env`; Bun's `$` reads it
  live. Always pass `env` explicitly, or tests isolating git via `process.env`
  still hit the real global config. Verified on Bun 1.4.2.
- git prints worktree paths resolved, so compare paths through `realpath` or
  one reached via a symlink won't match.

Installed with `bun link`, which symlinks `~/.bun/bin/cps` to this checkout's
`src/cli.ts` — no build step, and pulling updates it. A following hook in the
store calling `cps` would rely on `~/.bun/bin` being on the `PATH` git hooks
see; if that proves fragile, have copse write its own absolute path into the
hook instead.

## Decided: building an MVP

Leave out anything the MVP doesn't need. Future ideas live as proposals in
`proposals/`.

## Decided: completion mirrors each command's grammar, not just its name

`cps completion <bash|zsh>` prints a script that calls a hidden
`cps __complete <words...>`, where the last word is the partial one (empty when
the line ends in a space). `--` can't mark it — commander eats it.

Candidates differ per position: `cps add` offers repo names, then leaves the
path to the shell's own file completion, then offers that repo's branches — the
ones not checked out anywhere, since git refuses those. `cps list` offers repo
names. When copse offers nothing, bash and zsh fall back to filenames.

Traps, both verified:
- **bash breaks words on `:`**, which scp-style URLs contain, so the scripts
  rebuild the words from `COMP_LINE` rather than trusting the shell's split,
  and hand candidates back with everything up to the last colon stripped —
  what bash-completion's `__ltrim_colon_completions` does, inlined so the
  script needs no bash-completion. zsh doesn't have the problem.
- **`__complete` must never fail or print to stderr**, or the noise lands on
  the user's command line. It swallows every error — which also means a broken
  completion looks like an empty one, so test the candidates, not the exit code.

The zsh script is written but **untested**: no zsh on this machine.

## Ideas / not built yet

- **Following** — `cps add <repo> <path> --follow <ref>`: a detached worktree
  that a `reference-transaction` hook in the store moves whenever `<ref>`
  moves. The one thing copse does that git can't; designed and prototyped in
  `proposals/following.md`, which also holds its traps
  (`extensions.worktreeConfig` breaking `core.bare`, `core.hooksPath`
  disabling the hook). The ref followed goes in per-worktree git config
  (`copse.follows`), since git can't infer it. With a global store the hook
  fires for every follower of that repo on the machine, which is what's wanted.
- **`cps adopt <path>`** — bring an existing ordinary checkout into the store:
  clone from it, point the store's `origin` at the checkout's own `origin` URL
  (otherwise `origin` is a local path), then add a worktree elsewhere, leaving
  the old checkout untouched. Converting in place — move `.git` into the store,
  re-register the directory as a worktree — works (verified on a throwaway
  clone) but staged changes come back unstaged,
  detached HEAD and the checkout's own linked worktrees are edge cases, and it
  rewrites a directory someone is working in. Uncommitted work doesn't come
  along a fresh clone either way.
- **`cps mv <from> <to>`**, wrapping `git worktree move`.
- **Inferring the repo from cwd** for `cps list` or a `cps add` shorthand,
  once naming it every time chafes — without making a positional ambiguous.

