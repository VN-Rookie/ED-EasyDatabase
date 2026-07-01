pub mod postgres;
pub mod mysql;
pub mod mongo;

use std::sync::Arc;
use async_trait::async_trait;

use crate::db;
use crate::error::AppError;
use crate::model::{ColumnInfo, ConnectionConfig, IndexInfo, QueryResult, TableInfo};

#[async_trait]
pub trait Driver: Send + Sync {
    async fn ping(&self) -> Result<(), AppError>;
    async fn list_databases(&self) -> Result<Vec<String>, AppError>;
    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError>;
    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError>;
    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError>;
    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError>;
    /// MongoDB only: switch the browsed database. Default: unsupported.
    async fn set_database(&self, _db: &str) -> Result<(), AppError> {
        Err(AppError::new("set_database is not supported for this engine"))
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

/// The ONLY place that matches on engine type.
pub async fn connect(config: &ConnectionConfig) -> Result<Arc<dyn Driver>, AppError> {
    match config.db_type.as_str() {
        "postgres" => {
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                config.username, config.password, config.host, config.port, config.database
            );
            Ok(Arc::new(postgres::PostgresDriver { pool: db::connect_postgres(&url).await? }))
        }
        "mysql" => {
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                config.username, config.password, config.host, config.port, config.database
            );
            Ok(Arc::new(mysql::MysqlDriver { pool: db::connect_mysql(&url).await? }))
        }
        "mongodb" => {
            if config.connection_string.is_empty() {
                return Err(AppError::new("MongoDB requires a connection string"));
            }
            let client = db::connect_mongo(&config.connection_string).await?;
            let initial = if config.database.is_empty() { "test".to_string() } else { config.database.clone() };
            Ok(Arc::new(mongo::MongoDriver::new(client, initial)))
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
