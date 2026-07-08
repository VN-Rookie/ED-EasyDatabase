use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::{Column, Row};

use crate::drivers::{is_select, Driver};
use crate::error::AppError;
use crate::model::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, SchemaInfo, TableInfo, BatchEditInput, TableSchemaInfo, RefactorPreview, DependencyInfo};

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

    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let (count,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }

    async fn list_schemas(&self) -> Result<Vec<SchemaInfo>, AppError> {
        // MySQL: schemas = databases. Return all databases, excluding system ones.
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT schema_name FROM information_schema.schemata \
             WHERE schema_name NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys') \
             ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(name,)| SchemaInfo { name }).collect())
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

    async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, String, String, String)>(
            "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY \
             FROM information_schema.COLUMNS \
             WHERE TABLE_SCHEMA = DATABASE() \
             ORDER BY TABLE_NAME, ORDINAL_POSITION",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut map: std::collections::BTreeMap<String, Vec<ColumnInfo>> = std::collections::BTreeMap::new();
        for (table_name, col_name, data_type, nullable, key) in rows {
            map.entry(table_name).or_default().push(ColumnInfo {
                name: col_name,
                data_type,
                nullable: nullable.eq_ignore_ascii_case("YES"),
                is_pk:    key.eq_ignore_ascii_case("PRI"),
            });
        }

        Ok(map.into_iter().map(|(table_name, columns)| TableSchemaInfo {
            table_name,
            columns,
        }).collect())
    }

    async fn get_refactor_preview(
        &self,
        table: &str,
        column: Option<&str>,
        new_name: &str,
    ) -> Result<RefactorPreview, AppError> {
        let old_target = column.unwrap_or(table);
        let search_pattern = format!("%{}%", old_target);

        // 1. Tìm views phụ thuộc
        let view_rows = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT TABLE_NAME, VIEW_DEFINITION \
             FROM information_schema.VIEWS \
             WHERE TABLE_SCHEMA = DATABASE() AND VIEW_DEFINITION LIKE ?",
        )
        .bind(&search_pattern)
        .fetch_all(&self.pool)
        .await?;

        // 2. Tìm routines (procedures/functions) phụ thuộc
        let routine_rows = sqlx::query_as::<_, (String, String, Option<String>)>(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION \
             FROM information_schema.ROUTINES \
             WHERE ROUTINE_SCHEMA = DATABASE() AND (ROUTINE_DEFINITION LIKE ? OR ROUTINE_NAME LIKE ?)",
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_all(&self.pool)
        .await?;

        let mut dependencies = Vec::new();
        let mut ddl_statements = Vec::new();
        
        let old_word_boundary = format!(r"\b{}\b", regex::escape(old_target));
        let re = regex::Regex::new(&old_word_boundary).map_err(|e| AppError::new(e.to_string()))?;

        // View dependencies
        for (view_name, old_def_opt) in view_rows {
            if let Some(old_def) = old_def_opt {
                let clean_def = old_def.trim_end_matches(';').trim().to_string();
                let new_def = re.replace_all(&clean_def, new_name).to_string();

                dependencies.push(DependencyInfo {
                    object_name: view_name.clone(),
                    object_type: "View".to_string(),
                    old_definition: clean_def.clone(),
                    new_definition: new_def.clone(),
                });

                ddl_statements.push(format!("DROP VIEW IF EXISTS `{}`;", view_name));
                ddl_statements.push(format!("CREATE OR REPLACE VIEW `{}` AS\n{};", view_name, new_def));
            }
        }

        // Routine dependencies
        for (routine_name, routine_type, old_def_opt) in routine_rows {
            if let Some(old_def) = old_def_opt {
                let clean_def = old_def.trim().to_string();
                let new_def = re.replace_all(&clean_def, new_name).to_string();

                dependencies.push(DependencyInfo {
                    object_name: routine_name.clone(),
                    object_type: routine_type.clone(),
                    old_definition: clean_def.clone(),
                    new_definition: new_def.clone(),
                });

                // Chú ý: Routines trong MySQL cần DROP và CREATE lại, 
                // nhưng definition từ information_schema thường không chứa mệnh đề CREATE hoàn chỉnh, 
                // nên ta chỉ log định nghĩa đã sửa đổi để người dùng tham chiếu
                ddl_statements.push(format!("-- Cần cập nhật {} `{}`:\n-- {}", routine_type, routine_name, new_def));
            }
        }

        // Câu lệnh đổi tên đối tượng gốc
        let rename_stmt = if let Some(col) = column {
            format!("ALTER TABLE `{}` RENAME COLUMN `{}` TO `{}`;", table, col, new_name)
        } else {
            format!("RENAME TABLE `{}` TO `{}`;", table, new_name)
        };

        // Gộp DDL preview
        let mut generated_ddl = String::new();
        generated_ddl.push_str("START TRANSACTION;\n");
        // Drop view trước
        for stmt in ddl_statements.iter().filter(|s| s.starts_with("DROP")) {
            generated_ddl.push_str(&format!("  {}\n", stmt));
        }
        // Đổi tên bảng/cột
        generated_ddl.push_str(&format!("  {}\n", rename_stmt));
        // Re-create views
        for stmt in ddl_statements.iter().filter(|s| s.starts_with("CREATE")) {
            generated_ddl.push_str(&format!("  {}\n", stmt));
        }
        // Comments cho routines
        for stmt in ddl_statements.iter().filter(|s| s.starts_with("--")) {
            generated_ddl.push_str(&format!("  {}\n", stmt));
        }
        generated_ddl.push_str("COMMIT;");

        Ok(RefactorPreview {
            dependencies,
            generated_ddl,
        })
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

    async fn list_foreign_keys(&self, table: &str) -> Result<Vec<ForeignKeyInfo>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>)>(
            "SELECT
                CONSTRAINT_NAME,
                GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ','),
                REFERENCED_TABLE_NAME,
                GROUP_CONCAT(REFERENCED_COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ','),
                UPDATE_RULE,
                DELETE_RULE
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
             GROUP BY CONSTRAINT_NAME, REFERENCED_TABLE_NAME, UPDATE_RULE, DELETE_RULE",
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

        let table_quoted = format!("`{}`", input.table.replace('`', "``"));

        for upd in input.updates {
            let set_clauses: Vec<String> = upd.values.keys()
                .filter_map(|col| upd.values.get(col).map(|v| format!("`{}` = {}", col.replace('`', "``"), json_to_sql_literal(v))))
                .collect();
            let set_list = set_clauses.join(", ");
            let pk_literal = json_to_sql_literal(&upd.pk_value);
            let sql = format!("UPDATE {} SET {} WHERE `{}` = {}", table_quoted, set_list, upd.pk_column.replace('`', "``"), pk_literal);
            let r = sqlx::query(&sql).execute(&mut *tx).await?;
            total_affected += r.rows_affected();
        }

        for ins in input.inserts {
            if ins.values.is_empty() { continue; }
            let columns: Vec<String> = ins.values.keys().cloned().collect();
            let column_list = columns.iter().map(|c| format!("`{}`", c.replace('`', "``"))).collect::<Vec<_>>().join(", ");
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
            let sql = format!("DELETE FROM {} WHERE `{}` = {}", table_quoted, del.pk_column.replace('`', "``"), pk_literal);
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

        let table_quoted = format!("`{}`", table.replace('`', "``"));
        let col_list = columns.iter().map(|c| format!("`{}`", c.replace('`', "``"))).collect::<Vec<_>>().join(", ");

        let mut tx = self.pool.begin().await?;

        let params_per_row = columns.len();
        let max_rows_per_batch = 5000 / params_per_row;
        let max_rows_per_batch = std::cmp::max(1, max_rows_per_batch);

        for chunk in rows.chunks(max_rows_per_batch) {
            let mut sql = format!("INSERT INTO {} ({}) VALUES ", table_quoted, col_list);
            let mut values_parts = Vec::new();

            for _ in chunk {
                let mut row_placeholder = Vec::new();
                for _ in 0..params_per_row {
                    row_placeholder.push("?");
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
        let mut dump = String::new();
        dump.push_str(&format!("-- EasyDatabase MySQL Logical Backup\n-- Date: {}\n\n", chrono::Utc::now()));

        let tables = self.list_tables().await?;

        for table_info in tables {
            let table = &table_info.name;
            let table_quoted = format!("`{}`", table.replace('`', "``"));

            dump.push_str(&format!("-- Structure for table {}\n", table_quoted));

            let ddl_res = self.run_query(&format!("SHOW CREATE TABLE {}", table_quoted)).await?;
            if !ddl_res.rows.is_empty() && ddl_res.rows[0].get("Create Table").is_some() {
                if let Some(create_sql) = ddl_res.rows[0]["Create Table"].as_str() {
                    dump.push_str(create_sql);
                    dump.push_str(";\n\n");
                }
            } else {
                let columns = self.describe_table(table).await?;
                let mut col_defs = Vec::new();
                for col in &columns {
                    let nullable_str = if col.nullable { "" } else { " NOT NULL" };
                    let pk_str = if col.is_pk { " PRIMARY KEY" } else { "" };
                    col_defs.push(format!("    `{}` {}{}{}", col.name.replace('`', "``"), col.data_type, nullable_str, pk_str));
                }
                dump.push_str(&format!("CREATE TABLE {} (\n{}\n);\n\n", table_quoted, col_defs.join(",\n")));
            }

            dump.push_str(&format!("-- Data for table {}\n", table_quoted));
            let select_query = format!("SELECT * FROM {}", table_quoted);
            let data = self.run_query(&select_query).await?;
            if !data.rows.is_empty() && !data.columns.is_empty() {
                let col_names = data.columns.iter().map(|c| format!("`{}`", c.replace('`', "``"))).collect::<Vec<_>>().join(", ");
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

/// Convert a JSON value to a SQL literal string (for MySQL).
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
