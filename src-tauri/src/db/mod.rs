use crate::error::AppError;

pub async fn connect_postgres(url: &str) -> Result<sqlx::PgPool, AppError> {
    sqlx::PgPool::connect(url).await.map_err(AppError::from)
}

pub async fn connect_mysql(url: &str) -> Result<sqlx::MySqlPool, AppError> {
    sqlx::MySqlPool::connect(url).await.map_err(AppError::from)
}

/// Returns the client plus the default database from the connection string
/// (the `/dbname` path segment), if one was specified.
pub async fn connect_mongo(url: &str) -> Result<(mongodb::Client, Option<String>), AppError> {
    let mut opts = mongodb::options::ClientOptions::parse(url)
        .await
        .map_err(|e| AppError::new(e.to_string()))?;
    opts.server_selection_timeout = Some(std::time::Duration::from_secs(5));
    opts.connect_timeout = Some(std::time::Duration::from_secs(5));
    let default_db = opts.default_database.clone();
    let client = mongodb::Client::with_options(opts).map_err(|e| AppError::new(e.to_string()))?;
    Ok((client, default_db))
}
