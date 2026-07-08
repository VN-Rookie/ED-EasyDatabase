pub mod postgres;
pub mod mysql;
pub mod mongo;
pub mod redis;

use std::sync::Arc;
use async_trait::async_trait;

use crate::db;
use crate::error::AppError;
use crate::model::{ColumnInfo, ConnectionConfig, DeleteDocumentInput, DeleteRowInput, ForeignKeyInfo, IndexInfo, InsertDocumentInput, InsertRowInput, QueryResult, ReplaceDocumentInput, SchemaInfo, TableInfo, UpdateDocumentInput, UpdateRowInput, BatchEditInput, TableSchemaInfo, RefactorPreview};

#[async_trait]
pub trait Driver: Send + Sync {
    async fn ping(&self) -> Result<(), AppError>;
    async fn list_databases(&self) -> Result<Vec<String>, AppError>;
    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError>;
    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError>;
    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError>;
    async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError>;
    async fn get_refactor_preview(
        &self,
        table: &str,
        column: Option<&str>,
        new_name: &str,
    ) -> Result<RefactorPreview, AppError>;
    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError>;
    async fn list_foreign_keys(&self, _table: &str) -> Result<Vec<ForeignKeyInfo>, AppError> {
        // Default: not supported (MongoDB)
        Err(AppError::new("list_foreign_keys is not supported for this engine"))
    }
    /// Total rows (SQL) / documents (Mongo) in a table or collection.
    async fn count_rows(&self, table: &str) -> Result<u64, AppError>;
    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError>;
    /// MongoDB only: switch the browsed database. Default: unsupported.
    async fn set_database(&self, _db: &str) -> Result<(), AppError> {
        Err(AppError::new("set_database is not supported for this engine"))
    }

    /// Insert a new row into a table. Default: unsupported.
    async fn insert_row(&self, _input: InsertRowInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("insert_row is not supported for this engine"))
    }

    /// Update an existing row by primary key. Default: unsupported.
    async fn update_row(&self, _input: UpdateRowInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("update_row is not supported for this engine"))
    }

    /// Delete a row by primary key. Default: unsupported.
    async fn delete_row(&self, _input: DeleteRowInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("delete_row is not supported for this engine"))
    }

    /// Apply multiple edits atomically in a transaction. Default: unsupported.
    async fn apply_batch_edits(&self, _input: BatchEditInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("apply_batch_edits is not supported for this engine"))
    }

    /// Insert a document into a collection (MongoDB only). Default: unsupported.
    async fn insert_document(&self, _input: InsertDocumentInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("insert_document is not supported for this engine"))
    }

    /// Update documents in a collection (MongoDB only). Default: unsupported.
    async fn update_documents(&self, _input: UpdateDocumentInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("update_documents is not supported for this engine"))
    }

    /// Delete documents from a collection (MongoDB only). Default: unsupported.
    async fn delete_documents(&self, _input: DeleteDocumentInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("delete_documents is not supported for this engine"))
    }

    /// Replace a document in a collection (MongoDB only). Default: unsupported.
    async fn replace_document(&self, _input: ReplaceDocumentInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("replace_document is not supported for this engine"))
    }

    /// Query a MongoDB collection with optional filter, projection, sort, limit, skip. Default: unsupported.
    async fn query_collection(
        &self,
        _collection: &str,
        _filter_json: &str,
        _project_json: Option<&str>,
        _sort_json: Option<&str>,
        _sort_field: Option<&str>,
        _sort_asc: bool,
        _limit: i64,
        _skip: u64,
    ) -> Result<QueryResult, AppError> {
        Err(AppError::new("query_collection is not supported for this engine"))
    }

    /// Count documents matching a filter (MongoDB only). Default: unsupported.
    async fn count_documents(&self, _table: &str, _filter_json: &str) -> Result<u64, AppError> {
        Err(AppError::new("count_documents is not supported for this engine"))
    }

    /// Bulk insert data into a table.
    async fn bulk_insert(
        &self,
        _table: &str,
        _columns: &[String],
        _rows: Vec<Vec<serde_json::Value>>,
    ) -> Result<(), AppError> {
        Err(AppError::new("bulk_insert is not supported for this engine"))
    }

    /// Generate logical SQL/BSON dump for schema & data.
    async fn generate_logical_dump(&self) -> Result<String, AppError> {
        Err(AppError::new("generate_logical_dump is not supported for this engine"))
    }
}

/// Shared by PostgresDriver and MysqlDriver run_query.
pub(crate) fn is_select(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("TABLE")
        || upper.starts_with("VALUES")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("SHOW")
}

fn percent_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

/// The ONLY place that matches on engine type.
pub async fn connect(config: &ConnectionConfig) -> Result<Arc<dyn Driver>, AppError> {
    match config.db_type.as_str() {
        "postgres" => {
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                percent_encode(&config.username),
                percent_encode(&config.password),
                config.host,
                config.port,
                config.database
            );
            Ok(Arc::new(postgres::PostgresDriver {
                pool: db::connect_postgres(&url).await?,
                schema: std::sync::RwLock::new("public".to_string()),
            }))
        }
        "mysql" => {
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                percent_encode(&config.username),
                percent_encode(&config.password),
                config.host,
                config.port,
                config.database
            );
            Ok(Arc::new(mysql::MysqlDriver { pool: db::connect_mysql(&url).await? }))
        }
        "mongodb" => {
            if config.connection_string.is_empty() {
                return Err(AppError::new("MongoDB requires a connection string"));
            }
            let (client, default_db) = db::connect_mongo(&config.connection_string).await?;
            // Explicit Database field wins; otherwise use the default database
            // from the connection string; only then fall back to Mongo's "test".
            let initial = if !config.database.is_empty() {
                config.database.clone()
            } else {
                default_db.unwrap_or_else(|| "test".to_string())
            };
            Ok(Arc::new(mongo::MongoDriver::new(client, initial)))
        }
        "redis" => {
            let conn_url = if config.connection_string.is_empty()
                || (!config.connection_string.starts_with("redis://")
                    && !config.connection_string.starts_with("rediss://"))
            {
                if !config.password.is_empty() {
                    if !config.username.is_empty() {
                        format!(
                            "redis://{}:{}@{}:{}/",
                            percent_encode(&config.username),
                            percent_encode(&config.password),
                            config.host,
                            config.port
                        )
                    } else {
                        format!(
                            "redis://:{}@{}:{}/",
                            percent_encode(&config.password),
                            config.host,
                            config.port
                        )
                    }
                } else {
                    format!("redis://{}:{}/", config.host, config.port)
                }
            } else {
                config.connection_string.clone()
            };
            let client = ::redis::Client::open(conn_url).map_err(|e| AppError::new(e.to_string()))?;
            let driver = Arc::new(redis::RedisDriver::new(client));
            if !config.database.is_empty() {
                let _ = driver.set_database(&config.database).await;
            }
            Ok(driver)
        }
        t => Err(AppError::new(format!("Unsupported db type: {t}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_rejects_unknown_engine() {
        let cfg = ConnectionConfig {
            id: "x".into(), name: "x".into(), db_type: "sqlite".into(),
            host: String::new(), port: 0, database: String::new(),
            username: String::new(), password: String::new(), connection_string: String::new(),
        };
        let err = match connect(&cfg).await {
            Ok(_) => panic!("expected unknown engine to be rejected"),
            Err(e) => e,
        };
        assert!(err.0.contains("Unsupported db type"));
    }
}
