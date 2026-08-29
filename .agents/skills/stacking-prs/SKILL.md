---
name: stacking-prs
description: Manages this repository's GitHub-native stacked PR workflow with the gh-stack extension, CodeRabbit review, and branch conventions. Use when creating PRs, splitting work into a stack, linking existing PRs, merging a stack, or responding to CodeRabbit. Not for commit-message formatting (use writing-conventional-commits).
---

# Stacking PRs (GitHub + CodeRabbit)

Knowtis uses GitHub's `gh-stack` extension for stacked PRs and CodeRabbit for automated first-pass review.

## Workflow

1. Branch with a Conventional prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`.
2. Install the extension once with `gh extension install github/gh-stack` if `gh stack` is unavailable.
3. Build a tracked stack with `gh stack init <bottom-branch>`, `gh stack add <next-branch>`, and `gh stack submit --auto --open`, or adopt existing PRs with `gh stack link <bottom> … <top>`.
4. Trigger CodeRabbit with `@coderabbitai full review` and confirm inline comments exist. A green check without comments can mean the review was skipped.
5. Address review feedback before human review. Keep every PR under 100 changed files.
6. Merge with an explicit target, for example `gh stack merge <pr-number> --yes`. GitHub rebases and retargets remaining layers; never manually rebase a stacked branch after a merge.
7. Detailed context lives in the PR description; commits stay single-line.

## Rules of thumb

- A PR that mixes a refactor with a behavior change should be split into a stack (refactor below, behavior on top).
- Do not merge a middle layer independently; use the stack-aware merge flow.
- CI must be green per-PR; `nx affected` keeps each stack level cheap.
