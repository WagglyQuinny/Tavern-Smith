mod storage;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::Duration;
use storage::{
    delete_from_saves_directory_in_base, open_saves_folder_in_os, read_app_vault_state_in_base,
    resolve_storage_base, save_app_vault_state_in_base, save_to_saves_directory_in_base,
    scan_saves_directory_in_base, AppVaultSaveResult, AppVaultStatePayload, DiskStatePayload,
    StorageBase,
};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

struct DiskStorageState {
    base: StorageBase,
    write_lock: Mutex<()>,
}

struct HttpClientState {
    client: reqwest::Client,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveExportResult {
    saved: bool,
    cancelled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
fn get_disk_state(state: State<'_, DiskStorageState>) -> Result<DiskStatePayload, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Disk storage lock poisoned".to_string())?;
    scan_saves_directory_in_base(&state.base)
}

#[tauri::command]
fn save_disk_state(
    state: State<'_, DiskStorageState>,
    body: Value,
) -> Result<DiskStatePayload, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Disk storage lock poisoned".to_string())?;
    save_to_saves_directory_in_base(&state.base, &body)
}

#[tauri::command]
fn delete_disk_file(
    state: State<'_, DiskStorageState>,
    body: Value,
) -> Result<DiskStatePayload, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Disk storage lock poisoned".to_string())?;
    delete_from_saves_directory_in_base(&state.base, &body)
}

#[tauri::command]
fn get_app_vault(state: State<'_, DiskStorageState>) -> Result<AppVaultStatePayload, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Disk storage lock poisoned".to_string())?;
    read_app_vault_state_in_base(&state.base)
}

#[tauri::command]
fn save_app_vault(
    state: State<'_, DiskStorageState>,
    body: Value,
) -> Result<AppVaultSaveResult, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Disk storage lock poisoned".to_string())?;
    save_app_vault_state_in_base(&state.base, &body)
}

#[tauri::command]
fn open_saves_folder(state: State<'_, DiskStorageState>) -> Result<String, String> {
    open_saves_folder_in_os(&state.base)
}

#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    default_name: String,
    base64_data: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<SaveExportResult, String> {
    let bytes = BASE64_STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("Invalid export data encoding: {}", e))?;

    let safe_default_name = {
        let base = storage::extract_basename_only(&default_name);
        if base.is_empty() {
            "export.json".to_string()
        } else {
            base
        }
    };

    let chosen_path = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file().set_file_name(&safe_default_name);
        if !extensions.is_empty() {
            let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
            let label = if filter_name.trim().is_empty() {
                "File"
            } else {
                filter_name.as_str()
            };
            builder = builder.add_filter(label, &ext_refs);
        }
        builder.blocking_save_file()
    })
    .await
    .map_err(|e| format!("Save dialog task failed: {}", e))?;

    let Some(file_path) = chosen_path else {
        return Ok(SaveExportResult {
            saved: false,
            cancelled: true,
        });
    };

    let path = file_path
        .into_path()
        .map_err(|e| format!("Could not resolve selected file path: {}", e))?;
    fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write export file {}: {}", path.display(), e))?;

    Ok(SaveExportResult {
        saved: true,
        cancelled: false,
    })
}

#[tauri::command]
async fn http_fetch(
    http_state: State<'_, HttpClientState>,
    request: NativeHttpRequest,
) -> Result<NativeHttpResponse, String> {
    let parsed_url = reqwest::Url::parse(request.url.trim())
        .map_err(|e| format!("Invalid AI endpoint URL: {}", e))?;
    match parsed_url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "Unsupported URL scheme '{}': only http:// and https:// are allowed.",
                other
            ));
        }
    }

    let method = reqwest::Method::from_bytes(request.method.trim().as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req_builder = http_state.client.request(method, parsed_url);

    for (key, value) in &request.headers {
        let lower = key.trim().to_ascii_lowercase();
        if lower.is_empty()
            || lower == "origin"
            || lower == "host"
            || lower == "content-length"
        {
            continue;
        }
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    if let Some(body_str) = request.body {
        req_builder = req_builder.body(body_str);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    let status = response.status().as_u16();
    let mut headers: HashMap<String, String> = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(val_str) = value.to_str() {
            headers.insert(name.as_str().to_string(), val_str.to_string());
        }
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed reading response body: {}", e))?;

    Ok(NativeHttpResponse {
        status,
        headers,
        body,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let base = resolve_storage_base();
    let _ = storage::resolve_saves_dirs_from_base(&base);

    let http_client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(300))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DiskStorageState {
            base,
            write_lock: Mutex::new(()),
        })
        .manage(HttpClientState {
            client: http_client,
        })
        .invoke_handler(tauri::generate_handler![
            get_disk_state,
            save_disk_state,
            delete_disk_file,
            get_app_vault,
            save_app_vault,
            open_saves_folder,
            save_export_file,
            http_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TavernSmith desktop application");
}
