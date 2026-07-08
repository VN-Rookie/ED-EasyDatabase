# Plan: Font Family Customization Settings

**Source:** User Request: Add font family settings alongside text size configuration.
**Complexity:** Small

## Goal
Allow users to customize the system font family and SQL editor/console font family in the Settings dialog, persisting these preferences in the global app configuration and applying them dynamically to the UI.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Settings schema (Rust) | [settings.rs:45-53](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src-tauri/src/commands/settings.rs#L45-L53) | Storing UI configuration fields in `Settings` struct with defaults. |
| Settings store (TS) | [settingsStore.ts:22-26](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/stores/settingsStore.ts#L22-L26) | Mirroring setting types and defaults on the frontend. |
| Dynamic application | [AppShell.tsx:29-33](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/app/AppShell.tsx#L29-L33) | Applying settings dynamically via React `useEffect` and DOM manipulation. |
| Editor Styling | [SqlConsoleShell.tsx:802](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx#L802) | Injecting font preferences into the SQL Editor container layout. |

## Files to Change
| File | Action | Why |
|---|---|---|
| [settings.rs](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src-tauri/src/commands/settings.rs) | MODIFY | Add `system_font_family` and `editor_font_family` to the backend struct, including defaults. |
| [settingsStore.ts](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/stores/settingsStore.ts) | MODIFY | Add the new font configuration properties to the TS interface and default values. |
| [SettingsShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/settings/SettingsShell.tsx) | MODIFY | Render dropdown controls (Select components) in the settings panel to let users configure fonts. |
| [AppShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/app/AppShell.tsx) | MODIFY | Apply the selected system font family to `document.documentElement.style.fontFamily`. |
| [SqlConsoleShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx) | MODIFY | Apply the selected console font family to the CodeMirror wrapper. |

## Tasks

### Task 1: Update Rust backend Settings schema
**Files:** Modify [settings.rs](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src-tauri/src/commands/settings.rs)
**Mirror:** [settings.rs:45-53](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src-tauri/src/commands/settings.rs#L45-L53)
- [ ] Add `system_font_family` and `editor_font_family` fields to `Settings` struct:
  ```rust
  #[serde(default = "default_system_font_family")]
  pub system_font_family: String,
  #[serde(default = "default_editor_font_family")]
  pub editor_font_family: String,
  ```
- [ ] Implement default functions:
  ```rust
  fn default_system_font_family() -> String { "".into() }
  fn default_editor_font_family() -> String { "".into() }
  ```
- [ ] Update `impl Default for Settings`:
  ```rust
  system_font_family: default_system_font_family(),
  editor_font_family: default_editor_font_family(),
  ```
- [ ] Verify: Run `cargo check` in `src-tauri` -> expected compile success.

### Task 2: Update frontend Zustand store
**Files:** Modify [settingsStore.ts](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/stores/settingsStore.ts)
**Mirror:** [settingsStore.ts:22-26](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/stores/settingsStore.ts#L22-L26)
- [ ] Add properties to `Settings` interface:
  ```typescript
  system_font_family: string;
  editor_font_family: string;
  ```
- [ ] Add default values to `DEFAULT_SETTINGS`:
  ```typescript
  system_font_family: "",
  editor_font_family: "",
  ```
- [ ] Verify: Run `bun run typecheck` -> expected build success.

### Task 3: Render Font options in Settings UI
**Files:** Modify [SettingsShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/settings/SettingsShell.tsx)
**Mirror:** [SettingsShell.tsx:146-167](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/settings/SettingsShell.tsx#L146-L167)
- [ ] Add select drop-downs for both fonts under the `Appearance` section:
  ```tsx
  <div className="grid grid-cols-2 gap-4 mt-3">
    <div>
      <label className={labelCls}>System Font Family</label>
      <Select
        value={draft.system_font_family || ""}
        onChange={(e) => set("system_font_family", e.target.value)}
      >
        <option value="">Default (System Font)</option>
        <option value="Inter, system-ui, sans-serif">Inter</option>
        <option value="Roboto, sans-serif">Roboto</option>
        <option value="-apple-system, BlinkMacSystemFont, sans-serif">SF Pro / macOS Default</option>
        <option value="'Segoe UI', sans-serif">Segoe UI</option>
      </Select>
    </div>
    <div>
      <label className={labelCls}>Console Font Family</label>
      <Select
        value={draft.editor_font_family || ""}
        onChange={(e) => set("editor_font_family", e.target.value)}
      >
        <option value="">Default Monospace</option>
        <option value="JetBrains Mono, monospace">JetBrains Mono</option>
        <option value="Fira Code, monospace">Fira Code</option>
        <option value="SF Mono, Menlo, monospace">SF Mono / Menlo</option>
        <option value="Consolas, monospace">Consolas</option>
        <option value="Source Code Pro, monospace">Source Code Pro</option>
      </Select>
    </div>
  </div>
  ```
- [ ] Verify: Run `bun run typecheck` -> expected build success.

### Task 4: Apply System font to application DOM
**Files:** Modify [AppShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/app/AppShell.tsx)
**Mirror:** [AppShell.tsx:29-33](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/app/AppShell.tsx#L29-L33)
- [ ] Add a `useEffect` hook in `AppShell` to dynamically apply `system_font_family` when settings change:
  ```typescript
  useEffect(() => {
    if (settings.system_font_family) {
      document.documentElement.style.fontFamily = settings.system_font_family;
    } else {
      document.documentElement.style.fontFamily = "";
    }
  }, [settings.system_font_family]);
  ```
- [ ] Verify: Run `bun run typecheck` -> expected build success.

### Task 5: Apply Editor font family to SQL Console
**Files:** Modify [SqlConsoleShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx)
**Mirror:** [SqlConsoleShell.tsx:802](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx#L802)
- [ ] Retrieve `editor_font_family` from store in `SqlConsoleShell`:
  ```typescript
  const editorFontFamily = useSettingsStore((s) => s.settings.editor_font_family);
  ```
- [ ] Inject `editorFontFamily` into CodeMirror wrap elements' styles:
  ```tsx
  <div className="flex-1 min-h-0 overflow-hidden" style={{ fontSize: `${editorFontSize}px`, fontFamily: editorFontFamily || undefined }}>
  ```
- [ ] Verify: Run `bun run typecheck` and `bun run build` -> expected compile success.

## Validation
```bash
# Validate Rust compiles cleanly
cd src-tauri && cargo check
# Validate TypeScript compiles cleanly
bun run typecheck
# Validate full Vite build compiles cleanly
bun run build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Selected font is not installed on the system | Low | Use generic CSS fallbacks like `, sans-serif` and `, monospace` so browser defaults apply. |
| Stale configurations in saved files fail to parse | Low | Struct deserialization is safe since `#[serde(default)]` handles missing fields gracefully. |

## Acceptance
- [ ] All tasks complete
- [ ] Verification passes
- [ ] Font selections dynamically apply when saved in Settings
- [ ] Setting defaults fall back gracefully to original font configuration
