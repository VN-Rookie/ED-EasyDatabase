use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError(pub String);

impl AppError {
    pub fn new(s: impl ToString) -> Self {
        AppError(s.to_string())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError(e.to_string())
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError(e.to_string())
    }
}
