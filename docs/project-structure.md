# Project Structure

This project keeps runtime data under `data/`. Source code and static assets stay at the project root.

## Runtime Data

- `data/review_results/`: imported talent review Excel/JSON source files. Treat these as read-only baselines after import.
- `data/talent_profiles/`: active talent profile JSON files used by the app.
- Active profile files are also copied to `A:\AIProjects\HRobot talent snapshots\active\` for centralized snapshot management.
- Original department/studio snapshots are stored under `A:\AIProjects\HRobot talent snapshots\archive\`.
- Files from the old Chinese compatibility directory are stored under `A:\AIProjects\HRobot talent snapshots\legacy\`.
- `A:\AIProjects\HRobot talent snapshots\hrbp_profile_splits\`: generated profile splits for HRBP scopes.
- `A:\AIProjects\HRobot talent snapshots\permissions\`: HRBP permission configuration.
- `data/hrbp_profile_splits/` and `data/permissions/`: empty fallback skeletons for portable or installed environments without an external snapshot root.
- `data/report_generation/`: report skills, materials, setting markdown, generated report history, and local Markdown report copies under `reports_md/`.
- `data/design_center/posters/`: locally persisted design-center image outputs.
- `data/backups/`: manual or migration backups; do not package by default.
- `data/exports/`: user-generated Excel exports; do not package by default.

## Cleanup Rules

- Safe to delete: `__pycache__/`, `.playwright-cli/`, `.superpowers/`, server logs, `build/`, `packages/`, `output/`, `release_windows/`, and `data/uploads/`.
- Root startup scripts such as old `.bat`, `.command`, and `start_mac.sh` files are legacy helpers. Keep `scripts/package_windows.ps1` as the Windows packaging entry.
- Preserve: HR source data, permissions, report materials, generated reports, design images, backups, and exports.
- Use English directory names for new local database folders. Legacy Chinese directory names are only fallback compatibility paths.
- Release artifacts belong under `A:\AIProjects\HRobot package\`; do not copy them back into the source project.
- The app prefers the external snapshot root when it exists. Set `HROBOT_TALENT_SNAPSHOT_ROOT` to use another location.
