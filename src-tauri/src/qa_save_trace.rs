//! DERIVED synthetic-only observer. No release/default activation; no document bodies.
use crate::werkbestanden::Werkbestanden;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Instant,
};
const SOURCE: &str = "b696ab86bd1c128729a079b68c0082e6df3d36a5";
const FIXTURE: &str = "c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d";
struct Session {
    nonce: String,
    token: String,
    window: String,
    path: PathBuf,
    file: File,
    start: Instant,
    count: u64,
    lost: u64,
    active: bool,
}
static STATE: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
fn digest(bytes: &[u8]) -> String {
    crate::werkbestanden::hash(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn emit(s: &mut Session, point: u16, js_seq: u64, js_us: u64, values: &[u64], hash: Option<&str>) {
    if !s.active {
        return;
    }
    if s.count >= 1024 {
        s.lost += 1;
        return;
    }
    s.count += 1;
    let row = serde_json::json!({"schema":1,"pid":std::process::id(),"derived":"P5_OBSERVER_NOT_SIGNED_RELEASE",
        "baseSource":SOURCE,"baseVersion":"2026.48.1","session":s.nonce,
        "nativeSeq":s.count,"nativeUs":s.start.elapsed().as_micros() as u64,
        "jsSeq":js_seq,"jsUs":js_us,"point":point,"values":values,
        "sha256":hash,"nativeLost":s.lost});
    match serde_json::to_vec(&row) {
        Ok(mut data) => {
            data.push(b'\n');
            if s.file.write_all(&data).is_err() {
                s.lost += 1;
            }
        }
        Err(_) => s.lost += 1,
    }
}
fn with_session(f: impl FnOnce(&mut Session)) {
    if let Some(lock) = STATE.get() {
        if let Ok(mut guard) = lock.lock() {
            if let Some(s) = guard.as_mut().filter(|s| s.active) {
                f(s);
            }
        }
    }
}
#[tauri::command]
pub fn qa_save_trace_bind(
    venster: tauri::Window,
    state: tauri::State<'_, Werkbestanden>,
    token: Option<String>,
) -> Option<String> {
    if !cfg!(all(feature = "qa-save-trace", target_os = "macos"))
        || std::env::var("GITHUB_ACTIONS").ok().as_deref() != Some("true")
        || std::env::var("OOS_QA_SAVE_TRACE").ok().as_deref() != Some("DERIVED_P5_SYNTHETIC_ONLY")
    {
        return None;
    }
    let nonce = std::env::var("OOS_QA_SAVE_TRACE_SESSION").ok()?;
    if nonce.len() != 32
        || !nonce
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return None;
    }
    let mut guard = STATE.get_or_init(|| Mutex::new(None)).lock().ok()?;
    if let Some(s) = guard.as_mut() {
        if token.as_deref() == Some(s.token.as_str()) && venster.label() == s.window && s.active {
            return Some(s.nonce.clone());
        }
        emit(s, 98, 0, 0, &[], None);
        s.active = false;
        return None;
    }
    let token = token?;
    let temp = PathBuf::from(std::env::var("RUNNER_TEMP").ok()?)
        .canonicalize()
        .ok()?;
    let root = temp
        .join(format!("mac-save-trace-{nonce}"))
        .canonicalize()
        .ok()?;
    if root.parent() != Some(temp.as_path()) {
        return None;
    }
    let path = state.pad(&token, venster.label())?.canonicalize().ok()?;
    if path != root.join("control.docx") {
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    if bytes.len() > 1024 * 1024 || digest(&bytes) != FIXTURE {
        return None;
    }
    // Fresh owned ledger only: never overwrites a journal or a user path.
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(root.join("events.jsonl"))
        .ok()?;
    let mut s = Session {
        nonce: nonce.clone(),
        token,
        window: venster.label().to_owned(),
        path,
        file,
        start: Instant::now(),
        count: 0,
        lost: 0,
        active: true,
    };
    emit(&mut s, 90, 0, 0, &[], Some(FIXTURE));
    *guard = Some(s);
    Some(nonce)
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    point: u16,
    seq: u64,
    at_us: u64,
    values: Vec<u64>,
    digest: Option<String>,
}
#[tauri::command]
pub fn qa_save_trace_push(venster: tauri::Window, session: String, event: Event) -> bool {
    if event.point == 0
        || event.point > 99
        || event.values.len() > 12
        || event.digest.as_ref().is_some_and(|h| {
            h.len() != 64
                || !h
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
    {
        return false;
    }
    let mut accepted = false;
    with_session(|s| {
        if s.nonce == session && s.window == venster.label() {
            emit(
                s,
                event.point,
                event.seq,
                event.at_us,
                &event.values,
                event.digest.as_deref(),
            );
            accepted = true;
        }
    });
    accepted
}
pub fn event(point: u16, values: &[u64]) {
    with_session(|s| emit(s, point, 0, 0, values, None));
}
pub fn buffer(point: u16, bytes: &[u8], token: &str, window: &str) {
    with_session(|s| {
        if s.token == token && s.window == window {
            if bytes.len() <= 1024 * 1024 {
                emit(s, point, 0, 0, &[bytes.len() as u64], Some(&digest(bytes)));
            } else {
                s.lost += 1;
                emit(s, point, 0, 0, &[bytes.len() as u64], None);
            }
        }
    });
}
pub fn target(path: &Path, token: &str, window: &str) {
    with_session(|s| {
        if s.token == token && s.window == window {
            let actual = path.canonicalize().ok();
            let same = actual.as_ref() == Some(&s.path);
            let available = actual.is_some();
            let lexical = path == s.path.as_path();
            emit(
                s,
                72,
                0,
                0,
                &[u64::from(same), u64::from(available), u64::from(lexical)],
                None,
            );
        }
    });
}
