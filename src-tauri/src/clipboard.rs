use crate::db;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub content: String,
    pub content_type: String, // "text", "image", "file"
    pub created_at: u64,
    pub is_favorite: bool,
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 获取所有剪切板历史
pub fn get_all_clipboard_items(app_data_dir: &PathBuf) -> Result<Vec<ClipboardItem>, String> {
    let conn = db::get_readonly_connection(app_data_dir)?;

    let mut stmt = conn
        .prepare("SELECT id, content, content_type, created_at, is_favorite FROM clipboard_history ORDER BY created_at DESC")
        .map_err(|e| format!("Failed to prepare clipboard query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content: row.get(1)?,
                content_type: row.get(2)?,
                created_at: row.get::<_, i64>(3)? as u64,
                is_favorite: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| format!("Failed to iterate clipboard items: {}", e))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Failed to read clipboard row: {}", e))?);
    }
    Ok(items)
}

/// 添加剪切板项
pub fn add_clipboard_item(
    content: String,
    content_type: String,
    app_data_dir: &PathBuf,
) -> Result<ClipboardItem, String> {
    let now = now_ts();
    let id = format!("clipboard-{}", now);

    let item = ClipboardItem {
        id: id.clone(),
        content: content.clone(),
        content_type: content_type.clone(),
        created_at: now,
        is_favorite: false,
    };

    let conn = db::get_connection(app_data_dir)?;
    
    // 检查是否已存在相同内容（避免重复）
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM clipboard_history WHERE content = ?1 AND content_type = ?2",
            params![content, content_type],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to check existing clipboard: {}", e))?;
    
    if let Some(existing_id) = existing {
        // 如果已存在，更新时间戳
        conn.execute(
            "UPDATE clipboard_history SET created_at = ?1 WHERE id = ?2",
            params![now as i64, existing_id],
        )
        .map_err(|e| format!("Failed to update clipboard timestamp: {}", e))?;
        
        return Ok(ClipboardItem {
            id: existing_id,
            content,
            content_type,
            created_at: now,
            is_favorite: false,
        });
    }

    conn.execute(
        "INSERT INTO clipboard_history (id, content, content_type, created_at, is_favorite)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![item.id, item.content, item.content_type, item.created_at as i64, 0],
    )
    .map_err(|e| format!("Failed to insert clipboard item: {}", e))?;

    Ok(item)
}

