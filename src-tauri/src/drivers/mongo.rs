use std::sync::RwLock;

use async_trait::async_trait;
use mongodb::bson::{Document, Bson};
use serde_json::{json, Map, Value};

use crate::drivers::Driver;
use crate::error::AppError;
use crate::model::{ColumnInfo, DeleteDocumentInput, IndexInfo, InsertDocumentInput, QueryResult, ReplaceDocumentInput, SchemaInfo, TableInfo, UpdateDocumentInput, BatchEditInput};

pub struct MongoDriver {
    client: mongodb::Client,
    db: RwLock<String>,
}

impl MongoDriver {
    pub fn new(client: mongodb::Client, db: String) -> Self {
        Self { client, db: RwLock::new(db) }
    }
    fn current_db(&self) -> String {
        self.db.read().unwrap().clone()
    }

    /// Execute a console MQL query (`db.<collection>.find/countDocuments`).
    async fn run_mql(&self, db: &str, input: &str) -> Result<QueryResult, AppError> {
        use futures_util::StreamExt;

        match parse_mql(input)? {
            MqlOp::Count { collection, filter } => {
                let coll: mongodb::Collection<Document> =
                    self.client.database(db).collection(&collection);
                let count = coll.count_documents(filter).await
                    .map_err(|e| AppError::new(e.to_string()))?;
                Ok(QueryResult {
                    columns: vec!["count".to_string()],
                    rows: vec![json!({ "count": count })],
                    rows_affected: None,
                })
            }
            MqlOp::Find { collection, filter, projection, sort, limit, skip } => {
                let coll: mongodb::Collection<Document> =
                    self.client.database(db).collection(&collection);
                let mut find = coll.find(filter).limit(limit).skip(skip);
                if let Some(p) = projection { find = find.projection(p); }
                if let Some(s) = sort { find = find.sort(s); }
                let mut cursor = find.await.map_err(|e| AppError::new(e.to_string()))?;
                let mut all_docs: Vec<Document> = Vec::new();
                while let Some(doc) = cursor.next().await {
                    all_docs.push(doc.map_err(|e| AppError::new(e.to_string()))?);
                }
                Ok(docs_to_result(all_docs))
            }
        }
    }
}

