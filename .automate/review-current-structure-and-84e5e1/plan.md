### Subtasks

1. **Inventory the codebase structure** — enumerate top-level directories/files, list module/feature boundaries, and note file sizes/line counts. Produce a structure map (not exhaustive listing, but grouped by responsibility).
2. **Identify stated conventions vs. actual code** — read any project README/CLAUDE.md/config (package.json, lint/test/build scripts) to extract declared conventions (naming, layering, error handling, file size limits), then compare against actual code.
3. **Review code quality** — apply Karpathy-style review heuristics: simplicity, surgical scoping, naming clarity, deep nesting, magic numbers, dead code, duplicated logic, missing error handling.
4. **Flag architectural/structural violations** — note any boundary leaks (e.g. business logic in transport/UI layers, cross-feature coupling, oversized files >800 lines, missing abstractions where repetition is real).
5. **Compile findings into a structured Markdown report** — group findings by severity (CRITICAL/HIGH/MEDIUM/LOW), include concrete file paths/line refs, and a short "what to fix next" list.
6. **(Optional) Render the report visually** — convert the Markdown report into an HTML view with summary charts (e.g. issue counts by severity/module) for quick stakeholder review.

### Acceptance criteria

- A structure inventory exists covering all top-level modules/directories with their responsibilities.
- Declared conventions (from project config/docs) are explicitly compared against observed code, with concrete mismatches listed.
- Every flagged issue cites a specific file path (and line number/range where applicable) — no vague "code could be cleaner" statements.
- Findings are categorized by severity, consistent with CRITICAL/HIGH/MEDIUM/LOW.
- The report distinguishes between "must fix" (CRITICAL/HIGH) and "nice to have" (MEDIUM/LOW) items.
- No code is modified during this review — it is read-only analysis (this task is a review, not an implementation task).
- The final report is reviewable as a standalone artifact (Markdown, optionally also HTML).

### Skill selection

- **build**: karpathy-guidelines, ask
- **qa_review**: karpathy-guidelines, md-to-visual
- **qa_fix**: execute

SELECTED_SKILLS: karpathy-guidelines, ask, md-to-visual, execute

GOTCHAS: project profile in this run says "node" with npm test/build/lint, but be sure to verify the actual stack from the repo's own config files before applying conventions — don't assume the profile is authoritative if it conflicts with the live repo (e.g. CLAUDE.md, package.json); this is a read-only review task, so no commits or fixes should be applied without a separate explicit follow-up task.
PATTERNS: structure reviews should always cite file path + line number for every finding; group findings by severity (CRITICAL/HIGH/MEDIUM/LOW) per the project's code-review rubric.