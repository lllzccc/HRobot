# Typography Guidelines

This project is a dense, work-focused HR web app. Typography should help HRBP users scan data, configure settings, review calibration decisions, and trace generated outputs without visual noise.

## Design Read

- Product type: internal HR operations workbench.
- Primary users: HRBP, talent review facilitators, authorized HR operators.
- Target feel: calm, precise, compact, trustworthy.
- Avoid: marketing-scale headings, decorative display type, page-specific font experiments, excessive bold weights.

## Font Family

- Use `--font-sans` everywhere for product UI.
- Current source: local HarmonyOS Sans SC with system fallbacks.
- Do not introduce another UI font unless the whole project typography system is intentionally migrated.
- Monospace is allowed only for code, paths, prompts, raw report output, or technical logs.

## Type Tokens

Use semantic type roles before raw size tokens.

| Role | Size | Weight | Line Height | Usage |
| --- | ---: | ---: | ---: | --- |
| `--type-page-title-*` | 20px | 700 | 1.18 | Page banner titles only |
| `--type-section-title-*` | 15px | 650 | 1.25 | Top-level panels and collapsible sections |
| `--type-card-title-*` | 14px | 650 | 1.30 | Subforms, cards, table section headings |
| `--type-body-*` | 13px | 500 | 1.55 | Normal explanatory copy |
| `--type-control-*` | 12px | 600 | 1.45 | Buttons, inputs, selects, textareas |
| `--type-label-*` | 11px | 650 | 1.35 | Field labels, compact row labels |
| `--type-meta-*` | 12px | 500 | 1.45 | Status text, helper text, timestamps, metadata |
| `--type-table-*` | 12px | 500 | 1.40 | Tables, compact lists, data rows |
| `--type-micro-*` | 10px | 650 | 1.30 | Tiny badges only when space is constrained |

## Weight Rules

- Default body and metadata weight is 500.
- Normal emphasis uses 650.
- Page titles use 700.
- Avoid 800 and 900 in routine UI. Reserve them for logos, numeric badges, critical matrix numbers, and rare emphasis.
- Do not stack large size and heavy weight unless the element is a true page title.

## Component Rules

- Page banner: title `page-title`, subtitle `body`.
- Collapsible settings section: title `section-title`, summary `meta`.
- Card/subform title: `card-title`.
- Field label: `label`.
- Input/button/select/textarea: `control`.
- Helper and status text: `meta`.
- Tables and file rows: `table` or `meta`, not title styles.

## Density Rules

- Settings and forms should be compact. Prefer smaller titles and lighter weights over larger panels.
- If a section looks too large, reduce weight and padding before reducing functionality.
- Use spacing and separators for hierarchy before increasing font size.
- Long Chinese labels must wrap or truncate predictably; do not fix overflow with larger containers alone.

## Implementation Rules

- New CSS should use semantic type variables instead of hard-coded `font-size`, `font-weight`, or `line-height`.
- If a module needs a special size, add or reuse a semantic token first.
- Page-specific overrides must not redefine the core type scale.
- Before shipping UI changes, inspect at least one dense page and one settings/form page in the browser.

## Review Checklist

- Does every visible text element map to a semantic role?
- Are routine labels and helper text below 13px and not heavier than 650?
- Are section titles 15px or 14px rather than 18px unless there is a strong reason?
- Is `900` absent from routine controls, labels, cards, and settings headings?
- Does the page still feel like a compact HR workbench rather than a landing page?