/// Convert serde_json::Value to Bson
fn json_to_bson(value: &Value) -> Bson {
    match value {
        Value::Null => Bson::Null,
        Value::Bool(b) => Bson::Boolean(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Bson::Int64(i)
            } else if let Some(f) = n.as_f64() {
                Bson::Double(f)
            } else {
                Bson::Double(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => Bson::String(s.clone()),
        Value::Array(arr) => {
            let elements: Vec<Bson> = arr.iter().map(json_to_bson).collect();
            Bson::Array(elements)
        }
        Value::Object(map) => {
            let doc: Document = map.iter()
                .map(|(k, v)| (k.clone(), json_to_bson(v)))
                .collect();
            Bson::Document(doc)
        }
    }
}

/// Grid rows carry `_id` as the hex string form of an ObjectId
/// (see docs_to_result). Convert it back so PK filters actually match.
/// Collections whose `_id` is a genuine 24-hex *string* lose to the
/// ObjectId interpretation — the overwhelmingly common case wins.
fn coerce_pk_bson(pk_column: &str, value: Bson) -> Bson {
    if pk_column == "_id" {
        if let Bson::String(s) = &value {
            if let Ok(oid) = mongodb::bson::oid::ObjectId::parse_str(s) {
                return Bson::ObjectId(oid);
            }
        }
    }
    value
}

/// Convert serde_json::Map to Bson Document
fn json_map_to_doc(map: &Map<String, Value>) -> Result<Document, AppError> {
    let mut doc = Document::new();
    for (key, value) in map {
        let bson_val = json_to_bson(value);
        let coerced = if key == "_id" {
            coerce_pk_bson(key, bson_val)
        } else {
            bson_val
        };
        doc.insert(key.clone(), coerced);
    }
    Ok(doc)
}

/// Convert fetched documents into a QueryResult (columns = union of field
/// names across docs, `_id` first; exotic Bson degrades to its string form).
fn docs_to_result(all_docs: Vec<Document>) -> QueryResult {
    if all_docs.is_empty() {
        return QueryResult { columns: vec![], rows: vec![], rows_affected: None };
    }

    let mut field_set: std::collections::LinkedList<String> = std::collections::LinkedList::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    // _id always first
    if seen.insert("_id".to_string()) { field_set.push_back("_id".to_string()); }
    for doc in &all_docs {
        for key in doc.keys() {
            if key != "_id" && seen.insert(key.to_string()) {
                field_set.push_back(key.to_string());
            }
        }
    }
    let columns: Vec<String> = field_set.into_iter().collect();

    let rows = all_docs.iter().map(|doc| {
        let mut map = serde_json::Map::new();
        for col in &columns {
            let val = match doc.get(col.as_str()) {
                None => Value::Null,
                Some(Bson::Null) => Value::Null,
                Some(Bson::Boolean(b)) => Value::Bool(*b),
                Some(Bson::Int32(n)) => json!(n),
                Some(Bson::Int64(n)) => json!(n),
                Some(Bson::Double(n)) => json!(n),
                Some(Bson::String(s)) => Value::String(s.clone()),
                Some(Bson::ObjectId(oid)) => Value::String(oid.to_hex()),
                Some(Bson::DateTime(dt)) => Value::String(dt.to_string()),
                Some(other) => Value::String(other.to_string()),
            };
            map.insert(col.clone(), val);
        }
        Value::Object(map)
    }).collect();

    QueryResult { columns, rows, rows_affected: None }
}

/// Parse a simple SELECT generated by loadTableData:
/// SELECT * FROM "col" [WHERE ...] [ORDER BY "f" ASC|DESC] LIMIT n OFFSET n
struct ParsedMongo {
    collection: String,
    limit: u32,
    skip: u32,
    sort_field: Option<String>,
    sort_asc: bool,
}

fn parse_mongo_select(sql: &str) -> Option<ParsedMongo> {
    let upper = sql.to_uppercase();
    // Collection name after FROM
    let from_idx = upper.find("FROM ")? + 5;
    let after_from = sql[from_idx..].trim();
    let collection = if after_from.starts_with('"') {
        let end = after_from[1..].find('"')? + 1;
        after_from[1..end].to_string()
    } else {
        after_from.split_whitespace().next()?.to_string()
    };

    // LIMIT
    let limit = upper.find("LIMIT ")
        .map(|pos| sql[pos + 6..].split_whitespace().next()
            .and_then(|s| s.parse().ok()).unwrap_or(50))
        .unwrap_or(50);

    // OFFSET
    let skip = upper.find("OFFSET ")
        .map(|pos| sql[pos + 7..].split_whitespace().next()
            .and_then(|s| s.parse().ok()).unwrap_or(0))
        .unwrap_or(0);

    // ORDER BY
    let (sort_field, sort_asc) = if let Some(pos) = upper.find("ORDER BY ") {
        let after = sql[pos + 9..].trim();
        let field = if after.starts_with('"') {
            after[1..].find('"').map(|end| after[1..=end].to_string())
        } else {
            None
        };
        let asc = !upper.contains(" DESC");
        (field, asc)
    } else {
        (None, true)
    };

    Some(ParsedMongo { collection, limit, skip, sort_field, sort_asc })
}

/// Cap applied to console MQL find() queries that don't specify .limit(n).
const DEFAULT_MQL_LIMIT: i64 = 100;

/// One parsed call in a `db.<coll>.method(args).method(args)` chain.
struct MqlCall {
    method: String,
    args: String, // raw text between the parens
}

/// A supported MongoDB console operation.
#[derive(Debug)]
enum MqlOp {
    Find {
        collection: String,
        filter: Document,
        projection: Option<Document>,
        sort: Option<Document>,
        limit: i64,
        skip: u64,
    },
    Count { collection: String, filter: Document },
}

/// Extract the contents of a balanced `(...)` that `s` starts with.
/// Returns (inner, rest_after_closing_paren). Respects strings and nesting.
fn extract_parens(s: &str) -> Option<(String, &str)> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'(') { return None; }
    let mut depth: i32 = 0;
    let mut in_str: Option<u8> = None;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate() {
        if let Some(q) = in_str {
            if escaped { escaped = false; }
            else if b == b'\\' { escaped = true; }
            else if b == q { in_str = None; }
            continue;
        }
        match b {
            b'"' | b'\'' => in_str = Some(b),
            b'(' | b'{' | b'[' => depth += 1,
            b')' | b'}' | b']' => {
                depth -= 1;
                if depth == 0 && b == b')' {
                    return Some((s[1..i].trim().to_string(), &s[i + 1..]));
                }
                if depth < 0 { return None; }
            }
            _ => {}
        }
    }
    None
}

