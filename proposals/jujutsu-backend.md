# Proposal: Jujutsu as a VCS backend

**Status:** assessed, not adopted. Revisit if jj adoption spreads.

## Question

Should copse be built on [Jujutsu](https://github.com/jj-vcs/jj) rather than
git?

## Summary

jj would make copse's semantics simpler to implement, but git already covers
everything copse needs with small workarounds. Adopt jj because it is a nicer
VCS if that appeals, not expecting it to change what copse can do.

The one recommendation worth acting on now costs nothing: **design copse's model
in jj's terms, implement the git backend first.**

## Scoring against copse's problems

| Problem | Does jj help? |
| --- | --- |
| Git's one-branch-one-worktree rule | Removes the need for it, but `git worktree add --detach` solves it with one flag. |
| A follower moved under conflicting local edits | **Yes.** Conflicts are recorded in commits rather than blocking, so a moved working copy can't be left half-updated. |
| Undo of a bad operation | **Yes.** The operation log makes it recoverable without reflog excavation. |
| PR identity across rebases | **Modest.** Stable change IDs beat SHAs as a key, but forges already track by source branch. |
| Same-repo stacking | **Yes**, via automatic descendant rebase. |

## Recommendation: design in jj's terms, implement git

jj's model is essentially a superset of git's for everything copse needs:
working copies are not exclusive, conflicts do not block operations, and
changes have stable identity across rewrites.

Design the semantics assuming that, and the git backend implements them with
workarounds — detached HEAD for non-exclusivity, halt-and-report for
conflicts, SHA plus metadata for change identity. A jj backend later
implements the same semantics natively and more simply.

Design it the other way round, in git's terms where branches are exclusive and
conflicts halt you, and those limitations get baked into copse's *user-facing*
model, where a jj backend cannot remove them without changing behaviour people
depend on.

The usual instinct is to design for the lowest common denominator. Here it is
backwards, because the permissive model is the superset.

## Terminology collision

jj calls its multiple-working-copy feature `jj workspace`; copse keeps git's
word, **worktree**. Name the mapping deliberately in a jj backend, since the
two words will be confused in every conversation about it.

## Costs

- **Adoption cost.** Requiring jj means requiring everyone who uses copse to
  learn a new VCS first, blocking adoption for reasons unrelated to copse. Git
  habits are the default anywhere copse is likely to be useful.
- **Colocated mode** (`.jj` alongside a real `.git`) is the escape hatch, but
  has sharp edges — git operations behind jj's back can confuse its
  snapshotting.
- **Ecosystem is git-native.** MR tooling, forge CLIs, IDE integration and CI all
  assume git. Bookmarks push to git branches so this works, but less smoothly.
- **Pre-1.0 churn.** The CLI has moved (the branch → bookmark rename being
  one example). Verify current state rather than trusting a stale read.

## Correction to earlier enthusiasm

An earlier framing in discussion presented jj as dissolving a constraint we
had been stuck on. That was overstated: `git worktree add --detach` solves the
branch-exclusivity problem with a single flag, and it was found immediately.
jj removing the need for a one-line workaround is not an argument for jj.
