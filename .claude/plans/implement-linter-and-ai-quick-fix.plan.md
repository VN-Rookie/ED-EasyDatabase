# Plan: Implement SQL Linter & AI Quick Fix

**Source:** [smart_sql_editor_analysis.md](file:///Users/hieuvu/.gemini/antigravity-cli/brain/a84a0ac4-d1da-4b3e-9a2a-c5f1396c3169/smart_sql_editor_analysis.md)
**Complexity:** Medium

## Goal
Tích hợp tính năng cảnh báo hiệu năng tĩnh (SQL Linter) trực quan ngay trên CodeMirror editor và bổ sung nút "AI Quick Fix" sửa lỗi tự động khi thực thi SQL thất bại.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Command | `src-tauri/src/commands/ai.rs:222` | Tauri command calling AI provider |
| Frontend API | `src/features/sql-console/aiApi.ts:3` | Tauri invoke wrapper for AI features |
| Frontend Linter | `src/features/sql-console/SqlConsoleShell.tsx:625` | CodeMirror extensions configuration |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src-tauri/src/commands/ai.rs` | MODIFY | Thêm Tauri command `fix_sql_error` gọi AI để sửa SQL bị lỗi. |
| `src-tauri/src/lib.rs` | MODIFY | Đăng ký tauri command `fix_sql_error`. |
| `src/features/sql-console/aiApi.ts` | MODIFY | Khai báo API `fixSqlError` gọi command backend. |
| `src/features/sql-console/SqlConsoleShell.tsx` | MODIFY | Triển khai `sqlLinter` tích hợp vào CodeMirror; thêm nút "Fix with AI" và logic thay thế query. |

---

## Tasks

### Task 1: Thêm Tauri Command `fix_sql_error` ở Backend
**Files:** Modify `src-tauri/src/commands/ai.rs` · Modify `src-tauri/src/lib.rs`
- [ ] Thêm prompt helper và command `fix_sql_error` vào `src-tauri/src/commands/ai.rs`:
  ```rust
  fn sql_fix_prompt(schema_context: &str) -> String {
      format!(
          "You are a SQL expert database assistant.\n\
           The database schema is:\n\n\
           {schema_context}\n\n\
           A user ran a SQL query and got an error.\n\
           Your task is to fix the query so that it executes correctly.\n\n\
           Rules:\n\
           - Output ONLY the corrected SQL query, nothing else.\n\
           - Do NOT wrap it in markdown fences or backticks.\n\
           - Do NOT add any explanations."
      )
  }

  #[tauri::command]
  pub async fn fix_sql_error(
      sql: String,
      error: String,
      schema_context: String,
  ) -> Result<String, AppError> {
      let settings = load_settings().await?;
      let system = sql_fix_prompt(&schema_context);
      let user_prompt = format!(
          "SQL Query:\n{sql}\n\nError Message:\n{error}\n\nPlease fix the SQL query."
      );
      let raw = call_ai(&settings, &system, &user_prompt).await?;
      Ok(raw
          .trim_start_matches("```sql")
          .trim_start_matches("```")
          .trim_end_matches("```")
          .trim()
          .to_string())
  }
  ```
- [ ] Đăng ký command `fix_sql_error` trong `src-tauri/src/lib.rs` ở list handlers:
  ```rust
  commands::ai::fix_sql_error,
  ```
- [ ] Verify: Chạy `cargo check` để đảm bảo code backend compile thành công.

### Task 2: Khai báo API và Cập nhật Console Linter ở Frontend
**Files:** Modify `src/features/sql-console/aiApi.ts` · Modify `src/features/sql-console/SqlConsoleShell.tsx`
- [ ] Thêm `fixSqlError` vào `src/features/sql-console/aiApi.ts`:
  ```typescript
  export const fixSqlError = (sql: string, error: string, schemaContext: string) =>
    invoke<string>("fix_sql_error", { sql, error, schemaContext });
  ```
- [ ] Import `linter`, `Diagnostic` từ `@codemirror/lint` tại [SqlConsoleShell.tsx](file:///Volumes/NewVolume/Workspace/project/ED-EasyDatabase/src/features/sql-console/SqlConsoleShell.tsx):
  ```typescript
  import { linter, type Diagnostic } from "@codemirror/lint";
  import { fixSqlError } from "./aiApi";
  ```
- [ ] Viết hàm `sqlLinter` trong `SqlConsoleShell.tsx` để bắt các cảnh báo tĩnh:
  ```typescript
  const sqlLinter = (view: EditorView): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const docText = view.state.doc.toString();

    // 1. SELECT * Check
    const selectAllRegex = /\bSELECT\s+\*\b/gi;
    let match;
    while ((match = selectAllRegex.exec(docText)) !== null) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "warning",
        message: "SELECT * might perform poorly on large tables. Consider listing columns explicitly.",
      });
    }

    // 2. Comma Join Check (Implicit Cross Join)
    const commaJoinRegex = /\bFROM\s+[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\b/gi;
    while ((match = commaJoinRegex.exec(docText)) !== null) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "warning",
        message: "Comma-separated implicit joins can cause performance issues (Cartesian product). Use explicit JOIN ... ON syntax.",
      });
    }

    // 3. Non-Sargable WHERE Function Call Check (e.g., WHERE DATE(col) = )
    const nonSargableRegex = /\bWHERE\s+[a-zA-Z_]\w*\(\s*[a-zA-Z_]\w*\s*\)/gi;
    while ((match = nonSargableRegex.exec(docText)) !== null) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "warning",
        message: "Applying functions to columns inside WHERE clause may disable index usage (Non-Sargable Query).",
      });
    }

    return diagnostics;
  };
  ```
- [ ] Đăng ký `linter(sqlLinter)` vào `cmExtensions` (chỉ áp dụng đối với SQL databases):
  ```typescript
  // Cập nhật cmExtensions:
  const cmExtensions = [
    isMongoConnection 
      ? mqlLanguage 
      : sql({ 
          dialect: PostgreSQL, 
          tables: schemaCache.tables.map(t => ({ 
            label: t.name, 
            columns: schemaCache.tableColumns.get(t.name)?.map(c => ({ label: c.name, type: c.type })) || [] 
          })) 
        }),
    ...(isMongoConnection 
      ? [autocompletion({ override: [mongoCompletionSource] })] 
      : [
          PostgreSQL.language.data.of({ autocomplete: sqlCompletionSource }),
          linter(sqlLinter)
        ]),
    keymap.of([{ key: "Mod-Enter", run: () => { execute(); return true; } }]),
  ];
  ```

### Task 3: Triển khai Nút "AI Quick Fix" trên Giao diện Error Console
**Files:** Modify `src/features/sql-console/SqlConsoleShell.tsx`
- [ ] Thêm state loading sửa lỗi:
  ```typescript
  const [aiFixing, setAiFixing] = useState(false);
  ```
- [ ] Thêm hàm `handleAiQuickFix` trong `SqlConsoleShell.tsx`:
  ```typescript
  const handleAiQuickFix = async () => {
    if (!error || !connId || aiFixing) return;
    const q = getQueryToRun();
    if (!q.trim()) return;

    setAiFixing(true);
    try {
      let schemaContext = "";
      try {
        const tableNames = schemaCache.tables.map((t) => t.name);
        schemaContext = tableNames.join(", ");
        if (schemaContext) schemaContext = `Tables: ${schemaContext}`;
      } catch { /* best-effort */ }

      const fixed = await fixSqlError(q, error, schemaContext);
      loadSqlIntoEditor(fixed);
      toast("AI fixed the query! Please run it again.", "success");
      setError(""); // clear error
    } catch (e) {
      toast(`AI Fix failed: ${e}`, "error");
    } finally {
      setAiFixing(false);
    }
  };
  ```
- [ ] Hiển thị nút "Fix with AI" trong phần hiển thị error:
  Tìm phần code hiển thị error (khoảng dòng 880):
  ```typescript
  {error ? (
    <div className="flex-1 overflow-auto p-3 flex gap-2">
      <AlertCircle size={13} className="text-danger shrink-0 mt-0.5" />
      <pre className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{error}</pre>
    </div>
  )
  ```
  Thay thế bằng:
  ```typescript
  {error ? (
    <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5 shrink-0">
        <span className="text-[10px] text-danger font-semibold uppercase tracking-wider flex items-center gap-1">
          <AlertCircle size={11} /> Execution Error
        </span>
        <button
          onClick={handleAiQuickFix}
          disabled={aiFixing || !connId}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] border border-danger/40 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors"
          title="Fix this query with AI"
        >
          {aiFixing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          Fix with AI
        </button>
      </div>
      <div className="flex-1 overflow-auto flex gap-2 min-h-0">
        <pre className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{error}</pre>
      </div>
    </div>
  )
  ```
- [ ] Verify: Chạy `bun run typecheck` để đảm bảo code TypeScript biên dịch thành công.

---

## Validation
```bash
bun run typecheck
bun run build
cd src-tauri && cargo check && cargo test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Regex của linter bắt sai các chuỗi con | Medium | Sử dụng các boundary `\b` và regex chặt chẽ để giảm thiểu dương tính giả (false positive). |
| AI Quick Fix sinh code kèm markdown code block | Low | Sử dụng hàm trim markdown ở cả Rust backend và prompt hướng dẫn chặt chẽ. |

## Acceptance
- [ ] Linter hoạt động cảnh báo trực quan trên editor (vạch đỏ/vàng khi gõ `SELECT *` hoặc comma join).
- [ ] Giao diện lỗi có thêm nút "Fix with AI".
- [ ] Bấm nút "Fix with AI" tự động thay thế câu lệnh cũ bằng câu lệnh đúng trong editor.
