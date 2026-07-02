export type DbType = "postgres" | "mysql" | "mongodb";

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: DbType;
  // postgres / mysql
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  // mongodb — used instead of the host/port fields above
  connection_string: string;
}

export interface ConnectionMeta {
  id: string;
  name: string;
  db_type: DbType;
}

export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
};

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  name: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  is_pk: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string;
  is_unique: boolean;
  index_type: string;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string;
  referenced_table: string;
  referenced_columns: string;
  on_update: string | null;
  on_delete: string | null;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_affected: number | null;
}
