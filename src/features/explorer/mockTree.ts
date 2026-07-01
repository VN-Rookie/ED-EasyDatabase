import type { OpenObject } from "../../stores/workspaceStore";

export interface TreeLeaf { id: string; label: string; engine: OpenObject["engine"]; kind: "table" | "view" | "collection"; }
export interface TreeGroup { label: string; leaves: TreeLeaf[]; }
export interface TreeConnection { id: string; label: string; engine: OpenObject["engine"]; groups: TreeGroup[]; }

export const MOCK_TREE: TreeConnection[] = [
  { id: "pg", label: "local-postgres", engine: "postgres", groups: [
    { label: "public", leaves: [
      { id: "pg:public.users", label: "users", engine: "postgres", kind: "table" },
      { id: "pg:public.orders", label: "orders", engine: "postgres", kind: "table" },
      { id: "pg:public.active_users", label: "active_users", engine: "postgres", kind: "view" },
    ]},
  ]},
  { id: "my", label: "local-mysql", engine: "mysql", groups: [
    { label: "shop", leaves: [
      { id: "my:shop.products", label: "products", engine: "mysql", kind: "table" },
      { id: "my:shop.carts", label: "carts", engine: "mysql", kind: "table" },
    ]},
  ]},
  { id: "mg", label: "atlas-mongo", engine: "mongodb", groups: [
    { label: "analytics", leaves: [
      { id: "mg:analytics.events", label: "events", engine: "mongodb", kind: "collection" },
      { id: "mg:analytics.sessions", label: "sessions", engine: "mongodb", kind: "collection" },
    ]},
  ]},
];
