mod commands;
mod db;
mod drivers;
mod error;
mod mcp;
mod model;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    let mcp_state = app_state.clone();
    tauri::async_runtime::spawn(async move {
        let port = match commands::settings::load_settings().await {
            Ok(s) => s.mcp_port,
            Err(_) => 3456,
        };
        mcp::serve(mcp_state, port).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            commands::connection::save_connection,
            commands::connection::load_saved_connections,
            commands::connection::delete_saved_connection,
            commands::connection::connect,
            commands::connection::test_connection,
            commands::connection::disconnect,
            commands::connection::list_connections,
            commands::connection::switch_mongo_db,
            commands::schema::list_databases,
            commands::schema::list_schemas,
            commands::schema::list_tables,
            commands::schema::describe_table,
            commands::schema::list_indexes,
            commands::schema::list_foreign_keys,
            commands::query::run_query,
            commands::query::count_rows,
            commands::query::apply_batch_edits,
            commands::edit::insert_row,
            commands::edit::update_row,
            commands::edit::delete_row,
            commands::query::insert_document,
            commands::query::update_documents,
            commands::query::delete_documents,
            commands::query::replace_document,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::save_to_file,
            commands::ai::generate_sql,
            commands::ai::explain_sql,
            commands::ai::complete_sql,
            commands::ai::check_ollama,
            commands::saved_queries::list_saved_queries,
            commands::saved_queries::create_saved_query,
            commands::saved_queries::update_saved_query,
            commands::saved_queries::delete_saved_query,
            commands::audit::get_audit_log,
            commands::audit::export_audit_log,
            commands::backup_import::import_csv_data,
            commands::backup_import::import_json_data,
            commands::backup_import::create_database_backup,
            commands::backup_import::start_database_backup,
            commands::backup_import::restore_database_backup,
            commands::backup_import::get_csv_headers,
            commands::backup_import::get_json_keys,
            commands::backup_import::get_csv_headers_from_string,
            commands::backup_import::get_json_keys_from_string,
            commands::backup_import::import_raw_csv_data,
            commands::backup_import::import_raw_json_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
