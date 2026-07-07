use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::{Column, Row};

use crate::drivers::{is_select, Driver};
use crate::error::AppError;
use crate::model::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, SchemaInfo, TableInfo, BatchEditInput};

pub struct PostgresDriver {
    pub pool: sqlx::PgPool,
    pub schema: std::sync::RwLock<String>,
}

#[async_trait]
impl Driver for PostgresDriver {
    async fn ping(&self) -> Result<(), AppError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn set_database(&self, schema: &str) -> Result<(), AppError> {
        *self.schema.write().unwrap() = schema.to_string();
        let quoted = format!("\"{}\"", schema.replace('"', "\"\""));
        sqlx::query(&format!("SET search_path TO {}, public", quoted))
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        // Map PostgreSQL schemas into list_databases so that they appear as databases
        // in the frontend tree hierarchy.
        let schemas = self.list_schemas().await?;
        Ok(schemas.into_iter().map(|s| s.name).collect())
    }

    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT schema_name FROM information_schema.schemata \
             WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') \
             ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name,)| SchemaInfo { name }).collect())
    }

    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT table_name FROM information_schema.tables \
             WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN TABLE') \
             ORDER BY table_name",
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name,)| TableInfo { name }).collect())
    }

    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let rows = sqlx::query_as::<_, (String, String, String, bool)>(
            "SELECT c.column_name, c.data_type, c.is_nullable, \
             (pk.column_name IS NOT NULL) AS is_pk \
             FROM information_schema.columns c \
             LEFT JOIN ( \
                 SELECT kcu.column_name \
                 FROM information_schema.table_constraints tc \
                 JOIN information_schema.key_column_usage kcu \
                     ON tc.constraint_name = kcu.constraint_name \
                     AND tc.table_schema  = kcu.table_schema \
                     AND tc.table_name    = kcu.table_name \
                 WHERE tc.constraint_type = 'PRIMARY KEY' \
                     AND tc.table_schema  = $1 \
                     AND tc.table_name    = $2 \
             ) pk ON c.column_name = pk.column_name \
             WHERE c.table_schema = $1 AND c.table_name = $2 \
             ORDER BY c.ordinal_position",
        )
        .bind(&schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, data_type, nullable, is_pk)| ColumnInfo {
            name, data_type, nullable: nullable == "YES", is_pk,
        }).collect())
    }

    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let rows = sqlx::query_as::<_, (String, String, bool, String)>(
            "SELECT i.relname, pg_get_indexdef(ix.indexrelid), ix.indisunique, am.amname \
             FROM pg_class t \
             JOIN pg_index ix ON t.oid = ix.indrelid \
             JOIN pg_class i  ON i.oid = ix.indexrelid \
             JOIN pg_am am    ON am.oid = i.relam \
             JOIN pg_namespace n ON n.oid = t.relnamespace \
             WHERE n.nspname = $1 AND t.relname = $2 AND t.relkind = 'r' \
             ORDER BY i.relname",
        )
        .bind(&schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, columns, is_unique, index_type)| IndexInfo {
            name, columns, is_unique, index_type,
        }).collect())
    }

    async fn list_foreign_keys(&self, table: &str) -> Result<Vec<ForeignKeyInfo>, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>)>(
            "SELECT \
                con.conname, \
                array_to_string(array_agg(att.attname ORDER BY att.attnum), ','), \
                rel2.relname, \
                array_to_string(array_agg(att2.attname ORDER BY att2.attnum), ','), \
                con.confupdtype::text, \
                con.confdeltype::text \
             FROM pg_constraint con \
             JOIN pg_class rel  ON rel.oid = con.conrelid \
             JOIN pg_class rel2 ON rel2.oid = con.confrelid \
             JOIN pg_attribute att  ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey) \
             JOIN pg_attribute att2 ON att2.attrelid = con.confrelid AND att2.attnum = ANY(con.confkey) \
                 AND array_position(con.conkey, att.attnum) = array_position(con.confkey, att2.attnum) \
             JOIN pg_namespace n ON n.oid = rel.relnamespace \
             WHERE con.contype = 'f' AND n.nspname = $1 AND rel.relname = $2 \
             GROUP BY con.conname, rel2.relname, con.confupdtype, con.confdeltype"
        )
        .bind(&schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, columns, referenced_table, referenced_columns, on_update, on_delete)| {
            ForeignKeyInfo { name, columns, referenced_table, referenced_columns, on_update, on_delete }
        }).collect())
    }

    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let quoted = format!("\"{}\".\"{}\"", schema.replace('"', "\"\""), table.replace('"', "\"\""));
        let (count,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {quoted}"))
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }


    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        if !is_select(sql) {
            let r = sqlx::query(sql).execute(&self.pool).await?;
            return Ok(QueryResult { columns: vec![], rows: vec![], rows_affected: Some(r.rows_affected()) });
        }
        let rows = sqlx::query(sql).fetch_all(&self.pool).await?;
        if rows.is_empty() {
            return Ok(QueryResult { columns: vec![], rows: vec![], rows_affected: None });
        }
        let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
        let data = rows.iter().map(|row| {
            let mut map = serde_json::Map::new();
            for col in row.columns() {
                let i = col.ordinal();
                let val: Value = row.try_get::<Option<bool>, _>(i).map(|v| v.map_or(Value::Null, Value::Bool))
                    .or_else(|_| row.try_get::<Option<i64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<i32>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<i16>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<f64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<f32>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n as f64))))
                    .or_else(|_| row.try_get::<Option<chrono::NaiveDate>, _>(i).map(|v| v.map_or(Value::Null, |d| Value::String(d.to_string()))))
                    .or_else(|_| row.try_get::<Option<chrono::NaiveTime>, _>(i).map(|v| v.map_or(Value::Null, |t| Value::String(t.to_string()))))
                    .or_else(|_| row.try_get::<Option<chrono::NaiveDateTime>, _>(i).map(|v| v.map_or(Value::Null, |dt| Value::String(dt.to_string()))))
                    .or_else(|_| row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(i).map(|v| v.map_or(Value::Null, |dt| Value::String(dt.to_rfc3339()))))
                    .or_else(|_| row.try_get::<Option<bigdecimal::BigDecimal>, _>(i).map(|v| v.map_or(Value::Null, |n| Value::String(n.to_string()))))
                    .or_else(|_| row.try_get::<Option<sqlx::types::Json<serde_json::Value>>, _>(i).map(|v| v.map_or(Value::Null, |j| j.0)))
                    .or_else(|_| row.try_get::<Option<sqlx::types::Uuid>, _>(i).map(|v| v.map_or(Value::Null, |u| Value::String(u.to_string()))))
                    .or_else(|_| row.try_get::<Option<String>, _>(i).map(|v| v.map_or(Value::Null, Value::String)))
                    .unwrap_or(Value::Null);
                map.insert(col.name().to_string(), val);
            }
            Value::Object(map)
        }).collect();
        Ok(QueryResult { columns, rows: data, rows_affected: None })
    }

    async fn insert_row(&self, input: crate::model::InsertRowInput) -> Result<QueryResult, AppError> {
        let table = &input.table;
        let values = &input.values;

        if values.is_empty() {
            return Err(AppError::new("insert_row requires at least one value"));
        }

        let columns: Vec<String> = values.keys().cloned().collect();
        let values_list: Vec<String> = columns.iter()
            .filter_map(|col| values.get(col).map(|v| json_to_sql_literal(v)))
            .collect();

        let column_list = columns.join(", ");
        let value_list = values_list.join(", ");

        let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
            .await?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: Some(result.rows_affected()),
        })
    }

    async fn update_row(&self, input: crate::model::UpdateRowInput) -> Result<QueryResult, AppError> {
        let table = &input.table;
        let pk_column = &input.pk_column;
        let pk_value = &input.pk_value;
        let values = &input.values;

        if values.is_empty() {
            return Err(AppError::new("update_row requires at least one value"));
        }

        let set_clauses: Vec<String> = values.keys()
            .filter_map(|col| values.get(col).map(|v| format!("{} = {}", col, json_to_sql_literal(v))))
            .collect();
        let set_list = set_clauses.join(", ");
        let pk_literal = json_to_sql_literal(pk_value);

        let sql = format!("UPDATE {} SET {} WHERE {} = {}", table, set_list, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
            .await?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: Some(result.rows_affected()),
        })
    }

    async fn delete_row(&self, input: crate::model::DeleteRowInput) -> Result<QueryResult, AppError> {
        let table = &input.table;
        let pk_column = &input.pk_column;
        let pk_value = &input.pk_value;

        let pk_literal = json_to_sql_literal(pk_value);
        let sql = format!("DELETE FROM {} WHERE {} = {}", table, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
            .await?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: Some(result.rows_affected()),
        })
    }

    async fn apply_batch_edits(&self, input: BatchEditInput) -> Result<QueryResult, AppError> {
        let mut tx = self.pool.begin().await?;
        let mut total_affected = 0;

        let schema = self.schema.read().unwrap().clone();
        let table_quoted = format!("\"{}\".\"{}\"", schema.replace('"', "\"\""), input.table.replace('"', "\"\""));

        for upd in input.updates {
            let set_clauses: Vec<String> = upd.values.keys()
                .filter_map(|col| upd.values.get(col).map(|v| format!("\"{}\" = {}", col.replace('"', "\"\""), json_to_sql_literal(v))))
                .collect();
            let set_list = set_clauses.join(", ");
            let pk_literal = json_to_sql_literal(&upd.pk_value);
            let sql = format!("UPDATE {} SET {} WHERE \"{}\" = {}", table_quoted, set_list, upd.pk_column.replace('"', "\"\""), pk_literal);
            let r = sqlx::query(&sql).execute(&mut *tx).await?;
            total_affected += r.rows_affected();
        }

        for ins in input.inserts {
            if ins.values.is_empty() { continue; }
            let columns: Vec<String> = ins.values.keys().cloned().collect();
            let column_list = columns.iter().map(|c| format!("\"{}\"", c.replace('"', "\"\""))).collect::<Vec<_>>().join(", ");
            let values_list: Vec<String> = columns.iter()
                .filter_map(|col| ins.values.get(col).map(|v| json_to_sql_literal(v)))
                .collect();
            let value_list = values_list.join(", ");
            let sql = format!("INSERT INTO {} ({}) VALUES ({})", table_quoted, column_list, value_list);
            let r = sqlx::query(&sql).execute(&mut *tx).await?;
            total_affected += r.rows_affected();
        }

        for del in input.deletes {
            let pk_literal = json_to_sql_literal(&del.pk_value);
            let sql = format!("DELETE FROM {} WHERE \"{}\" = {}", table_quoted, del.pk_column.replace('"', "\"\""), pk_literal);
            let r = sqlx::query(&sql).execute(&mut *tx).await?;
            total_affected += r.rows_affected();
        }

        tx.commit().await?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: Some(total_affected),
        })
    }

    async fn bulk_insert(
        &self,
        table: &str,
        columns: &[String],
        rows: Vec<Vec<serde_json::Value>>,
    ) -> Result<(), AppError> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(());
        }

        let schema = self.schema.read().unwrap().clone();
        let table_quoted = format!("\"{}\".\"{}\"", schema.replace('"', "\"\""), table.replace('"', "\"\""));
        let col_list = columns.iter().map(|c| format!("\"{}\"", c.replace('"', "\"\""))).collect::<Vec<_>>().join(", ");

        let mut tx = self.pool.begin().await?;

        let params_per_row = columns.len();
        let max_rows_per_batch = 5000 / params_per_row;
        let max_rows_per_batch = std::cmp::max(1, max_rows_per_batch);

        for chunk in rows.chunks(max_rows_per_batch) {
            let mut sql = format!("INSERT INTO {} ({}) VALUES ", table_quoted, col_list);
            let mut values_parts = Vec::new();
            let mut param_index = 1;

            for _ in chunk {
                let mut row_placeholder = Vec::new();
                for _ in 0..params_per_row {
                    row_placeholder.push(format!("${}", param_index));
                    param_index += 1;
                }
                values_parts.push(format!("({})", row_placeholder.join(", ")));
            }
            sql.push_str(&values_parts.join(", "));

            let mut query = sqlx::query(&sql);
            for row in chunk {
                for val in row {
                    match val {
                        serde_json::Value::Null => {
                            query = query.bind(None::<String>);
                        }
                        serde_json::Value::Bool(b) => {
                            query = query.bind(*b);
                        }
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                query = query.bind(i);
                            } else if let Some(f) = n.as_f64() {
                                query = query.bind(f);
                            } else {
                                query = query.bind(n.to_string());
                            }
                        }
                        serde_json::Value::String(s) => {
                            query = query.bind(s.clone());
                        }
                        serde_json::Value::Array(a) => {
                            query = query.bind(serde_json::to_string(a).unwrap_or_default());
                        }
                        serde_json::Value::Object(o) => {
                            query = query.bind(serde_json::to_string(o).unwrap_or_default());
                        }
                    }
                }
            }

            query.execute(&mut *tx).await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn generate_logical_dump(&self) -> Result<String, AppError> {
        let schema = self.schema.read().unwrap().clone();
        let mut dump = String::new();
        dump.push_str(&format!("-- EasyDatabase Logical Backup\n-- Date: {}\n-- Schema: {}\n\n", chrono::Utc::now(), schema));

        let tables = self.list_tables().await?;

        for table_info in tables {
            let table = &table_info.name;
            let table_quoted = format!("\"{}\".\"{}\"", schema.replace('"', "\"\""), table.replace('"', "\"\""));

            dump.push_str(&format!("-- Structure for table {}\n", table_quoted));

            let columns = self.describe_table(table).await?;
            let mut col_defs = Vec::new();
            for col in &columns {
                let nullable_str = if col.nullable { "" } else { " NOT NULL" };
                let pk_str = if col.is_pk { " PRIMARY KEY" } else { "" };
                col_defs.push(format!("    \"{}\" {}{}{}", col.name.replace('"', "\"\""), col.data_type, nullable_str, pk_str));
            }
            dump.push_str(&format!("CREATE TABLE {} (\n{}\n);\n\n", table_quoted, col_defs.join(",\n")));

            dump.push_str(&format!("-- Data for table {}\n", table_quoted));
            let select_query = format!("SELECT * FROM {}", table_quoted);
            let data = self.run_query(&select_query).await?;
            if !data.rows.is_empty() && !data.columns.is_empty() {
                let col_names = data.columns.iter().map(|c| format!("\"{}\"", c.replace('"', "\"\""))).collect::<Vec<_>>().join(", ");
                for row in data.rows {
                    let mut values = Vec::new();
                    for col in &data.columns {
                        let val = &row[col];
                        values.push(json_to_sql_literal(val));
                    }
                    dump.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", table_quoted, col_names, values.join(", ")));
                }
            }
            dump.push_str("\n");
        }

        Ok(dump)
    }
}

