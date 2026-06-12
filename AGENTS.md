# Agent Instructions

This is a standalone HR Web project for talent review and nine-box calibration. Treat it as a first-level product project, not as a disposable analysis artifact from `organization-analysis`.

## Project Expectations

- Preserve user-facing HR workflows and data structures unless the user explicitly asks to redesign them.
- Before changing report generation, data import, permissions, intelligence, or AI settings behavior, inspect the related files under `data/`, `scripts/`, `docs/`, and `server.py`.
- Before changing UI typography, layout density, module headings, controls, tables, or settings forms, follow `docs/typography-guidelines.md` and use its semantic type roles instead of ad hoc font sizes or weights.
- Before adding or moving frontend/backend code, follow `docs/architecture-guidelines.md`; keep talent review, reports, agent center, intelligence, and settings changes within their module boundaries.
- Keep generated caches, logs, local test outputs, and packaged artifacts out of release bundles unless explicitly requested.
- Do not overwrite HR source data, permission data, uploaded files, or generated reports without confirming the intended scope.
- Use port `8767` as the single default local runtime port for this project. Do not introduce or document other default ports unless the user explicitly asks for a temporary override.

## Verification

- For backend changes, run the relevant Python tests under `tests/` when available.
- For frontend or interaction changes, launch the local server from this project directory and verify the affected page in a browser.