/// Parse `db.<collection>.method(args)[.method(args)...]` (trailing `;` ok).
fn parse_mql_chain(input: &str) -> Option<(String, Vec<MqlCall>)> {
    let s = input.trim().trim_end_matches(';').trim();
    let rest = s.strip_prefix("db.")?;
    let dot = rest.find('.')?;
    let collection = rest[..dot].trim().to_string();
    if collection.is_empty() { return None; }
    let mut rest = &rest[dot + 1..];
    let mut calls = Vec::new();
    loop {
        let paren = rest.find('(')?;
        let method = rest[..paren].trim().to_string();
        if method.is_empty() || !method.chars().all(|c| c.is_ascii_alphanumeric()) {
            return None;
        }
        let (args, after) = extract_parens(&rest[paren..])?;
        calls.push(MqlCall { method, args });
        let after = after.trim_start();
        if after.is_empty() { break; }
        rest = after.strip_prefix('.')?;
    }
    Some((collection, calls))
}

/// Split `find(filter, projection)` args at top-level commas only.
fn split_top_level_comma(s: &str) -> Vec<String> {
    let bytes = s.as_bytes();
    let mut depth: i32 = 0;
    let mut in_str: Option<u8> = None;
    let mut escaped = false;
    let mut parts = Vec::new();
    let mut start = 0usize;
    for (i, &b) in bytes.iter().enumerate() {
        if let Some(q) = in_str {
            if escaped { escaped = false; }
            else if b == b'\\' { escaped = true; }
            else if b == q { in_str = None; }
            continue;
        }
        match b {
            b'"' | b'\'' => in_str = Some(b),
            b'(' | b'{' | b'[' => depth += 1,
            b')' | b'}' | b']' => depth -= 1,
            b',' if depth == 0 => { parts.push(s[start..i].trim().to_string()); start = i + 1; }
            _ => {}
        }
    }
    parts.push(s[start..].trim().to_string());
    parts
}

/// Parse a JSON object argument ("" -> empty doc). Strict JSON: keys must be
/// double-quoted; the error message says so.
fn parse_json_doc(raw: &str) -> Result<Document, AppError> {
    let raw = raw.trim();
    if raw.is_empty() { return Ok(Document::new()); }
    let value: Value = serde_json::from_str(raw).map_err(|e| {
        AppError::new(format!(
            "Invalid JSON in MongoDB query (keys and strings must be double-quoted): {e}"
        ))
    })?;
    match value {
        Value::Object(map) => json_map_to_doc(&map),
        _ => Err(AppError::new("MongoDB query argument must be a JSON object")),
    }
}

