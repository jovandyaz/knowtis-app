---
name: stacking-prs
description: Manages the Knowtis pull-request workflow — Graphite stacked PRs, CodeRabbit-first review, and branch conventions. Use when creating a PR, splitting a large change into a stack, responding to review, or when asked "cómo abro el PR", "stack", "gt create", or "CodeRabbit". Not for commit-message formatting (use standards' writing-conventional-commits).
---

# Stacking PRs (Graphite + CodeRabbit)

Knowtis uses **Graphite** for stacked PRs and **CodeRabbit** for automated first-pass review.

## Workflow

1. Branch with a Conventional prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`.
2. Create PRs with `gt create` (Graphite CLI), NOT `gh pr create` — Graphite needs to own stack tracking. For multi-step features, one small PR per step in a stack beats one large PR.
3. CodeRabbit auto-reviews every PR. **Address its feedback before requesting human review** — treat unresolved CodeRabbit threads as a not-ready signal.
4. Restack after amending: `gt modify` / `gt restack` keep children consistent; never rebase a stacked branch manually with raw git.
5. Detailed context lives in the PR description; commits stay single-line (see the standards plugin).

## Rules of thumb

- A PR that mixes a refactor with a behavior change should be split into a stack (refactor below, behavior on top).
- Don't merge mid-stack PRs out of order — merge bottom-up.
- CI must be green per-PR; `nx affected` keeps each stack level cheap.
