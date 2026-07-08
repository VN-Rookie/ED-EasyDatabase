use async_trait::async_trait;

use crate::drivers::Driver;
use crate::error::AppError;
use crate::model::{ColumnInfo, IndexInfo, QueryResult, SchemaInfo, TableInfo, TableSchemaInfo, RefactorPreview, DependencyInfo};

pub struct RedisDriver {
    pub client: ::redis::Client,
    pub db_index: std::sync::RwLock<u32>,
}

impl RedisDriver {
    pub fn new(client: ::redis::Client) -> Self {
        Self {
            client,
            db_index: std::sync::RwLock::new(0),
        }
    }

    async fn get_connection(&self) -> Result<::redis::aio::MultiplexedConnection, AppError> {
        let mut conn = self.client.get_multiplexed_tokio_connection()
            .await
            .map_err(|e| AppError::new(e.to_string()))?;
        
        // Always select active database index before running queries
        let db = *self.db_index.read().unwrap();
        let _: () = ::redis::cmd("SELECT")
            .arg(db)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(conn)
    }
}

#[async_trait]
impl Driver for RedisDriver {
    async fn ping(&self) -> Result<(), AppError> {
        let mut conn = self.get_connection().await?;
        let _: String = ::redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;
        Ok(())
    }

    async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        // Return standard 16 Redis logical databases
        Ok((0..16).map(|i| i.to_string()).collect())
    }

    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError> {
        Ok(vec![])
    }

    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let mut conn = self.get_connection().await?;
        let mut keys = Vec::new();
        let mut cursor = "0".to_string();

        // Safe cursor SCAN to prevent blocking on production instances
        loop {
            let (next_cursor, batch): (String, Vec<String>) = ::redis::cmd("SCAN")
                .arg(&cursor)
                .arg("COUNT")
                .arg("500")
                .query_async(&mut conn)
                .await
                .map_err(|e| AppError::new(e.to_string()))?;

            keys.extend(batch);
            cursor = next_cursor;

            if cursor == "0" || keys.len() >= 1000 {
                break;
            }
        }

        // Sort keys alphabetically
        keys.sort();
        Ok(keys.into_iter().map(|name| TableInfo { name }).collect())
    }

    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
        let mut conn = self.get_connection().await?;
        
        let key_type: String = ::redis::cmd("TYPE")
            .arg(table)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        let ttl: i64 = ::redis::cmd("TTL")
            .arg(table)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        let size: u64 = match key_type.as_str() {
            "string" => ::redis::cmd("STRLEN").arg(table).query_async(&mut conn).await.unwrap_or(0),
            "hash" => ::redis::cmd("HLEN").arg(table).query_async(&mut conn).await.unwrap_or(0),
            "list" => ::redis::cmd("LLEN").arg(table).query_async(&mut conn).await.unwrap_or(0),
            "set" => ::redis::cmd("SCARD").arg(table).query_async(&mut conn).await.unwrap_or(0),
            "zset" => ::redis::cmd("ZCARD").arg(table).query_async(&mut conn).await.unwrap_or(0),
            _ => 0,
        };

        Ok(vec![
            ColumnInfo {
                name: "Type".to_string(),
                data_type: key_type,
                nullable: false,
                is_pk: false,
            },
            ColumnInfo {
                name: "TTL (seconds)".to_string(),
                data_type: ttl.to_string(),
                nullable: false,
                is_pk: false,
            },
            ColumnInfo {
                name: "Size / Length".to_string(),
                data_type: size.to_string(),
                nullable: false,
                is_pk: false,
            },
        ])
    }

    async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
        Ok(vec![])
    }

    async fn get_refactor_preview(
        &self,
        table: &str,
        column: Option<&str>,
        new_name: &str,
    ) -> Result<RefactorPreview, AppError> {
        let generated_ddl = if let Some(col) = column {
            format!("-- Redis has no column structure, column rename not applicable: {} -> {}", col, new_name)
        } else {
            format!("RENAME \"{}\" \"{}\"", table, new_name)
        };

        Ok(RefactorPreview {
            dependencies: vec![],
            generated_ddl,
        })
    }

    async fn list_indexes(&self, _table: &str) -> Result<Vec<IndexInfo>, AppError> {
        Ok(vec![])
    }

    async fn count_rows(&self, _table: &str) -> Result<u64, AppError> {
        let mut conn = self.get_connection().await?;
        let size: u64 = ::redis::cmd("DBSIZE")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;
        Ok(size)
    }

    async fn set_database(&self, db: &str) -> Result<(), AppError> {
        let db_idx: u32 = db.parse().map_err(|e| AppError::new(format!("Invalid database index: {e}")))?;
        *self.db_index.write().unwrap() = db_idx;
        Ok(())
    }

    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let args = parse_redis_command(sql);
        if args.is_empty() {
            return Err(AppError::new("Empty command"));
        }

        let mut conn = self.get_connection().await?;
        let mut cmd = ::redis::cmd(&args[0]);
        for arg in &args[1..] {
            cmd.arg(arg);
        }

        let res_val: ::redis::Value = cmd.query_async(&mut conn)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(format_redis_value(res_val))
    }
}

