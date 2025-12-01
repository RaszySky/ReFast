use crate::recording::{EventType, MouseButton, RecordedEvent};
use serde_json;
use std::fs;
use std::path::Path;

pub struct ReplayState {
    pub is_playing: bool,
    pub current_events: Vec<RecordedEvent>,
    pub current_index: usize,
    pub speed_multiplier: f32,
}

impl ReplayState {
    pub fn new() -> Self {
        Self {
            is_playing: false,
            current_events: Vec::new(),
            current_index: 0,
            speed_multiplier: 1.0,
        }
    }

    pub fn load_recording<P: AsRef<Path>>(&mut self, path: P) -> Result<(), String> {
        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;

        // Parse JSON - the file contains {events: [...], duration_ms: ..., created_at: ...}
        let json: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Extract events array
        self.current_events = json["events"]
            .as_array()
            .ok_or_else(|| "Missing or invalid 'events' field in recording file".to_string())?
            .iter()
            .map(|v| serde_json::from_value(v.clone()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to parse events: {}", e))?;

        self.current_index = 0;
        Ok(())
    }

    pub fn start(&mut self, speed: f32) {
        self.is_playing = true;
        self.current_index = 0;
        self.speed_multiplier = speed;
    }

    pub fn stop(&mut self) {
        self.is_playing = false;
        self.current_index = 0;
    }

    pub fn get_progress(&self) -> f32 {
        if self.current_events.is_empty() {
            return 0.0;
        }
        (self.current_index as f32 / self.current_events.len() as f32) * 100.0
    }

    pub fn get_next_event(&mut self) -> Option<RecordedEvent> {
        if self.current_index < self.current_events.len() {
            let event = self.current_events[self.current_index].clone();
            self.current_index += 1;
            Some(event)
        } else {
            None
        }
    }

    pub fn execute_event(event: &RecordedEvent) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
                MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
                MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
                MOUSEEVENTF_WHEEL, MOUSEINPUT,
            };
            use windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos;

            unsafe {
                match &event.event_type {
                    EventType::MouseMove => {
                        if let (Some(x), Some(y)) = (event.x, event.y) {
                            // Validate coordinates are within screen bounds
                            if x < -32768 || x > 32767 || y < -32768 || y > 32767 {
                                return Err(format!("Invalid mouse coordinates: ({}, {})", x, y));
                            }
                            if SetCursorPos(x, y) == 0 {
                                return Err("Failed to move cursor".to_string());
                            }
                        }
                    }
                    EventType::MouseDown { button } => {
                        let flags = match button {
                            MouseButton::Left => MOUSEEVENTF_LEFTDOWN,
                            MouseButton::Right => MOUSEEVENTF_RIGHTDOWN,
                            MouseButton::Middle => MOUSEEVENTF_MIDDLEDOWN,
                        };

                        let mut input = INPUT {
                            r#type: INPUT_MOUSE,
                            Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                mi: MOUSEINPUT {
                                    dx: 0,
                                    dy: 0,
                                    mouseData: 0,
                                    dwFlags: flags,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };

                        if SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32) == 0 {
                            return Err("Failed to send mouse down event".to_string());
                        }
                    }
                    EventType::MouseUp { button } => {
                        let flags = match button {
                            MouseButton::Left => MOUSEEVENTF_LEFTUP,
                            MouseButton::Right => MOUSEEVENTF_RIGHTUP,
                            MouseButton::Middle => MOUSEEVENTF_MIDDLEUP,
                        };

                        let mut input = INPUT {
                            r#type: INPUT_MOUSE,
                            Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                mi: MOUSEINPUT {
                                    dx: 0,
                                    dy: 0,
                                    mouseData: 0,
                                    dwFlags: flags,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };

                        if SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32) == 0 {
                            return Err("Failed to send mouse up event".to_string());
                        }
                    }
                    EventType::MouseWheel { delta } => {
                        let mut input = INPUT {
                            r#type: INPUT_MOUSE,
                            Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                mi: MOUSEINPUT {
                                    dx: 0,
                                    dy: 0,
                                    mouseData: (*delta as u32) << 16,
                                    dwFlags: MOUSEEVENTF_WHEEL,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };

                        if SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32) == 0 {
                            return Err("Failed to send mouse wheel event".to_string());
                        }
                    }
                    EventType::KeyDown { vk_code } => {
                        // Validate virtual key code
                        if *vk_code > 255 {
                            return Err(format!("Invalid virtual key code: {}", vk_code));
                        }

                        let mut input = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: *vk_code as u16,
                                    wScan: 0,
                                    dwFlags: 0,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };

                        let result = SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
                        if result == 0 {
                            return Err(format!(
                                "Failed to send key down event for VK code: {}",
                                vk_code
                            ));
                        }
                    }
                    EventType::KeyUp { vk_code } => {
                        // Validate virtual key code
                        if *vk_code > 255 {
                            return Err(format!("Invalid virtual key code: {}", vk_code));
                        }

                        let mut input = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: *vk_code as u16,
                                    wScan: 0,
                                    dwFlags: KEYEVENTF_KEYUP,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };

                        let result = SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
                        if result == 0 {
                            return Err(format!(
                                "Failed to send key up event for VK code: {}",
                                vk_code
                            ));
                        }
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            return Err("Replay is only supported on Windows".to_string());
        }

        Ok(())
    }
}

impl Default for ReplayState {
    fn default() -> Self {
        Self::new()
    }
}
