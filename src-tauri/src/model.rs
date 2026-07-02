use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Value>,
    pub rows_affected: Option<u64>,
}

#[derive(Serialize)]
pub struct TableInfo {
    pub name: String,
}

#[derive(Serialize)]
pub struct SchemaInfo {
    pub name: String,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_pk: bool,
}

#[derive(Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: String,
    pub is_unique: bool,
    pub index_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub connection_string: String,
}

#[derive(Serialize, Clone)]
pub struct ConnectionMeta {
    pub id: String,
    pub name: String,
    pub db_type: String,
}
