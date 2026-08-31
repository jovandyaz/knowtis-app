---
name: stacking-prs
license: MIT
description: Manages this repository's GitHub-native stacked PR workflow with the gh-stack extension, CodeRabbit review, and branch conventions. Use when creating PRs, splitting work into a stack, linking existing PRs, merging a stack, or responding to CodeRabbit. Commit messages still follow the repository's Conventional Commit policy.
---

# Stacking PRs (GitHub + CodeRabbit)

Knowtis uses GitHub's `gh-stack` extension for stacked PRs and CodeRabbit for automated first-pass review.

## Workflow

1. Branch with a Conventional prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`.
2. Install the extension once with `gh extension install github/gh-stack` if `gh stack` is unavailable.
3. Build a tracked stack with `gh stack init <bottom-branch>`, `gh stack add <next-branch>`, and `gh stack submit --auto --open`, or adopt existing PRs with `gh stack link <bottom> … <top>`. `link` takes PRs or branches bottom-first, creates no local tracking, and only adds membership.
4. Keep every PR under 100 changed files; CodeRabbit refuses larger reviews. Check with `git diff --name-only <base> <head> | wc -l` before opening.
5. Trigger CodeRabbit with `@coderabbitai full review` and confirm inline comments exist. A green check without comments can mean the review was skipped; fair-usage failures must be retried after the named window.
6. Address all review feedback before human review.
7. Merge with an explicit target, for example `gh stack merge <pr-number> --yes`, then run `gh stack sync` locally. Never manually rebase a stacked branch after GitHub merges and retargets a layer.
8. Detailed context lives in the PR description; commits stay single-line.

## Gotchas

- `gh stack view` needs local tracking; after `link`, run `gh stack checkout <stack-number>` first.
- `gh pr edit` is broken on this repo (deprecated GraphQL field). Change bases and bodies with `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH --input -`.
- Deleting a branch that is the **base** of an open PR auto-closes that PR, and GitHub then refuses both a base change and a reopen. Run `gh pr list --base <branch>` before deleting anything.
- Verify `gh auth status` shows the intended account before every write.

## Rules of thumb

- A PR that mixes a refactor with a behavior change should be split into a stack (refactor below, behavior on top).
- Do not merge a middle layer independently; use the stack-aware merge flow.
- CI must be green per-PR; `nx affected` keeps each stack level cheap.
