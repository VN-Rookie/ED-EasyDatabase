export interface MockColumn { name: string; type: string; nullable: boolean; pk: boolean; }
export const MOCK_COLUMNS: MockColumn[] = [
  { name: "id", type: "int8", nullable: false, pk: true },
  { name: "email", type: "text", nullable: false, pk: false },
  { name: "created_at", type: "timestamptz", nullable: true, pk: false },
];
export const MOCK_ROWS: Record<string, unknown>[] = [
  { id: 1, email: "ada@example.com", created_at: "2024-01-01T10:00:00Z" },
  { id: 2, email: "alan@example.com", created_at: "2024-02-15T09:30:00Z" },
  { id: 3, email: null, created_at: null },
];
export const MOCK_INDEXES = [
  { name: "users_pkey", columns: "id", type: "btree", unique: true },
  { name: "users_email_idx", columns: "email", type: "btree", unique: true },
];
export const MOCK_DDL = `CREATE TABLE public.users (\n  id        bigint PRIMARY KEY,\n  email     text NOT NULL,\n  created_at timestamptz\n);`;
