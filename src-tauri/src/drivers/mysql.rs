use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::{Column, Row};

use crate::drivers::{is_select, Driver};
use crate::error::AppError;
use crate::model::{ColumnInfo, IndexInfo, QueryResult, TableInfo};

pub struct MysqlDriver {
    pub pool: sqlx::MySqlPool,
}

#[async_trait]
impl Driver for MysqlDriver {
    async fn ping(&self) -> Result<(), AppError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        Ok(vec![])
    }

    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String,)>("SHOW TABLES")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|(name,)| TableInfo { name }).collect())
    }

    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT column_name, column_type, is_nullable, column_key \
             FROM information_schema.columns \
             WHERE table_schema = DATABASE() AND table_name = ? \
             ORDER BY ordinal_position",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, data_type, nullable, key)| ColumnInfo {
            name,
            data_type,
            nullable: nullable.eq_ignore_ascii_case("YES"),
            is_pk:    key.eq_ignore_ascii_case("PRI"),
        }).collect())
    }

    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, i64)>(
            "SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', '), \
             MIN(NON_UNIQUE) \
             FROM information_schema.STATISTICS \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? \
             GROUP BY INDEX_NAME",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name, columns, non_unique)| IndexInfo {
            is_unique: non_unique == 0,
            index_type: if name == "PRIMARY" { "primary".to_string() } else { "btree".to_string() },
            name,
            columns,
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
                    .or_else(|_| row.try_get::<Option<u64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<f64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                    .or_else(|_| row.try_get::<Option<f32>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n as f64))))
                    .or_else(|_| row.try_get::<Option<sqlx::types::Json<serde_json::Value>>, _>(i).map(|v| v.map_or(Value::Null, |j| j.0)))
                    .or_else(|_| row.try_get::<Option<String>, _>(i).map(|v| v.map_or(Value::Null, Value::String)))
                    .unwrap_or(Value::Null);
                map.insert(col.name().to_string(), val);
            }
            Value::Object(map)
        }).collect();
        Ok(QueryResult { columns, rows: data, rows_affected: None })
    }
}
