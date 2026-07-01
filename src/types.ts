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
  // mongodb — used instead of the fields above
  connection_string: string;
}

export interface ConnectionMeta {
  id: string;
  name: string;
  db_type: DbType;
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

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_affected: number | null;
}

export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
};
