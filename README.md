# copse (`cps`)

Makes using git worktrees more convenient. Bare clones of every repo you work on 
live in a single store, and allows worktrees of any of them anywhere on your machine.

## Synopsis

```sh
# Bare-clone a repo into the global store
~/ $ cps clone git@github.com:org/api.git
cloned github.com/org/api

~/ $ cps list
api  -  no worktrees

# A throwaway checkout, detached at origin's default branch
~/ $ cps add api ~/scratch/api
worktree ready: /home/me/scratch/api (detached at origin/main)

# A new branch off origin's default branch, from any directory
~/ $ cps add api ~/add-metrics-endpoint -b feat/add-metrics-endpoint
worktree ready: /home/me/add-metrics-endpoint (new branch feat/add-metrics-endpoint)

~/ $ cps list
api  /home/me/scratch/api           detached @ 41f25f5
api  /home/me/add-metrics-endpoint  on feat/add-metrics-endpoint @ 41f25f5

# Remove a worktree; its branch is kept in the store
~/ $ cps rm ~/scratch/api
worktree removed: /home/me/scratch/api
```


## Requirements

- [Bun](https://bun.sh) 1.4 or later
- git

## Install

```sh
git clone <this repo> copse
cd copse
bun install
bun link
```

`bun link` puts a `cps` symlink in `~/.bun/bin`, which the Bun installer adds
to your `PATH`. It points back at this checkout, so pulling new commits
updates `cps` with no reinstall. Check it with `cps --help`.

## The store

```sh
cps clone git@github.com:org/api.git
```

Bare-clones `api` into `~/.local/share/copse/github.com/org/api.git` (or under
`$COPSE_STORE`, else `$XDG_DATA_HOME/copse`). Repos are keyed by host and path,
so an SSH and an HTTPS URL for the same repo are the same repo. The clone keeps
no local branches — `origin/*` is the record of what exists upstream.

Name a repo by any unique suffix of its key: `api`, `org/api`, or
`github.com/org/api`. A name matching several repos is refused, never guessed.

## Worktrees

```sh
cps add api ~/scratch/api            # detached at origin's default branch
cps add api ~/work/fix colleague-fix # an existing branch, local or on origin
cps add api ~/work/feat -b feat      # a new branch off origin's default branch
```

`cps add` fetches first, so a new worktree starts from the latest upstream
commit; if the fetch fails it warns and uses what the store already has. A
branch only on origin is checked out as a local branch tracking it. `-b`
refuses a name that already exists locally or on origin, and sets no upstream.

```sh
cps list          # every repo in the store, and its worktrees
cps list api      # just api's
```

```
api  /home/me/scratch/api  detached @ 41f25f5
api  /home/me/work/feat    on feat @ 41f25f5
web  /home/me/work/web     missing
cli  -                     no worktrees
```

`missing` means the directory was deleted by hand while git still has it
registered — which also keeps its branch "checked out". `cps rm <path>` clears
it.

```sh
cps rm ~/work/feat
```

Removes the worktree and keeps its branch. There is no `--force`: git refuses
on uncommitted changes. `git fetch` in any worktree updates the store for every
worktree of that repo.

## Shell completion

```sh
cps completion bash >> ~/.bashrc      # or: source <(cps completion bash)
cps completion zsh > ~/.zfunc/_cps
```

Completes subcommands, repo names for `cps add` and `cps list`, paths via the
shell's own file completion, and for `cps add`'s branch the branches not
already checked out anywhere.

## Development

```sh
bun test
bun run typecheck
```

`BRAIN.md` holds design notes and ideas that aren't built yet.


## Etymology

(https://www.oxfordlearnersdictionaries.com/definition/english/copse)

