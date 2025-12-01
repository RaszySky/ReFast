use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum EventType {
    MouseMove,
    MouseDown { button: MouseButton },
    MouseUp { button: MouseButton },
    MouseWheel { delta: i32 },
    KeyDown { vk_code: u32 },
    KeyUp { vk_code: u32 },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecordedEvent {
    pub event_type: EventType,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub time_offset_ms: u64,
}

pub struct RecordingState {
    pub start_instant: Option<Instant>,
    pub events: Vec<RecordedEvent>,
    pub is_recording: bool,
}

impl RecordingState {
    pub fn new() -> Self {
        Self {
            start_instant: None,
            events: Vec::new(),
            is_recording: false,
        }
    }

    pub fn start(&mut self) {
        self.start_instant = Some(Instant::now());
        self.events.clear();
        self.is_recording = true;
    }

    pub fn stop(&mut self) {
        self.is_recording = false;
        self.start_instant = None;
    }

    pub fn add_event(&mut self, event: RecordedEvent) {
        if self.is_recording {
            self.events.push(event);
        }
    }

    pub fn get_time_offset_ms(&self) -> Option<u64> {
        self.start_instant
            .map(|start| start.elapsed().as_millis() as u64)
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecordingMeta {
    pub file_path: String,
    pub file_name: String,
    pub duration_ms: u64,
    pub event_count: usize,
    pub created_at: String,
}
