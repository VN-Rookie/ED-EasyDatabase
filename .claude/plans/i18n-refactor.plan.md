# Plan: Full Application i18n Localization

**Source:** User Request
**Complexity:** Medium

## Goal
Implement full localization support (English and Vietnamese) across all active user-facing features of the application, refactoring hardcoded text to use the established `useTranslation` hook and centralized translation mapping.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Hook | [`src/hooks/useTranslation.ts:1-12`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/hooks/useTranslation.ts#L1-L12) | Import and use `useTranslation` hook to dynamically extract localized strings using keys. |
| Mapping | [`src/lib/i18n/mapping.ts:1-123`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/lib/i18n/mapping.ts#L1-L123) | Add structured flat keys for each localized string categorized by feature. |
| Settings | [`src/features/settings/SettingsShell.tsx:16-52`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/settings/SettingsShell.tsx#L16-L52) | Initialize `useTranslation` hook inside functional components and call `t("key")` for UI values. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/lib/i18n/mapping.ts` | MODIFY | Expand with translations for connection, explorer, and console/views. |
| `src/features/connection/ConnectionDialogShell.tsx` | MODIFY | Translate connection creation/edit dialog labels, buttons, and error messages. |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | Localize database tree items, tooltips, context menus, and empty states. |
| `src/features/sql-console/SqlConsoleShell.tsx` | MODIFY | Localize query controls, formatting, execution tabs, AI query box, and actions. |

---

## Tasks

### Task 1: Update Translation Dictionary in `mapping.ts`
**Files:** Modify [`src/lib/i18n/mapping.ts`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/lib/i18n/mapping.ts)
**Mirror:** Centralized dictionary format.
- [ ] Add translation dictionary entries for connections, explorer context menus, and console labels.
```typescript
// Add key definitions inside translations.en and translations.vi:
// Connection Dialog
connectionTitleNew: "New Connection",
connectionTitleEdit: "Edit Connection",
connNameLabel: "Connection Name",
hostLabel: "Host",
portLabel: "Port",
userLabel: "User",
passLabel: "Password",
dbNameLabel: "Database Name",
testConnBtn: "Test Connection",
saveConnBtn: "Save Connection",
testingStatus: "Testing...",
testSuccess: "Connection successful!",
testFail: "Connection failed",

// Explorer Tree
dbExplorerTitle: "Database Explorer",
noConnections: "No connections found.",
addConnPrompt: "Click '+' to add a connection.",
refreshContext: "Refresh",
deleteContext: "Delete",
renameContext: "Rename",
viewDataContext: "View Data",
ddlContext: "Show DDL",

// SQL Console
runQueryBtn: "Run",
formatSqlBtn: "Format",
explainSqlBtn: "Explain (AI)",
clearConsoleBtn: "Clear",
queryHistoryTab: "Query History",
noHistory: "No query history recorded.",
executingQuery: "Executing query...",
querySuccess: "Query executed successfully",
queryError: "Error executing query",
```
- [ ] Verify: Run `bun run typecheck` to ensure no syntax issues exist in the file.

### Task 2: Localize Connection Dialog Shell
**Files:** Modify [`src/features/connection/ConnectionDialogShell.tsx`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/connection/ConnectionDialogShell.tsx)
**Mirror:** Use `useTranslation` hook initialized in components.
- [ ] Import hook:
```typescript
import { useTranslation } from "../../hooks/useTranslation";
```
- [ ] Initialize `const { t } = useTranslation();` inside `ConnectionDialogShell`.
- [ ] Replace UI strings with:
  - `{isEdit ? t("connectionTitleEdit") : t("connectionTitleNew")}`
  - `{t("connNameLabel")}`, `{t("hostLabel")}`, `{t("portLabel")}`
  - `{t("userLabel")}`, `{t("passLabel")}`, `{t("dbNameLabel")}`
  - `{testing ? t("testingStatus") : t("testConnBtn")}`
  - `{t("saveConnBtn")}`
- [ ] Verify: Run `bun run typecheck` to ensure all imports and types align.

### Task 3: Localize Explorer Tree
**Files:** Modify [`src/features/explorer/ExplorerTree.tsx`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/explorer/ExplorerTree.tsx)
**Mirror:** Hook pattern.
- [ ] Import `useTranslation` from `../../hooks/useTranslation`.
- [ ] Initialize `t` hook in `ExplorerTree` component.
- [ ] Replace text placeholders:
  - `"No connections found."` -> `{t("noConnections")}`
  - `"Click '+' to add a connection."` -> `{t("addConnPrompt")}`
  - `"Refresh"`, `"Delete"`, `"Rename"`, `"View Data"`, `"Show DDL"` inside context menus with translated keys.
- [ ] Verify: Run `bun run typecheck`.

### Task 4: Localize SQL Console Shell
**Files:** Modify [`src/features/sql-console/SqlConsoleShell.tsx`](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx)
**Mirror:** Hook pattern.
- [ ] Import `useTranslation` from `../../hooks/useTranslation`.
- [ ] Initialize `t` hook inside `SqlConsoleShell` component.
- [ ] Replace hardcoded action names:
  - `"Run"` -> `{t("runQueryBtn")}`
  - `"Format"` -> `{t("formatSqlBtn")}`
  - `"Explain (AI)"` -> `{t("explainSqlBtn")}`
  - `"Clear"` -> `{t("clearConsoleBtn")}`
- [ ] Verify: Run `bun run typecheck`.

---

## Validation
```bash
bun run typecheck
cd src-tauri && cargo check
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing translations for unused/legacy files | Low | Legacy files like `SettingsPanel.tsx` are unlinked and ignored. Focus localization exclusively on feature-structured components inside `src/features/` and `src/app/`. |
| Context menus rendering delays | Low | Localized strings resolve synchronously through the hook, preventing any UI lag or render flicker. |

## Acceptance ("done" criteria)
- [ ] Central mapping file expanded to cover common UI text keys.
- [ ] `ConnectionDialogShell`, `ExplorerTree`, and `SqlConsoleShell` refactored to pull texts from `t(...)` hook.
- [ ] No type check warnings or cargo errors.
- [ ] Interface correctly renders in Vietnamese when selected in settings.