/// 更新剪切板项内容
pub fn update_clipboard_item(
    id: String,
    content: String,
    app_data_dir: &PathBuf,
) -> Result<ClipboardItem, String> {
    let conn = db::get_connection(app_data_dir)?;

    let existing: Option<ClipboardItem> = conn
        .query_row(
            "SELECT id, content, content_type, created_at, is_favorite FROM clipboard_history WHERE id = ?1",
            params![id],
            |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    created_at: row.get::<_, i64>(3)? as u64,
                    is_favorite: row.get::<_, i64>(4)? != 0,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load clipboard item: {}", e))?;

    let mut item = existing.ok_or_else(|| format!("Clipboard item {} not found", id))?;
    item.content = content;

    conn.execute(
        "UPDATE clipboard_history SET content = ?1 WHERE id = ?2",
        params![item.content, item.id],
    )
    .map_err(|e| format!("Failed to update clipboard item: {}", e))?;

    Ok(item)
}

/// 切换收藏状态
pub fn toggle_favorite_clipboard_item(
    id: String,
    app_data_dir: &PathBuf,
) -> Result<ClipboardItem, String> {
    let conn = db::get_connection(app_data_dir)?;

    let existing: Option<ClipboardItem> = conn
        .query_row(
            "SELECT id, content, content_type, created_at, is_favorite FROM clipboard_history WHERE id = ?1",
            params![id],
            |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    created_at: row.get::<_, i64>(3)? as u64,
                    is_favorite: row.get::<_, i64>(4)? != 0,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load clipboard item: {}", e))?;

    let mut item = existing.ok_or_else(|| format!("Clipboard item {} not found", id))?;
    item.is_favorite = !item.is_favorite;

    conn.execute(
        "UPDATE clipboard_history SET is_favorite = ?1 WHERE id = ?2",
        params![if item.is_favorite { 1 } else { 0 }, item.id],
    )
    .map_err(|e| format!("Failed to toggle favorite: {}", e))?;

    Ok(item)
}

/// 删除剪切板项
pub fn delete_clipboard_item(id: String, app_data_dir: &PathBuf) -> Result<(), String> {
    let conn = db::get_connection(app_data_dir)?;
    let affected = conn
        .execute("DELETE FROM clipboard_history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete clipboard item: {}", e))?;
    if affected == 0 {
        return Err("Clipboard item not found".to_string());
    }
    Ok(())
}

/// 清空剪切板历史
pub fn clear_clipboard_history(app_data_dir: &PathBuf) -> Result<(), String> {
    let conn = db::get_connection(app_data_dir)?;
    conn.execute("DELETE FROM clipboard_history WHERE is_favorite = 0", [])
        .map_err(|e| format!("Failed to clear clipboard history: {}", e))?;
    Ok(())
}

/// 搜索剪切板历史
pub fn search_clipboard_items(query: &str, app_data_dir: &PathBuf) -> Result<Vec<ClipboardItem>, String> {
    let conn = db::get_readonly_connection(app_data_dir)?;

    let like = format!("%{}%", query.to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT id, content, content_type, created_at, is_favorite
             FROM clipboard_history
             WHERE lower(content) LIKE ?1
             ORDER BY is_favorite DESC, created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare clipboard search: {}", e))?;

    let rows = stmt
        .query_map(params![like], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content: row.get(1)?,
                content_type: row.get(2)?,
                created_at: row.get::<_, i64>(3)? as u64,
                is_favorite: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| format!("Failed to iterate clipboard search: {}", e))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Failed to read clipboard row: {}", e))?);
    }
    Ok(items)
}

#[cfg(target_os = "windows")]
pub mod monitor {
    use super::*;
    use std::thread;
    use std::time::Duration;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::DataExchange::{
        GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, CloseClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock, GlobalSize};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Gdi::{
        GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };

    const CF_TEXT: u32 = 1;
    const CF_UNICODETEXT: u32 = 13;
    const CF_DIB: u32 = 8;
    const CF_BITMAP: u32 = 2;

    /// 启动剪切板监控线程
    pub fn start_clipboard_monitor(app_data_dir: PathBuf) -> Result<(), String> {
        thread::spawn(move || {
            let mut last_text_content = String::new();
            let mut last_image_hash = String::new();
            
            loop {
                thread::sleep(Duration::from_millis(500));
                
                // 检查文本内容
                if let Ok(content) = get_clipboard_text() {
                    if !content.is_empty() && content != last_text_content {
                        if let Err(e) = add_clipboard_item(content.clone(), "text".to_string(), &app_data_dir) {
                            eprintln!("[Clipboard Monitor] Failed to add text clipboard item: {}", e);
                        }
                        last_text_content = content;
                    }
                }
                
                // 检查图片内容
                if let Ok(image_path) = get_clipboard_image(&app_data_dir) {
                    if !image_path.is_empty() {
                        // 使用文件路径作为简单的哈希来检测重复
                        let image_hash = format!("{}", image_path);
                        if image_hash != last_image_hash {
                            if let Err(e) = add_clipboard_item(image_path.clone(), "image".to_string(), &app_data_dir) {
                                eprintln!("[Clipboard Monitor] Failed to add image clipboard item: {}", e);
                            }
                            last_image_hash = image_hash;
                        }
                    }
                }
            }
        });
        
        Ok(())
    }

    /// 获取剪切板文本内容
    pub fn get_clipboard_text() -> Result<String, String> {
        unsafe {
            if OpenClipboard(0 as HWND) == 0 {
                return Err("Failed to open clipboard".to_string());
            }

            let result = if IsClipboardFormatAvailable(CF_UNICODETEXT) != 0 {
                let h_data = GetClipboardData(CF_UNICODETEXT);
                if h_data == 0 {
                    CloseClipboard();
                    return Err("Failed to get clipboard data".to_string());
                }

                let p_data = GlobalLock(h_data as *mut std::ffi::c_void);
                if p_data.is_null() {
                    CloseClipboard();
                    return Err("Failed to lock clipboard data".to_string());
                }

                let text = std::ffi::OsString::from_wide(
                    std::slice::from_raw_parts(
                        p_data as *const u16,
                        (0..).take_while(|&i| *((p_data as *const u16).add(i)) != 0).count(),
                    ),
                );
                
                GlobalUnlock(h_data as *mut std::ffi::c_void);
                
                text.to_string_lossy().to_string()
            } else if IsClipboardFormatAvailable(CF_TEXT) != 0 {
                let h_data = GetClipboardData(CF_TEXT);
                if h_data == 0 {
                    CloseClipboard();
                    return Err("Failed to get clipboard data".to_string());
                }

                let p_data = GlobalLock(h_data as *mut std::ffi::c_void);
                if p_data.is_null() {
                    CloseClipboard();
                    return Err("Failed to lock clipboard data".to_string());
                }

                let c_str = std::ffi::CStr::from_ptr(p_data as *const i8);
                let text = c_str.to_string_lossy().to_string();
                
                GlobalUnlock(h_data as *mut std::ffi::c_void);
                
                text
            } else {
                String::new()
            };

            CloseClipboard();
            Ok(result)
        }
    }

    /// 获取剪切板图片并保存到本地
    pub fn get_clipboard_image(app_data_dir: &PathBuf) -> Result<String, String> {
        unsafe {
            if OpenClipboard(0 as HWND) == 0 {
                return Err("Failed to open clipboard".to_string());
            }

            let result = if IsClipboardFormatAvailable(CF_DIB) != 0 {
                let h_data = GetClipboardData(CF_DIB);
                if h_data == 0 {
                    CloseClipboard();
                    return Err("Failed to get clipboard DIB data".to_string());
                }

                let p_data = GlobalLock(h_data as *mut std::ffi::c_void);
                if p_data.is_null() {
                    CloseClipboard();
                    return Err("Failed to lock clipboard data".to_string());
                }

                let data_size = GlobalSize(h_data as *mut std::ffi::c_void);
                if data_size == 0 {
                    GlobalUnlock(h_data as *mut std::ffi::c_void);
                    CloseClipboard();
                    return Err("Invalid clipboard data size".to_string());
                }

                // 读取 BITMAPINFOHEADER
                let bmi = p_data as *const BITMAPINFOHEADER;
                let width = (*bmi).biWidth;
                let height = (*bmi).biHeight.abs();
                let bit_count = (*bmi).biBitCount;

                // 创建保存目录
                let clipboard_images_dir = app_data_dir.join("clipboard_images");
                if let Err(e) = std::fs::create_dir_all(&clipboard_images_dir) {
                    GlobalUnlock(h_data as *mut std::ffi::c_void);
                    CloseClipboard();
                    return Err(format!("Failed to create clipboard images directory: {}", e));
                }

                // 生成文件名
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let filename = format!("clipboard_{}.png", timestamp);
                let file_path = clipboard_images_dir.join(&filename);

                // 计算图片数据大小
                let bytes_per_pixel = (bit_count / 8) as usize;
                let row_size = ((width * bit_count as i32 + 31) / 32 * 4) as usize;
                let image_data_size = row_size * height as usize;

                // 获取图片数据指针（跳过 BITMAPINFOHEADER）
                let image_data_ptr = (p_data as *const u8).add(std::mem::size_of::<BITMAPINFOHEADER>());
                let image_data = std::slice::from_raw_parts(image_data_ptr, image_data_size.min(data_size - std::mem::size_of::<BITMAPINFOHEADER>()));

                // 转换 BGR 到 RGB 并保存为 PNG
                let mut rgba_data = Vec::with_capacity((width * height * 4) as usize);
                for y in (0..height).rev() {
                    for x in 0..width {
                        let offset = (y as usize * row_size + x as usize * bytes_per_pixel) as usize;
                        if offset + bytes_per_pixel <= image_data.len() {
                            let b = image_data[offset];
                            let g = image_data[offset + 1];
                            let r = image_data[offset + 2];
                            rgba_data.push(r);
                            rgba_data.push(g);
                            rgba_data.push(b);
                            rgba_data.push(255); // Alpha
                        }
                    }
                }

                // 保存为 PNG
                let save_result = save_png(&file_path, &rgba_data, width as u32, height as u32);
                
                GlobalUnlock(h_data as *mut std::ffi::c_void);
                
                match save_result {
                    Ok(_) => Ok(file_path.to_string_lossy().to_string()),
                    Err(e) => Err(format!("Failed to save PNG: {}", e)),
                }
            } else {
                Err("No image in clipboard".to_string())
            };

            CloseClipboard();
            result
        }
    }

    /// 保存图片为 PNG 格式
    fn save_png(path: &std::path::Path, data: &[u8], width: u32, height: u32) -> Result<(), String> {
        use std::fs::File;
        use std::io::BufWriter;
        
        let file = File::create(path)
            .map_err(|e| format!("Failed to create file: {}", e))?;
        let writer = BufWriter::new(file);

        let mut encoder = png::Encoder::new(writer, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);

        let mut writer = encoder.write_header()
            .map_err(|e| format!("Failed to write PNG header: {}", e))?;

        writer.write_image_data(data)
            .map_err(|e| format!("Failed to write PNG data: {}", e))?;

        Ok(())
    }
}
