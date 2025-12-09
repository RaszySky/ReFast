use crate::db;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomFilter {
    pub id: String,
    pub label: String,
    pub extensions: Vec<String>,
}

/// 加载自定义过滤器列表
pub fn load_custom_filters(app_data_dir: &Path) -> Result<Vec<CustomFilter>, String> {
    let conn = db::get_connection(app_data_dir)?;
    
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'everything_custom_filters' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to load custom filters from database: {}", e))?;

    if let Some(json) = value {
        serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse custom filters from database: {}", e))
    } else {
        Ok(Vec::new())
    }
}

/// 保存自定义过滤器列表
pub fn save_custom_filters(app_data_dir: &Path, filters: &[CustomFilter]) -> Result<(), String> {
    let conn = db::get_connection(app_data_dir)?;
    
    let filters_json = serde_json::to_string(filters)
        .map_err(|e| format!("Failed to serialize custom filters: {}", e))?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('everything_custom_filters', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![filters_json],
    )
    .map_err(|e| format!("Failed to save custom filters to database: {}", e))?;

    Ok(())
}

