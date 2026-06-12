# Packaging Rules

All release artifacts should be written under `packages/`.

## Naming

Use lowercase product name, platform, package type, and timestamp:

```text
hrobot-talent-ninebox-<platform>-<type>-YYYYMMDD-HHMMSS
```

Examples:

```text
packages/web/hrobot-talent-ninebox-web-source-20260609-143000.zip
packages/windows/HRobotTalentNineBoxSetup.exe
```

## Default Exclusions

Release packages must not include sensitive or local runtime content unless explicitly requested:

- API keys and `data/ai_config.json`
- HR source data under `data/review_results/`, `data/talent_profiles/`, `data/talent_profile_snapshots/`
- permission data under `data/permissions/`
- generated reports and Markdown copies under `data/report_generation/generated_*` and `data/report_generation/reports_md/`
- uploaded report materials under `data/report_generation/materials/`
- generated design images under `data/design_center/posters/`
- backups, exports, uploads, logs, caches, and build outputs

`data/ai_config.json` should only contain non-secret endpoint/model metadata in local development. Runtime API keys must be provided through `HROBOT_AI_API_KEY`, `HROBOT_IMAGE_API_KEY`, or the local settings page for the current process.

## Web Source Packages

Use this when sharing the project with another agent for environment evaluation, source inspection, tests, and local web execution:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_web.ps1
```

The zip includes source code, docs, tests, static assets, dependency metadata, and an empty runtime data skeleton.

Web artifacts go under `packages/web/`.

## Windows Packages

Windows installer builds use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_windows.ps1
```

Windows artifacts now go under `packages/windows/`.
