#[cfg(target_os = "windows")]
pub mod windows {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::{Foundation::HWND, UI::WindowsAndMessaging::WM_HOTKEY};

    // These functions are in user32.dll but not exposed in windows-sys
    // We'll use a different approach or define them manually
    extern "system" {
        fn RegisterHotKey(hWnd: HWND, id: i32, fsModifiers: u32, vk: u32) -> i32;
        fn UnregisterHotKey(hWnd: HWND, id: i32) -> i32;
    }

    const MOD_ALT: u32 = 0x0001;

    static HOTKEY_REGISTERED: AtomicBool = AtomicBool::new(false);

    // Hotkey ID for Alt+Space
    const HOTKEY_ID_ALT_SPACE: i32 = 1;

    // Virtual key code for Space
    const VK_SPACE: u32 = 0x20;

    pub fn register_hotkeys(hwnd: HWND) -> Result<(), String> {
        if HOTKEY_REGISTERED.load(Ordering::Relaxed) {
            return Ok(()); // Already registered
        }

        unsafe {
            // Register Alt+Space hotkey
            let result = RegisterHotKey(hwnd, HOTKEY_ID_ALT_SPACE, MOD_ALT, VK_SPACE);

            if result == 0 {
                return Err("Failed to register Alt+Space hotkey".to_string());
            }

            HOTKEY_REGISTERED.store(true, Ordering::Relaxed);
        }

        Ok(())
    }

    pub fn unregister_hotkeys(hwnd: HWND) -> Result<(), String> {
        if !HOTKEY_REGISTERED.load(Ordering::Relaxed) {
            return Ok(()); // Not registered
        }

        unsafe {
            let result = UnregisterHotKey(hwnd, HOTKEY_ID_ALT_SPACE);
            if result == 0 {
                return Err("Failed to unregister hotkey".to_string());
            }

            HOTKEY_REGISTERED.store(false, Ordering::Relaxed);
        }

        Ok(())
    }

    pub fn is_hotkey_message(msg: u32, wparam: isize) -> bool {
        msg == WM_HOTKEY && wparam == HOTKEY_ID_ALT_SPACE as isize
    }
}

#[cfg(not(target_os = "windows"))]
pub mod windows {
    pub fn register_hotkeys(_hwnd: isize) -> Result<(), String> {
        Err("Hotkeys are only supported on Windows".to_string())
    }

    pub fn unregister_hotkeys(_hwnd: isize) -> Result<(), String> {
        Err("Hotkeys are only supported on Windows".to_string())
    }

    pub fn is_hotkey_message(_msg: u32, _wparam: isize) -> bool {
        false
    }
}
