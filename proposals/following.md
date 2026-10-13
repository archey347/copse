# Proposal: worktrees that follow a ref

**Status:** designed and prototyped, not built.

## Idea

Git refuses to check out one branch in two worktrees, but that rule applies
only to **branches**. Detached HEADs are unrestricted: any number of worktrees
can sit detached at the same commit. A detached worktree with no commits of its
own can also be moved to a new tip without a rebase and without conflict, since
it has nothing to preserve.

So a detached worktree can **follow** a ref, recorded in per-worktree git config
(`copse.follows`), and a `reference-transaction` hook in the store moves every
follower to the new tip whenever that ref moves:

- Following `refs/remotes/origin/<base>` means any `git fetch` — including the
  one inside `git pull` — moves it.
- Following `refs/heads/<branch>` means the commits, amends, resets and pulls
  of whoever has that branch checked out move it.

Only commits travel; uncommitted work stays put. A WIP commit does reach
followers, which is accepted: seeing commits as they land is worth more than
an explicit sync step.

A follower is moved only if it still sits at the old tip; `git checkout
--detach` carries non-clashing uncommitted edits along. Clashing edits, or
commits of its own, leave it where it is — stale, never broken — and copse must
say so.

## One owner per branch

Letting two worktrees commit to one branch (`git worktree add --force`, with the
hook updating the other) was tried. A clean co-owner updates fine, but one with
clashing edits is left with the branch moved and its files not, so its next
commit silently reverts the other's. Followers fail safe; co-owners fail broken.
A follower that wants to commit takes ownership, and the old owner becomes a
follower.

## Traps

Everything above except the ownership handover was verified by prototype on
git 2.55. Traps it found:

- `extensions.worktreeConfig`, which `copse.follows` needs, makes the shared
  `core.bare=true` apply to every worktree: "fatal: this operation must be run
  in a work tree". Move it to the bare repo's `config.worktree` first.
- `git clone --bare` sets no fetch refspec, so there are no remote-tracking
  refs to follow until copse adds `+refs/heads/*:refs/remotes/origin/*`.
- A repo's own `core.hooksPath` (husky, lefthook) replaces the hooks directory
  and silently disables propagation. copse must chain onto it, or catch
  followers up whenever any `cps` command runs.

## Consequences

- **`git status` says "HEAD detached at abc123"**, which alarms people. copse
  should render it as something like `following main @ abc123`, or `(stale)`
  when propagation couldn't move it.
- **Derive state from git, don't keep a ledger.** Someone may run
  `git checkout -b` inside a follower. Whether a worktree is on a branch is
  asked of git; only the ref followed, which git can't infer, lives in
  per-worktree config.
