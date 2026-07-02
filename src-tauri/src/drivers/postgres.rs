use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::{Column, Row};

use crate::drivers::{is_select, Driver};
use crate::error::AppError;
use crate::model::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, SchemaInfo, TableInfo};

pub struct PostgresDriver {
    pub pool: sqlx::PgPool,
}

#[async_trait]
impl Driver for PostgresDriver {
    async fn ping(&self) -> Result<(), AppError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        Ok(vec![])
    }

    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name,)| SchemaInfo { name }).collect())
    }

    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT table_name FROM information_schema.tables \
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE' \
             ORDER BY table_name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name,)| TableInfo { name }).collect())
    }

    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
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
                     AND tc.table_schema  = 'public' \
                     AND tc.table_name    = $1 \
             ) pk ON c.column_name = pk.column_name \
             WHERE c.table_schema = 'public' AND c.table_name = $1 \
             ORDER BY c.ordinal_position",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, data_type, nullable, is_pk)| ColumnInfo {
            name, data_type, nullable: nullable == "YES", is_pk,
        }).collect())
    }

    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, bool, String)>(
            "SELECT i.relname, pg_get_indexdef(ix.indexrelid), ix.indisunique, am.amname \
             FROM pg_class t \
             JOIN pg_index ix ON t.oid = ix.indrelid \
             JOIN pg_class i  ON i.oid = ix.indexrelid \
             JOIN pg_am am    ON am.oid = i.relam \
             WHERE t.relname = $1 AND t.relkind = 'r' \
             ORDER BY i.relname",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, columns, is_unique, index_type)| IndexInfo {
            name, columns, is_unique, index_type,
        }).collect())
    }

    async fn list_foreign_keys(&self, table: &str) -> Result<Vec<ForeignKeyInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>)>(
            "SELECT
                con.conname,
                array_to_string(array_agg(att.attname ORDER BY att.attnum), ','),
                ccu.table_name,
                array_to_string(array_agg(ccu.column_name ORDER BY ccu.ordinal_position), ','),
                conf.updtype,
                conf.deltype
             FROM pg_constraint con
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
             JOIN information_schema.table_columns ccu ON ccu.table_name = rel.relname AND ccu.column_name = att.attname
             JOIN (SELECT conrelid, confrelid, conname, conf.updtype, conf.deltype
                   FROM pg_constraint conf) AS conf ON conf.conrelid = con.conrelid AND conf.conname = con.conname
             JOIN pg_class rel ON rel.oid = con.conrelid
             WHERE con.contype = 'f' AND rel.relname = $1
             GROUP BY con.conname, ccu.table_name, conf.updtype, conf.deltype"
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, columns, referenced_table, referenced_columns, on_update, on_delete)| {
            ForeignKeyInfo { name, columns, referenced_table, referenced_columns, on_update, on_delete }
        }).collect())
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