fn parse_redis_command(sql: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = ' ';

    for c in sql.chars() {
        if in_quotes {
            if c == quote_char {
                in_quotes = false;
            } else {
                current.push(c);
            }
        } else if c == '\'' || c == '"' {
            in_quotes = true;
            quote_char = c;
        } else if c.is_whitespace() {
            if !current.is_empty() {
                args.push(current.clone());
                current.clear();
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

fn format_redis_value(val: ::redis::Value) -> QueryResult {
    match val {
        ::redis::Value::Nil => QueryResult {
            columns: vec!["Result".to_string()],
            rows: vec![serde_json::json!({ "Result": "nil" })],
            rows_affected: None,
        },
        ::redis::Value::Int(i) => QueryResult {
            columns: vec!["Value".to_string()],
            rows: vec![serde_json::json!({ "Value": i })],
            rows_affected: None,
        },
        ::redis::Value::Data(bytes) => {
            let s = String::from_utf8_lossy(&bytes).into_owned();
            QueryResult {
                columns: vec!["Value".to_string()],
                rows: vec![serde_json::json!({ "Value": s })],
                rows_affected: None,
            }
        },
        ::redis::Value::Status(s) => QueryResult {
            columns: vec!["Status".to_string()],
            rows: vec![serde_json::json!({ "Status": s })],
            rows_affected: None,
        },
        ::redis::Value::Okay => QueryResult {
            columns: vec!["Status".to_string()],
            rows: vec![serde_json::json!({ "Status": "OK" })],
            rows_affected: None,
        },
        ::redis::Value::Bulk(arr) => {
            let mut rows = Vec::new();
            let mut columns = Vec::new();

            if arr.len() % 2 == 0 && arr.iter().all(|x| matches!(x, ::redis::Value::Data(_))) {
                columns.push("Field".to_string());
                columns.push("Value".to_string());
                for i in (0..arr.len()).step_by(2) {
                    let f = match &arr[i] {
                        ::redis::Value::Data(b) => String::from_utf8_lossy(b).into_owned(),
                        _ => "".to_string(),
                    };
                    let v = match &arr[i+1] {
                        ::redis::Value::Data(b) => String::from_utf8_lossy(b).into_owned(),
                        _ => "".to_string(),
                    };
                    rows.push(serde_json::json!({ "Field": f, "Value": v }));
                }
            } else {
                columns.push("Index".to_string());
                columns.push("Value".to_string());
                for (idx, item) in arr.into_iter().enumerate() {
                    let val_str = match item {
                        ::redis::Value::Nil => "nil".to_string(),
                        ::redis::Value::Int(i) => i.to_string(),
                        ::redis::Value::Data(b) => String::from_utf8_lossy(&b).into_owned(),
                        ::redis::Value::Status(s) => s,
                        ::redis::Value::Okay => "OK".to_string(),
                        _ => format!("{:?}", item),
                    };
                    rows.push(serde_json::json!({ "Index": idx, "Value": val_str }));
                }
            }
            QueryResult {
                columns,
                rows,
                rows_affected: None,
            }
        }
    }
}