fn parse_mql(input: &str) -> Result<MqlOp, AppError> {
    let unsupported = || AppError::new(
        "Unsupported MongoDB query. Supported: db.<collection>.find({filter}, {projection}?)\
         .sort({...})?.limit(n)?.skip(n)? and db.<collection>.countDocuments({filter}?)",
    );
    let (collection, calls) = parse_mql_chain(input).ok_or_else(unsupported)?;
    let first = calls.first().ok_or_else(unsupported)?;

    match first.method.as_str() {
        "countDocuments" | "count" => {
            if calls.len() > 1 { return Err(unsupported()); }
            Ok(MqlOp::Count { collection, filter: parse_json_doc(&first.args)? })
        }
        "find" | "findOne" => {
            let parts = split_top_level_comma(&first.args);
            if parts.len() > 2 { return Err(unsupported()); }
            let filter = parse_json_doc(&parts[0])?;
            let projection = match parts.get(1) {
                Some(p) if !p.is_empty() => Some(parse_json_doc(p)?),
                _ => None,
            };
            let mut sort = None;
            let mut limit = if first.method == "findOne" { 1 } else { DEFAULT_MQL_LIMIT };
            let mut skip = 0u64;
            for call in &calls[1..] {
                match call.method.as_str() {
                    "sort" => sort = Some(parse_json_doc(&call.args)?),
                    "limit" => limit = call.args.trim().parse::<i64>()
                        .map_err(|_| AppError::new("limit(n) expects an integer"))?,
                    "skip" => skip = call.args.trim().parse::<u64>()
                        .map_err(|_| AppError::new("skip(n) expects an integer"))?,
                    _ => return Err(unsupported()),
                }
            }
            Ok(MqlOp::Find { collection, filter, projection, sort, limit, skip })
        }
        _ => Err(unsupported()),
    }
}

#[async_trait]
impl Driver for MongoDriver {
    async fn ping(&self) -> Result<(), AppError> {
        self.client.list_database_names().await.map(|_| ()).map_err(|e| AppError::new(e.to_string()))
    }

    async fn set_database(&self, db: &str) -> Result<(), AppError> {
        *self.db.write().unwrap() = db.to_string();
        Ok(())
    }

