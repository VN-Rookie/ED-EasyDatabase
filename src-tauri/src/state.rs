use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::drivers::Driver;
use crate::error::AppError;
use crate::model::ConnectionMeta;

pub struct ConnectionHandle {
    pub meta: ConnectionMeta,
    pub driver: Arc<dyn Driver>,
}

#[derive(Clone)]
pub struct AppState {
    pub connections: Arc<Mutex<HashMap<String, ConnectionHandle>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self { connections: Arc::new(Mutex::new(HashMap::new())) }
    }
    /// Lock, clone the Arc out, drop the guard — never hold the lock across .await.
    pub fn driver(&self, conn_id: &str) -> Result<Arc<dyn Driver>, AppError> {
        let conns = self.connections.lock().unwrap();
        conns.get(conn_id).map(|h| h.driver.clone())
            .ok_or_else(|| AppError::new("Connection not found"))
    }
}