/// Convert a JSON value to a SQL literal string (for Postgres).
fn json_to_sql_literal(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => if *b { "TRUE".to_string() } else { "FALSE".to_string() },
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", escape_sql_string(s)),
        serde_json::Value::Array(arr) => format!("'{}'", escape_sql_string(&serde_json::to_string(arr).unwrap_or_default())),
        serde_json::Value::Object(obj) => format!("'{}'", escape_sql_string(&serde_json::to_string(obj).unwrap_or_default())),
    }
}

/// Escape single quotes in SQL strings.
fn escape_sql_string(s: &str) -> String {
    s.replace('\'', "''")
}

// Live integration test against a real Postgres. Gated on TOOLSQL_TEST_PG=1 so the
// normal `cargo test` run (no DB) skips it. Run with:
//   TOOLSQL_TEST_PG=1 cargo test postgres_live -- --nocapture
#[cfg(test)]
mod live_tests {
    use crate::drivers::connect;
    use crate::model::ConnectionConfig;

    fn demo_config() -> ConnectionConfig {
        ConnectionConfig {
            id: "live".into(), name: "demo".into(), db_type: "postgres".into(),
            host: "localhost".into(), port: 5432, database: "toolsql_demo".into(),
            username: "postgres".into(), password: "postgres".into(),
            connection_string: String::new(),
        }
    }

