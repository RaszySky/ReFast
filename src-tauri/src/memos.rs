use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: u64,
    pub updated_at: u64,
}

static MEMOS: LazyLock<Arc<Mutex<Vec<MemoItem>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn memos_file_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("memos.json")
}

pub fn load_memos(app_data_dir: &PathBuf) -> Result<(), String> {
    let path = memos_file_path(app_data_dir);
    if !path.exists() {
        return Ok(());
    }

    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read memos file: {}", e))?;
    let items: Vec<MemoItem> =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse memos file: {}", e))?;

    let mut guard = MEMOS.lock().map_err(|e| e.to_string())?;
    *guard = items;
    Ok(())
}

fn save_memos(app_data_dir: &PathBuf, items: &[MemoItem]) -> Result<(), String> {
    let path = memos_file_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create memos dir: {}", e))?;
    }

    let data =
        serde_json::to_string_pretty(items).map_err(|e| format!("Failed to serialize memos: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write memos file: {}", e))?;
    Ok(())
}

pub fn get_all_memos(app_data_dir: &PathBuf) -> Result<Vec<MemoItem>, String> {
    load_memos(app_data_dir).ok();
    let guard = MEMOS.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

pub fn add_memo(
    title: String,
    content: String,
    app_data_dir: &PathBuf,
) -> Result<MemoItem, String> {
    load_memos(app_data_dir).ok();
    let mut guard = MEMOS.lock().map_err(|e| e.to_string())?;

    let now = now_ts();
    let id = format!("memo-{}", now_ts());

    let item = MemoItem {
        id,
        title,
        content,
        created_at: now,
        updated_at: now,
    };

    guard.push(item.clone());
    save_memos(app_data_dir, &guard)?;
    Ok(item)
}

pub fn update_memo(
    id: String,
    title: Option<String>,
    content: Option<String>,
    app_data_dir: &PathBuf,
) -> Result<MemoItem, String> {
    load_memos(app_data_dir).ok();
    let mut guard = MEMOS.lock().map_err(|e| e.to_string())?;

    let mut found = None;
    for memo in guard.iter_mut() {
        if memo.id == id {
            if let Some(t) = title {
                memo.title = t;
            }
            if let Some(c) = content {
                memo.content = c;
            }
            memo.updated_at = now_ts();
            found = Some(memo.clone());
            break;
        }
    }

    match found {
        Some(item) => {
            save_memos(app_data_dir, &guard)?;
            Ok(item)
        }
        None => Err(format!("Memo {} not found", id)),
    }
}

pub fn delete_memo(id: String, app_data_dir: &PathBuf) -> Result<(), String> {
    load_memos(app_data_dir).ok();
    let mut guard = MEMOS.lock().map_err(|e| e.to_string())?;
    let before = guard.len();
    guard.retain(|m| m.id != id);
    if guard.len() == before {
        return Err(format!("Memo {} not found", id));
    }
    save_memos(app_data_dir, &guard)?;
    Ok(())
}

pub fn search_memos(query: &str, app_data_dir: &PathBuf) -> Result<Vec<MemoItem>, String> {
    load_memos(app_data_dir).ok();
    let guard = MEMOS.lock().map_err(|e| e.to_string())?;
    let q = query.to_lowercase();
    Ok(guard
        .iter()
        .filter(|m| {
            m.title.to_lowercase().contains(&q) || m.content.to_lowercase().contains(&q)
        })
        .cloned()
        .collect())
}




