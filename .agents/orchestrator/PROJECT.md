# Project: Code Review and Security Audit of tool-sql

## Architecture
- **Backend**: Rust + Tauri commands (`src-tauri/src/`). Uses `Driver` trait to abstract databases (Postgres, MySQL, Mongo).
- **Frontend**: React + TS + Tailwind v4 (`src/`). Components call Rust commands through feature wrappers. State is in Zustand stores.
- **MCP Server**: Integrated in Tauri backend, reuses `Driver` trait.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Rust Backend Code Audit | Explore backend Rust code (drivers, commands, model, state, mcp) for quality, error handling, thread safety, and keyring security. | None | DONE |
| M2 | React Frontend Code Audit | Explore React/TS frontend code (features, components, stores, hooks), particularly DataGridShell/DataGrid, SchemaTree, SettingsPanel, for performance, memory leaks, and type consistency. | None | DONE |
| M3 | Feature Gap & Polish Review | Assess core features (Postgres multi-schema, batch edits, data import, database snapshot, SQL console splitting) for logic flaws, edge cases, and improvements. | None | DONE |
| M4 | Generate Code Review Report | Synthesize all Explorer findings and write the comprehensive report to `/Volumes/NewVolume/Workspace/project/tool-sql/docs/code_review_report.md` | M1, M2, M3 | DONE |

## Code Layout
- `src-tauri/src/drivers/`: Postgres, MySQL, MongoDB drivers implementing `Driver` trait
- `src-tauri/src/commands/`: Tauri commands routing frontend calls to drivers
- `src-tauri/src/mcp/`: Model Context Protocol tools and handlers
- `src/components/`: Frontend React components
- `src/features/`: Frontend feature modules
- `src/stores/`: Zustand state management
- `src/hooks/`: Custom React hooks