    #[tokio::test]
    async fn postgres_live_all_functions() {
        if std::env::var("TOOLSQL_TEST_PG").is_err() {
            eprintln!("SKIP postgres_live_all_functions (set TOOLSQL_TEST_PG=1 to run)");
            return;
        }

        // connect (factory)
        let driver = connect(&demo_config()).await.expect("connect failed");
        eprintln!("[OK] connect            -> Arc<dyn Driver>");

        // ping
        driver.ping().await.expect("ping failed");
        eprintln!("[OK] ping               -> healthy");

        // list_databases (known: postgres driver returns empty)
        let dbs = driver.list_databases().await.expect("list_databases failed");
        eprintln!("[OK] list_databases     -> {} entries (postgres returns [])", dbs.len());

        // list_tables
        let tables = driver.list_tables().await.expect("list_tables failed");
        let names: Vec<&str> = tables.iter().map(|t| t.name.as_str()).collect();
        eprintln!("[OK] list_tables        -> {:?}", names);
        assert!(names.contains(&"users") && names.contains(&"orders"), "expected users+orders");
        assert!(!names.contains(&"active_users"), "view must be excluded (BASE TABLE only)");

        // describe_table
        let cols = driver.describe_table("users").await.expect("describe_table failed");
        eprintln!("[OK] describe_table     -> {} columns", cols.len());
        let id = cols.iter().find(|c| c.name == "id").expect("id column");
        assert!(id.is_pk, "id must be PK");
        let email = cols.iter().find(|c| c.name == "email").expect("email column");
        assert!(!email.nullable, "email must be NOT NULL");
        let full_name = cols.iter().find(|c| c.name == "full_name").expect("full_name column");
        assert!(full_name.nullable, "full_name must be nullable");
        for c in &cols { eprintln!("       - {:<12} {:<14} pk={} null={}", c.name, c.data_type, c.is_pk, c.nullable); }

        // list_indexes
        let idx = driver.list_indexes("users").await.expect("list_indexes failed");
        eprintln!("[OK] list_indexes       -> {} indexes", idx.len());
        assert!(idx.iter().any(|i| i.is_unique), "expected at least one unique index");
        for i in &idx { eprintln!("       - {:<22} unique={} type={}", i.name, i.is_unique, i.index_type); }

        // run_query (SELECT)
        let res = driver.run_query("SELECT id, email, full_name, is_active, balance FROM users ORDER BY id").await.expect("select failed");
        eprintln!("[OK] run_query SELECT   -> {} cols, {} rows", res.columns.len(), res.rows.len());
        assert_eq!(res.rows.len(), 3, "expected 3 user rows");
        assert!(res.columns.contains(&"email".to_string()));
        // NULL handling
        let grace = res.rows.iter().find(|r| r["email"] == serde_json::json!("grace@example.com")).expect("grace row");
        assert!(grace["full_name"].is_null(), "grace.full_name must serialize as null");

        // run_query (DML -> rows_affected)
        let upd = driver.run_query("UPDATE users SET is_active = true WHERE id = 3").await.expect("update failed");
        eprintln!("[OK] run_query UPDATE   -> rows_affected={:?}", upd.rows_affected);
        assert_eq!(upd.rows_affected, Some(1));

        eprintln!("\nALL POSTGRES DRIVER FUNCTIONS PASSED");
    }
}
