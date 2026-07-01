mod commands;
mod db;
mod drivers;
mod error;
mod model;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

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
            commands::schema::list_tables,
            commands::schema::describe_table,
            commands::schema::list_indexes,
            commands::query::run_query,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
