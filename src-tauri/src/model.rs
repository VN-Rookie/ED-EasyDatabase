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

#[derive(Serialize)]
pub struct ForeignKeyInfo {
    pub name: String,
    pub columns: String,
    pub referenced_table: String,
    pub referenced_columns: String,
    pub on_update: Option<String>,
    pub on_delete: Option<String>,
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

/// Input for inserting a row
#[derive(Deserialize, Clone)]
pub struct InsertRowInput {
    pub table: String,
    pub values: serde_json::Map<String, serde_json::Value>,
}

/// Input for updating a row
#[derive(Deserialize, Clone)]
pub struct UpdateRowInput {
    pub table: String,
    pub pk_column: String,
    pub pk_value: serde_json::Value,
    pub values: serde_json::Map<String, serde_json::Value>,
}

/// Input for deleting a row
#[derive(Deserialize, Clone)]
pub struct DeleteRowInput {
    pub table: String,
    pub pk_column: String,
    pub pk_value: serde_json::Value,
}

/// Result for execute operations (INSERT/UPDATE/DELETE/DDL)
#[derive(Serialize)]
pub struct ExecResult {
    pub rows_affected: u64,
}

/// Input for inserting a MongoDB document
#[derive(Deserialize)]
pub struct InsertDocumentInput {
    pub collection: String,
    pub document: serde_json::Map<String, serde_json::Value>,
}

/// Input for updating MongoDB documents
#[derive(Deserialize)]
pub struct UpdateDocumentInput {
    pub collection: String,
    pub filter: serde_json::Map<String, serde_json::Value>,
    pub update: serde_json::Map<String, serde_json::Value>,
    pub upsert: Option<bool>,
}

/// Input for deleting MongoDB documents
#[derive(Deserialize)]
pub struct DeleteDocumentInput {
    pub collection: String,
    pub filter: serde_json::Map<String, serde_json::Value>,
}

/// Input for replacing a MongoDB document
#[derive(Deserialize)]
pub struct ReplaceDocumentInput {
    pub collection: String,
    pub filter: serde_json::Map<String, serde_json::Value>,
    pub replacement: serde_json::Map<String, serde_json::Value>,
    pub upsert: Option<bool>,
}

/// Input for executing batch operations atomically in a transaction
#[derive(Deserialize, Clone)]
pub struct BatchEditInput {
    pub table: String,
    pub updates: Vec<UpdateRowInput>,
    pub inserts: Vec<InsertRowInput>,
    pub deletes: Vec<DeleteRowInput>,
}