    async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        let system = ["admin", "config", "local"];
        let mut names = self.client
            .list_database_names()
            .await
            .map_err(|e| AppError::new(e.to_string()))?;
        names.retain(|n| !system.contains(&n.as_str()));
        names.sort();
        Ok(names)
    }

    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError> {
        // MongoDB: schemas don't exist. Return current database as the single "schema".
        Ok(vec![SchemaInfo { name: self.current_db() }])
    }

    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let database = self.client.database(&self.current_db());
        let names = database
            .list_collection_names()
            .await
            .map_err(|e| AppError::new(e.to_string()))?;
        let mut sorted = names;
        sorted.sort();
        Ok(sorted.into_iter().map(|name| TableInfo { name }).collect())
    }

    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
        // Sample up to 10 documents to discover field names
        use mongodb::bson::Document;
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(table);

        let mut cursor = collection
            .find(mongodb::bson::doc! {})
            .limit(10)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        let mut field_set: std::collections::LinkedList<String> = std::collections::LinkedList::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

        use futures_util::StreamExt;
        while let Some(doc) = cursor.next().await {
            if let Ok(doc) = doc {
                for key in doc.keys() {
                    if seen.insert(key.to_string()) {
                        field_set.push_back(key.to_string());
                    }
                }
            }
        }

        Ok(field_set.into_iter().map(|name| ColumnInfo {
            is_pk: name == "_id",
            data_type: if name == "_id" { "ObjectId".into() } else { "mixed".into() },
            nullable: name != "_id",
            name,
        }).collect())
    }

    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError> {
        use mongodb::bson::Bson;
        use futures_util::StreamExt;
        use mongodb::bson::Document;

        let coll: mongodb::Collection<Document> = self.client.database(&self.current_db()).collection(table);
        let mut cursor = coll.list_indexes().await
            .map_err(|e| AppError::new(e.to_string()))?;

        let mut indexes = Vec::new();
        while let Some(model) = cursor.next().await {
            let model = model.map_err(|e| AppError::new(e.to_string()))?;
            let name = model.options.as_ref()
                .and_then(|o| o.name.as_deref())
                .unwrap_or("unknown")
                .to_string();
            let is_unique = model.options.as_ref()
                .and_then(|o| o.unique)
                .unwrap_or(false);
            let columns = model.keys.iter().map(|(k, v)| {
                let dir = match v {
                    Bson::Int32(1) | Bson::Int64(1) => "asc",
                    _ => "desc",
                };
                format!("{}: {}", k, dir)
            }).collect::<Vec<_>>().join(", ");
            indexes.push(IndexInfo {
                name, columns, is_unique, index_type: "compound".to_string(),
            });
        }
        Ok(indexes)
    }

    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let coll: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(table);
        coll.count_documents(Document::new())
            .await
            .map_err(|e| AppError::new(e.to_string()))
    }

    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        use mongodb::bson::{doc, Document};
        use futures_util::StreamExt;

        let db = self.current_db();

        if sql.trim_start().starts_with("db.") {
            return self.run_mql(&db, sql).await;
        }

        let parsed = parse_mongo_select(sql)
            .ok_or_else(|| AppError::new(
                "MongoDB queries must be MQL, e.g. db.<collection>.find({\"field\": \"value\"})",
            ))?;

        let collection: mongodb::Collection<Document> = self.client
            .database(&db)
            .collection(&parsed.collection);

        // Build find options
        let mut find = collection.find(doc! {});
        find = find.limit(parsed.limit as i64).skip(parsed.skip as u64);
        if let Some(field) = &parsed.sort_field {
            let direction = if parsed.sort_asc { 1i32 } else { -1i32 };
            find = find.sort(doc! { field: direction });
        }

        let mut cursor = find.await
            .map_err(|e| AppError::new(e.to_string()))?;

        let mut all_docs: Vec<Document> = Vec::new();
        while let Some(doc) = cursor.next().await {
            all_docs.push(doc.map_err(|e| AppError::new(e.to_string()))?);
        }

        Ok(docs_to_result(all_docs))
    }

    async fn insert_document(&self, input: InsertDocumentInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.collection);

        let doc = json_map_to_doc(&input.document)?;

        let result = collection.insert_one(doc)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["inserted_id".to_string()],
            rows: vec![serde_json::json!(result.inserted_id.to_string())],
            rows_affected: Some(1),
        })
    }

    async fn update_documents(&self, input: UpdateDocumentInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.collection);

        let filter = json_map_to_doc(&input.filter)?;
        let update = json_map_to_doc(&input.update)?;

        let result = collection.update_many(filter, update)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["matched_count".to_string(), "modified_count".to_string(), "upserted_count".to_string()],
            rows: vec![serde_json::json!({
                "matched_count": result.matched_count,
                "modified_count": result.modified_count,
                "upserted_count": result.upserted_id.as_ref().map(|_| 1u64).unwrap_or(0)
            })],
            rows_affected: Some(result.modified_count),
        })
    }

    async fn delete_documents(&self, input: DeleteDocumentInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.collection);

        let filter = json_map_to_doc(&input.filter)?;

        let result = collection.delete_many(filter)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["deleted_count".to_string()],
            rows: vec![serde_json::json!(result.deleted_count)],
            rows_affected: Some(result.deleted_count),
        })
    }

    async fn replace_document(&self, input: ReplaceDocumentInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.collection);

        let filter = json_map_to_doc(&input.filter)?;
        let replacement = json_map_to_doc(&input.replacement)?;

        let result = collection.replace_one(filter, replacement)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["matched_count".to_string(), "modified_count".to_string(), "upserted_count".to_string()],
            rows: vec![serde_json::json!({
                "matched_count": result.matched_count,
                "modified_count": result.modified_count,
                "upserted_count": result.upserted_id.as_ref().map(|_| 1u64).unwrap_or(0)
            })],
            rows_affected: Some(result.modified_count),
        })
    }

    async fn insert_row(&self, input: crate::model::InsertRowInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.table);

        let doc = json_map_to_doc(&input.values)?;

        let result = collection.insert_one(doc)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["inserted_id".to_string()],
            rows: vec![serde_json::json!(result.inserted_id.to_string())],
            rows_affected: Some(1),
        })
    }

    async fn update_row(&self, input: crate::model::UpdateRowInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.table);

        // Build filter for the primary key
        let pk_bson = coerce_pk_bson(&input.pk_column, json_to_bson(&input.pk_value));
        let filter = mongodb::bson::doc! { input.pk_column: pk_bson };

        // Build update document from values
        let update_doc = json_map_to_doc(&input.values)?;
        let update = mongodb::bson::doc! { "$set": update_doc };

        let result = collection.update_one(filter, update)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["matched_count".to_string(), "modified_count".to_string()],
            rows: vec![serde_json::json!({
                "matched_count": result.matched_count,
                "modified_count": result.modified_count,
            })],
            rows_affected: Some(result.modified_count),
        })
    }

    async fn delete_row(&self, input: crate::model::DeleteRowInput) -> Result<QueryResult, AppError> {
        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(&input.table);

        // Build filter for the primary key
        let pk_bson = coerce_pk_bson(&input.pk_column, json_to_bson(&input.pk_value));
        let filter = mongodb::bson::doc! { input.pk_column: pk_bson };

        let result = collection.delete_one(filter)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(QueryResult {
            columns: vec!["deleted_count".to_string()],
            rows: vec![serde_json::json!(result.deleted_count)],
            rows_affected: Some(result.deleted_count),
        })
    }

    async fn apply_batch_edits(&self, _input: BatchEditInput) -> Result<QueryResult, AppError> {
        Err(AppError::new("apply_batch_edits is not supported for MongoDB"))
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

        let collection: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(table);

        let mut docs = Vec::new();
        for row in rows {
            let mut doc = Document::new();
            for (i, col) in columns.iter().enumerate() {
                if i < row.len() {
                    let bson_val = json_to_bson(&row[i]);
                    doc.insert(col, bson_val);
                }
            }
            docs.push(doc);
        }

        collection.insert_many(docs)
            .await
            .map_err(|e| AppError::new(e.to_string()))?;

        Ok(())
    }

    async fn generate_logical_dump(&self) -> Result<String, AppError> {
        let mut dump = String::new();
        dump.push_str(&format!("// EasyDatabase MongoDB Logical Backup\n// Date: {}\n\n", chrono::Utc::now()));

        let tables = self.list_tables().await?;
        for table_info in tables {
            let table = &table_info.name;
            dump.push_str(&format!("// Collection: {}\n", table));

            let collection: mongodb::Collection<Document> = self.client
                .database(&self.current_db())
                .collection(table);

            use futures_util::TryStreamExt;
            let mut cursor = collection.find(mongodb::bson::doc! {}).await.map_err(|e| AppError::new(e.to_string()))?;
            while let Some(doc) = cursor.try_next().await.map_err(|e| AppError::new(e.to_string()))? {
                let json = serde_json::to_string(&doc).unwrap_or_default();
                dump.push_str(&format!("db.{}.insert({});\n", table, json));
            }
            dump.push_str("\n");
        }

        Ok(dump)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::drivers::Driver;
    use crate::model::ConnectionConfig;

    fn mongo_config() -> ConnectionConfig {
        ConnectionConfig {
            id: "test-mongo".into(),
            name: "Test Mongo".into(),
            db_type: "mongodb".into(),
            host: "localhost".into(),
            port: 27017,
            database: "test".into(),
            username: String::new(),
            password: String::new(),
            connection_string: "mongodb://localhost:27017".into(),
        }
    }

    #[test]
    fn coerces_hex_id_string_to_object_id() {
        let coerced = coerce_pk_bson("_id", Bson::String("507f1f77bcf86cd799439011".into()));
        assert!(matches!(coerced, Bson::ObjectId(_)));
        // non-hex strings and non-_id columns pass through untouched
        assert!(matches!(coerce_pk_bson("_id", Bson::String("abc".into())), Bson::String(_)));
        assert!(matches!(
            coerce_pk_bson("email", Bson::String("507f1f77bcf86cd799439011".into())),
            Bson::String(_)
        ));
    }

    #[test]
    fn parses_plain_find() {
        let op = parse_mql(r#"db.users.find({})"#).expect("parse failed");
        match op {
            MqlOp::Find { collection, filter, limit, skip, .. } => {
                assert_eq!(collection, "users");
                assert!(filter.is_empty());
                assert_eq!(limit, DEFAULT_MQL_LIMIT);
                assert_eq!(skip, 0);
            }
            _ => panic!("expected Find"),
        }
    }

    #[test]
    fn parses_find_with_filter_sort_limit_skip() {
        let op = parse_mql(r#"db.orders.find({"status": "paid", "total": {"$gt": 10}}).sort({"created_at": -1}).limit(20).skip(40);"#)
            .expect("parse failed");
        match op {
            MqlOp::Find { collection, filter, sort, limit, skip, .. } => {
                assert_eq!(collection, "orders");
                assert_eq!(filter.get_str("status").unwrap(), "paid");
                assert!(sort.is_some());
                assert_eq!(limit, 20);
                assert_eq!(skip, 40);
            }
            _ => panic!("expected Find"),
        }
    }

    #[test]
    fn parses_find_with_projection() {
        let op = parse_mql(r#"db.users.find({"age": {"$gte": 18}}, {"name": 1, "email": 1})"#)
            .expect("parse failed");
        match op {
            MqlOp::Find { projection, .. } => assert!(projection.is_some()),
            _ => panic!("expected Find"),
        }
    }

    #[test]
    fn find_one_defaults_to_limit_1() {
        let op = parse_mql(r#"db.users.findOne({"email": "a@b.c"})"#).expect("parse failed");
        match op {
            MqlOp::Find { limit, .. } => assert_eq!(limit, 1),
            _ => panic!("expected Find"),
        }
    }

    #[test]
    fn parses_count_documents() {
        let op = parse_mql(r#"db.users.countDocuments({"active": true})"#).expect("parse failed");
        match op {
            MqlOp::Count { collection, filter } => {
                assert_eq!(collection, "users");
                assert!(filter.get_bool("active").unwrap());
            }
            _ => panic!("expected Count"),
        }
    }

    #[test]
    fn rejects_unquoted_keys_with_clear_message() {
        let err = parse_mql(r#"db.users.find({name: "x"})"#).unwrap_err();
        assert!(err.0.contains("double-quoted"));
    }

    #[test]
    fn rejects_unsupported_method() {
        assert!(parse_mql(r#"db.users.drop()"#).is_err());
        assert!(parse_mql(r#"SELECT 1"#).is_err());
    }

    #[test]
    fn handles_strings_containing_braces_and_parens() {
        let op = parse_mql(r#"db.users.find({"note": "weird ) } value"})"#).expect("parse failed");
        match op {
            MqlOp::Find { filter, .. } => assert_eq!(filter.get_str("note").unwrap(), "weird ) } value"),
            _ => panic!("expected Find"),
        }
    }

    #[tokio::test]
    async fn mongo_live_connection() {
        if std::env::var("TOOLSQL_TEST_MONGO").is_err() {
            eprintln!("SKIP mongo_live_connection (set TOOLSQL_TEST_MONGO=1 to run)");
            return;
        }

        let config = mongo_config();
        let (client, _default_db) = db::connect_mongo(&config.connection_string)
            .await
            .expect("connect_mongo failed");
        let driver = MongoDriver::new(client, config.database.clone());

        // ping
        driver.ping().await.expect("ping failed");
        eprintln!("[OK] ping               -> healthy");

        // list_databases
        let dbs = driver.list_databases().await.expect("list_databases failed");
        eprintln!("[OK] list_databases     -> {} entries", dbs.len());

        // list_schemas
        let schemas = driver.list_schemas().await.expect("list_schemas failed");
        eprintln!("[OK] list_schemas      -> {} entries", schemas.len());

        // set_database and list_tables
        if !dbs.is_empty() {
            driver.set_database(&dbs[0]).await.expect("set_database failed");
            eprintln!("[OK] set_database      -> switched to {}", dbs[0]);

            let tables = driver.list_tables().await.expect("list_tables failed");
            eprintln!("[OK] list_tables      -> {} collections", tables.len());

            if !tables.is_empty() {
                let first_table = &tables[0].name;
                eprintln!("[OK] Testing collection: {}", first_table);

                // describe_table
                let columns = driver.describe_table(first_table).await.expect("describe_table failed");
                eprintln!("[OK] describe_table    -> {} columns", columns.len());

                // list_indexes
                let indexes = driver.list_indexes(first_table).await.expect("list_indexes failed");
                eprintln!("[OK] list_indexes     -> {} indexes", indexes.len());
            }
        }

        eprintln!("[OK] All MongoDB tests passed!");
    }
}
