---
name: project-retro
description: On-demand project retrospective for HROBOT agent work. Use only when the user explicitly asks for a project review, retro, retrospective, lessons learned, post-mortem, or Chinese-language "fupan"/session review to analyze mistakes, friction, reusable lessons, or durable workflow improvements. Do not invoke automatically at task completion.
---

# Project Retro

Run a deliberate retrospective for HROBOT work only when the user asks for it. Focus on concrete evidence from the current session, repository state, tool results, and HROBOT project rules.

## Operating Rules

- Do not treat task completion as a trigger. Wait for an explicit user request for a retro, retrospective, lessons learned, post-mortem, or Chinese-language project review.
- Do not rewrite `AGENTS.md`, architecture docs, typography docs, source data, permissions data, uploaded files, or generated reports without explicit user confirmation.
- Do not invent lessons. If evidence is weak, say so and leave the item out.
- Prefer process fixes that can be encoded as project rules, checklists, tests, scripts, or focused skill updates.
- Keep HR data safety in view: do not expose sensitive employee data in the retrospective.
- Respect HROBOT constraints from `AGENTS.md`, especially module boundaries, cache-busting for static assets, port `8767`, and verification expectations.

## Evidence To Inspect

Use the smallest useful set:

- Current user request and relevant conversation turns.
- `git status --short`, `git diff --stat`, and focused diffs for files changed in the session.
- Test, server, browser, or validation outputs from the session.
- HROBOT guidance files when relevant: `AGENTS.md`, `docs/architecture-guidelines.md`, `docs/typography-guidelines.md`.
- Related module files only when needed to understand a mistake or missed constraint.

Do not scan ignored HR data or generated artifacts unless the user explicitly asks and confirms scope.

## Retrospective Workflow

1. Reconstruct the work: summarize the original goal, major decisions, files touched, and verification performed.
2. Identify friction: look for user corrections, wrong assumptions, repeated failed commands, unnecessary broad searches, missed project instructions, cache-busting misses, test gaps, or avoidable rework.
3. Separate signal from noise: keep only issues that have observable evidence or a clear risk.
4. Find root causes: name the decision point or missing check that allowed the issue.
5. Propose durable fixes: prefer small, specific changes to a rule, checklist, test, script, or skill. Mark whether each fix needs user approval before implementation.
6. Capture reusable lessons: write lessons as future-facing instructions, not apologies.

## Output Format

Respond in Chinese unless the user asks otherwise. Keep it concise and actionable:

```markdown
**Retrospective conclusion**
One sentence naming the most important finding.

**What worked**
- ...

**Issues and root causes**
- Symptom: ...
  Root cause: ...
  Evidence: ...

**Durable improvements**
- Recommendation: ...
  Target: AGENTS.md / docs / tests / skill / workflow / no change
  Needs confirmation: yes/no

**Next-time checklist**
- ...
```

If there are no meaningful problems, say that clearly and list any remaining verification gaps.

## Improvement Boundaries

When proposing persistent changes:

- `AGENTS.md`: only for stable project rules that should affect every future agent session.
- `docs/architecture-guidelines.md`: only for architecture/module-boundary guidance.
- `docs/typography-guidelines.md`: only for semantic typography/layout rules.
- This skill: for improving retrospective behavior itself.
- Tests/scripts: for repeatable verification that should run without relying on memory.

Ask before applying persistent changes unless the user has already asked to implement the retrospective recommendations.
