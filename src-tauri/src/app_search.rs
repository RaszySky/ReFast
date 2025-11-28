use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[cfg(target_os = "windows")]
pub mod windows {
    use super::*;
    use std::env;

    // Cache file name
    pub fn get_cache_file_path(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("app_cache.json")
    }

    // Load cached apps from disk
    pub fn load_cache(app_data_dir: &Path) -> Result<Vec<AppInfo>, String> {
        let cache_file = get_cache_file_path(app_data_dir);
        
        if !cache_file.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&cache_file)
            .map_err(|e| format!("Failed to read cache file: {}", e))?;

        let apps: Vec<AppInfo> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse cache file: {}", e))?;

        Ok(apps)
    }

    // Save apps cache to disk
    pub fn save_cache(app_data_dir: &Path, apps: &[AppInfo]) -> Result<(), String> {
        // Create directory if it doesn't exist
        if !app_data_dir.exists() {
            fs::create_dir_all(app_data_dir)
                .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        }

        let cache_file = get_cache_file_path(app_data_dir);
        let json_string = serde_json::to_string_pretty(apps)
            .map_err(|e| format!("Failed to serialize cache: {}", e))?;
        
        fs::write(&cache_file, json_string)
            .map_err(|e| format!("Failed to write cache file: {}", e))?;

        Ok(())
    }

    // Windows-specific implementation
    pub fn scan_start_menu() -> Result<Vec<AppInfo>, String> {
        let mut apps = Vec::new();

        // Common start menu paths - scan both user and system start menus
        let start_menu_paths = vec![
            env::var("APPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Microsoft/Windows/Start Menu/Programs")),
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Microsoft/Windows/Start Menu/Programs")),
        ];

        for start_menu_path in start_menu_paths.into_iter().flatten() {
            if start_menu_path.exists() {
                // Start scanning from depth 0, limit to 3 levels for better coverage
                if let Err(_) = scan_directory(&start_menu_path, &mut apps, 0) {
                    // Continue on error
                }
            }
        }

        // Remove duplicates based on name
        apps.sort_by(|a, b| a.name.cmp(&b.name));
        apps.dedup_by(|a, b| a.name == b.name);

        Ok(apps)
    }

    fn scan_directory(dir: &Path, apps: &mut Vec<AppInfo>, depth: usize) -> Result<(), String> {
        // Limit recursion depth to avoid scanning too deep (increased to 3 for better coverage)
        const MAX_DEPTH: usize = 3;
        if depth > MAX_DEPTH {
            return Ok(());
        }
        
        // Limit total number of apps to avoid memory issues (increased to 2000)
        const MAX_APPS: usize = 2000;
        if apps.len() >= MAX_APPS {
            return Ok(());
        }

        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return Ok(()), // Skip directories we can't read
        };

        for entry in entries {
            if apps.len() >= MAX_APPS {
                break;
            }
            
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue, // Skip entries we can't read
            };
            let path = entry.path();

            if path.is_dir() {
                // Recursively scan subdirectories
                if let Err(_) = scan_directory(&path, apps, depth + 1) {
                    // Continue on error
                }
            } else if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                // Fast path: use .lnk filename directly without parsing
                // Don't extract icon during scan to keep it fast - extract in background later
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    apps.push(AppInfo {
                        name: name.to_string(),
                        path: path.to_string_lossy().to_string(),
                        icon: None, // Will be extracted in background
                        description: None,
                    });
                }
            } else if path.extension().and_then(|s| s.to_str()) == Some("exe") {
                // Direct executable - don't extract icon during scan to keep it fast
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    apps.push(AppInfo {
                        name: name.to_string(),
                        path: path.to_string_lossy().to_string(),
                        icon: None, // Will be extracted in background
                        description: None,
                    });
                }
            }
        }

        Ok(())
    }

    // Extract icon from file and convert to base64 PNG
    pub fn extract_icon_base64(file_path: &Path) -> Option<String> {
        // Use PowerShell to extract icon and convert to base64
        let path_str = file_path.to_string_lossy().replace('\'', "''");
        let ps_command = format!(
            r#"
            try {{
                $path = '{}'
                if (Test-Path $path) {{
                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
                    if ($icon) {{
                        $bitmap = $icon.ToBitmap()
                        $ms = New-Object System.IO.MemoryStream
                        $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                        $bytes = $ms.ToArray()
                        $ms.Close()
                        $icon.Dispose()
                        $bitmap.Dispose()
                        [Convert]::ToBase64String($bytes)
                    }}
                }}
            }} catch {{
                # Silently fail
            }}
            "#,
            path_str
        );

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .ok()?;

        if output.status.success() {
            let base64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !base64.is_empty() {
                return Some(format!("data:image/png;base64,{}", base64));
            }
        }
        None
    }

    // Extract icon from .lnk file target
    pub fn extract_lnk_icon_base64(lnk_path: &Path) -> Option<String> {
        // First, get the target path of the .lnk file
        let path_str = lnk_path.to_string_lossy().replace('\'', "''");
        let ps_command = format!(
            r#"
            try {{
                $shell = New-Object -ComObject WScript.Shell
                $shortcut = $shell.CreateShortcut('{}')
                $targetPath = $shortcut.TargetPath
                if ($targetPath -and (Test-Path $targetPath)) {{
                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($targetPath)
                    if ($icon) {{
                        $bitmap = $icon.ToBitmap()
                        $ms = New-Object System.IO.MemoryStream
                        $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                        $bytes = $ms.ToArray()
                        $ms.Close()
                        $icon.Dispose()
                        $bitmap.Dispose()
                        [Convert]::ToBase64String($bytes)
                    }}
                }}
            }} catch {{
                # Silently fail
            }}
            "#,
            path_str
        );

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .ok()?;

        if output.status.success() {
            let base64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !base64.is_empty() {
                return Some(format!("data:image/png;base64,{}", base64));
            }
        }
        None
    }

    fn parse_lnk_file(lnk_path: &Path) -> Result<AppInfo, String> {
        // Use PowerShell to resolve .lnk file target
        let path_str = lnk_path.to_string_lossy().replace('\'', "''"); // Escape single quotes for PowerShell
        let ps_command = format!(
            r#"$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('{}'); $shortcut.TargetPath"#,
            path_str
        );

        // Add timeout to PowerShell command to avoid hanging
        let output = Command::new("powershell")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to parse .lnk file: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let target_path = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();

        if target_path.is_empty() {
            return Err("Empty target path".to_string());
        }

        // Check if target exists (it might be a relative path)
        let target = if Path::new(&target_path).exists() {
            target_path
        } else {
            // Try to resolve relative to the .lnk file's directory
            if let Some(parent) = lnk_path.parent() {
                let resolved = parent.join(&target_path);
                if resolved.exists() {
                    resolved.to_string_lossy().to_string()
                } else {
                    target_path // Return as-is, might be a system path
                }
            } else {
                target_path
            }
        };

        let name = lnk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        Ok(AppInfo {
            name,
            path: target,
            icon: None,
            description: None,
        })
    }

    pub fn search_apps(query: &str, apps: &[AppInfo]) -> Vec<AppInfo> {
        if query.is_empty() {
            return apps.to_vec();
        }

        let query_lower = query.to_lowercase();
        let mut results: Vec<(AppInfo, i32)> = apps
            .iter()
            .filter_map(|app| {
                let name_lower = app.name.to_lowercase();
                let path_lower = app.path.to_lowercase();

                let mut score = 0;

                // Exact match gets highest score
                if name_lower == query_lower {
                    score += 1000;
                } else if name_lower.starts_with(&query_lower) {
                    score += 500;
                } else if name_lower.contains(&query_lower) {
                    score += 100;
                }

                // Path match gets lower score
                if path_lower.contains(&query_lower) {
                    score += 10;
                }

                if score > 0 {
                    Some((app.clone(), score))
                } else {
                    None
                }
            })
            .collect();

        // Sort by score (descending)
        results.sort_by(|a, b| b.1.cmp(&a.1));

        results.into_iter().map(|(app, _)| app).collect()
    }

    pub fn launch_app(app: &AppInfo) -> Result<(), String> {
        let path = Path::new(&app.path);
        
        // If it's a .lnk file, use Windows shell to open it
        if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                // Use cmd /c start to properly handle .lnk files
                Command::new("cmd")
                    .args(&["/c", "start", "", &app.path])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .spawn()
                    .map_err(|e| format!("Failed to launch application: {}", e))?;
                return Ok(());
            }
        }
        
        if !path.exists() {
            return Err(format!("Application not found: {}", app.path));
        }

        // Use Windows ShellExecute or Command
        Command::new(&app.path)
            .spawn()
            .map_err(|e| format!("Failed to launch application: {}", e))?;

        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub mod windows {
    use super::*;

    pub fn scan_start_menu() -> Result<Vec<AppInfo>, String> {
        Err("App search is only supported on Windows".to_string())
    }

    pub fn search_apps(_query: &str, _apps: &[AppInfo]) -> Vec<AppInfo> {
        vec![]
    }

    pub fn launch_app(_app: &AppInfo) -> Result<(), String> {
        Err("App launch is only supported on Windows".to_string())
    }
}

