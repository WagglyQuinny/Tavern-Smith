use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

pub const META_FILENAME: &str = "_tavernsmith_meta.json";
pub const LEGACY_VAULT_FILENAME: &str = "_tavernsmith_vault.enc";
pub const APP_VAULT_DIRNAME: &str = ".tavernsmith-app";
pub const APP_VAULT_FILENAME: &str = "credentials.vault.enc";
pub const APP_VAULT_KEY_FILENAME: &str = "vault.key";

#[derive(Debug, Clone)]
pub struct StorageBase {
    pub base_dir: PathBuf,
    pub saves_display_root: String,
    pub vault_display_path: String,
}

#[derive(Debug, Clone)]
pub struct SavesDirs {
    pub disk_root: String,
    pub resolved_path: PathBuf,
    pub chars_dir: PathBuf,
    pub lore_dir: PathBuf,
    pub themes_dir: PathBuf,
    pub tags_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct AppVaultPaths {
    pub display_path: String,
    pub vault_file_path: PathBuf,
    pub key_file_path: PathBuf,
    pub legacy_vault_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskScannedFileEntry {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    pub folder_path: String,
    pub file_name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub updated_at: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_corrupted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrupt_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStatePayload {
    pub ok: bool,
    pub disk_root: String,
    pub resolved_path: String,
    pub characters: Vec<Value>,
    pub lorebooks: Vec<Value>,
    pub themes: Vec<Value>,
    pub tags: Vec<Value>,
    pub meta: Option<Value>,
    pub vault: Option<Value>,
    pub files: Vec<DiskScannedFileEntry>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVaultStatePayload {
    pub ok: bool,
    pub storage_path: String,
    pub app_key: String,
    pub vault: Option<Value>,
    pub legacy_vault: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVaultSaveResult {
    pub ok: bool,
    pub storage_path: String,
    pub saved: bool,
}

enum InspectedJson {
    Valid {
        parsed: Map<String, Value>,
        content: String,
        size_bytes: u64,
        updated_at: String,
    },
    Invalid {
        reason: String,
        content: String,
        size_bytes: u64,
        updated_at: String,
    },
}

fn format_iso_utc(time: SystemTime) -> String {
    let dt: DateTime<Utc> = time.into();
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn now_iso_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(not(target_os = "macos"))]
fn ensure_trailing_slash(path: &Path) -> String {
    let mut s = path.to_string_lossy().to_string();
    if !s.ends_with('/') && !s.ends_with('\\') {
        s.push(std::path::MAIN_SEPARATOR);
    }
    s
}

#[cfg(unix)]
fn set_owner_only_file_mode(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_owner_only_file_mode(_path: &Path) {}

#[cfg(unix)]
fn set_owner_only_dir_mode(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn set_owner_only_dir_mode(_path: &Path) {}

#[cfg(not(target_os = "macos"))]
fn is_directory_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(format!(
        ".tavernsmith_write_probe_{}",
        std::process::id()
    ));
    match fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn resolve_os_app_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            let p = PathBuf::from(app_data);
            if !p.as_os_str().is_empty() {
                return p.join("TavernSmith");
            }
        }
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let p = PathBuf::from(local_app_data);
            if !p.as_os_str().is_empty() {
                return p.join("TavernSmith");
            }
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            let p = PathBuf::from(profile);
            if !p.as_os_str().is_empty() {
                return p.join("TavernSmith");
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let p = PathBuf::from(home);
            if !p.as_os_str().is_empty() {
                return p
                    .join("Library")
                    .join("Application Support")
                    .join("TavernSmith");
            }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
            let p = PathBuf::from(xdg);
            if !p.as_os_str().is_empty() {
                return p.join("TavernSmith");
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let p = PathBuf::from(home);
            if !p.as_os_str().is_empty() {
                return p.join(".local").join("share").join("TavernSmith");
            }
        }
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(not(target_os = "macos"))]
fn resolve_portable_candidate_dir() -> Option<PathBuf> {
    // On Linux AppImage, `APPIMAGE` points to the real portable `.AppImage` file path
    // whereas `current_exe()` points inside the read-only `/tmp/.mount_...` FUSE mount.
    #[cfg(target_os = "linux")]
    if let Some(appimage_path) = std::env::var_os("APPIMAGE") {
        let p = PathBuf::from(appimage_path);
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() {
                return Some(parent.to_path_buf());
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if !parent.as_os_str().is_empty() {
                return Some(parent.to_path_buf());
            }
        }
    }

    std::env::current_dir().ok()
}

/// Resolves the storage base directory using OS-appropriate defaults:
/// - Windows & Linux: portable `./Saves/` & `./.tavernsmith-app/` right next to the binary
///   (or `.AppImage` file on Linux), falling back to OS App Data only if unwritable.
/// - macOS: `~/Library/Application Support/TavernSmith/` because `.app`/`.dmg` bundles
///   and Gatekeeper App Translocation mount read-only.
pub fn resolve_storage_base() -> StorageBase {
    #[cfg(target_os = "macos")]
    {
        let base_dir = resolve_os_app_data_dir();
        let saves_display_root = "~/Library/Application Support/TavernSmith/Saves/".to_string();
        let vault_display_path =
            format!("~/Library/Application Support/TavernSmith/{}/", APP_VAULT_DIRNAME);
        StorageBase {
            base_dir,
            saves_display_root,
            vault_display_path,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(portable_dir) = resolve_portable_candidate_dir() {
            let saves_candidate = portable_dir.join("Saves");
            if is_directory_writable(&saves_candidate) {
                return StorageBase {
                    base_dir: portable_dir,
                    saves_display_root: "./Saves/".to_string(),
                    vault_display_path: format!("./{}/", APP_VAULT_DIRNAME),
                };
            }
        }

        let fallback_base = resolve_os_app_data_dir();
        let saves_path = fallback_base.join("Saves");
        let vault_path = fallback_base.join(APP_VAULT_DIRNAME);
        StorageBase {
            base_dir: fallback_base,
            saves_display_root: ensure_trailing_slash(&saves_path),
            vault_display_path: ensure_trailing_slash(&vault_path),
        }
    }
}

pub fn extract_basename_only(raw: &str) -> String {
    raw.rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

pub fn sanitize_disk_file_name(raw: &str) -> String {
    let base_name = extract_basename_only(if raw.trim().is_empty() {
        "untitled"
    } else {
        raw
    });
    let without_ext = if base_name.len() >= 5
        && base_name[base_name.len() - 5..].eq_ignore_ascii_case(".json")
    {
        &base_name[..base_name.len() - 5]
    } else {
        base_name.as_str()
    };

    let mut clean = String::with_capacity(without_ext.len());
    let mut prev_underscore = false;
    for ch in without_ext.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            clean.push(ch);
            prev_underscore = false;
        } else if !prev_underscore {
            clean.push('_');
            prev_underscore = true;
        }
    }

    let trimmed = clean.trim_matches('_');
    let stem = if trimmed.is_empty() {
        "untitled"
    } else {
        trimmed
    };
    format!("{}.json", stem)
}

pub fn reserve_unique_disk_file_name(
    preferred_name: &str,
    used_names_lower: &mut HashSet<String>,
) -> String {
    let initial = sanitize_disk_file_name(preferred_name);
    let stem = initial
        .strip_suffix(".json")
        .unwrap_or(initial.as_str())
        .to_string();
    let mut candidate = initial;
    let mut suffix: usize = 2;
    while used_names_lower.contains(&candidate.to_lowercase()) {
        candidate = format!("{}_{}.json", stem, suffix);
        suffix += 1;
    }
    used_names_lower.insert(candidate.to_lowercase());
    candidate
}

pub fn is_file_confined_in_dir(dir_path: &Path, candidate_path: &Path) -> bool {
    let Ok(real_dir) = fs::canonicalize(dir_path) else {
        return false;
    };
    let Ok(real_candidate) = fs::canonicalize(candidate_path) else {
        return false;
    };
    real_candidate != real_dir && real_candidate.starts_with(&real_dir)
}

pub fn extract_entity_id_from_json(parsed: &Map<String, Value>) -> String {
    let source = parsed
        .get("payload")
        .and_then(|v| v.as_object())
        .unwrap_or(parsed);

    if let Some(id) = source
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return id.to_string();
    }

    if let Some(data_obj) = source.get("data").and_then(|v| v.as_object()) {
        if let Some(id) = data_obj
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return id.to_string();
        }
        if let Some(ts_obj) = data_obj
            .get("extensions")
            .and_then(|v| v.as_object())
            .and_then(|e| e.get("tavernsmith"))
            .and_then(|v| v.as_object())
        {
            if let Some(id) = ts_obj
                .get("id")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return id.to_string();
            }
        }
    }

    if let Some(ts_obj) = source
        .get("extensions")
        .and_then(|v| v.as_object())
        .and_then(|e| e.get("tavernsmith"))
        .and_then(|v| v.as_object())
    {
        if let Some(id) = ts_obj
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return id.to_string();
        }
    }

    String::new()
}

fn write_file_safely(target_path: &Path, content: &[u8], owner_only: bool) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let tmp_name = format!(
        ".{}.tmp.{}",
        target_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file"),
        std::process::id()
    );
    let tmp_path = target_path.with_file_name(tmp_name);

    if fs::write(&tmp_path, content).is_ok() {
        if owner_only {
            set_owner_only_file_mode(&tmp_path);
        }
        if fs::rename(&tmp_path, target_path).is_ok() {
            if owner_only {
                set_owner_only_file_mode(target_path);
            }
            return Ok(());
        }
        let _ = fs::remove_file(&tmp_path);
    }

    fs::write(target_path, content)
        .map_err(|e| format!("Failed to write {}: {}", target_path.display(), e))?;
    if owner_only {
        set_owner_only_file_mode(target_path);
    }
    Ok(())
}

fn inspect_disk_json_file(full_path: &Path) -> InspectedJson {
    let mut size_bytes: u64 = 0;
    let mut updated_at = now_iso_utc();

    match fs::metadata(full_path) {
        Ok(meta) => {
            size_bytes = meta.len();
            if let Ok(modified) = meta.modified() {
                updated_at = format_iso_utc(modified);
            }
        }
        Err(err) => {
            return InspectedJson::Invalid {
                reason: err.to_string(),
                content: String::new(),
                size_bytes,
                updated_at,
            };
        }
    }

    let content = match fs::read_to_string(full_path) {
        Ok(c) => c,
        Err(err) => {
            return InspectedJson::Invalid {
                reason: err.to_string(),
                content: String::new(),
                size_bytes,
                updated_at,
            };
        }
    };

    if content.trim().is_empty() {
        return InspectedJson::Invalid {
            reason: "File is empty (0 bytes or whitespace only)".to_string(),
            content,
            size_bytes,
            updated_at,
        };
    }

    match serde_json::from_str::<Value>(&content) {
        Ok(Value::Object(map)) => InspectedJson::Valid {
            parsed: map,
            content,
            size_bytes,
            updated_at,
        },
        Ok(_) => InspectedJson::Invalid {
            reason: "JSON root must be an object".to_string(),
            content: content.chars().take(16384).collect(),
            size_bytes,
            updated_at,
        },
        Err(err) => InspectedJson::Invalid {
            reason: err.to_string(),
            content: content.chars().take(16384).collect(),
            size_bytes,
            updated_at,
        },
    }
}

fn list_sorted_json_files(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".json") {
            continue;
        }
        out.push((name, entry.path()));
    }
    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()).then_with(|| a.0.cmp(&b.0)));
    out
}

fn prune_valid_orphan_json_files(target_dir: &Path, written_files_lower: &HashSet<String>) {
    let Ok(entries) = fs::read_dir(target_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".json") {
            continue;
        }
        if !written_files_lower.contains(&name.to_lowercase()) {
            let orphan_path = entry.path();
            if orphan_path.exists() && is_file_confined_in_dir(target_dir, &orphan_path) {
                // Keep corrupted/unparseable files visible until explicitly deleted by the user
                if let InspectedJson::Valid { .. } = inspect_disk_json_file(&orphan_path) {
                    let _ = fs::remove_file(&orphan_path);
                }
            }
        }
    }
}

pub fn resolve_saves_dirs_from_base(base: &StorageBase) -> Result<SavesDirs, String> {
    let resolved_path = base.base_dir.join("Saves");
    let chars_dir = resolved_path.join("Characters");
    let lore_dir = resolved_path.join("Lorebooks");
    let themes_dir = resolved_path.join("Themes");
    let tags_dir = resolved_path.join("Tags");

    for dir in [&resolved_path, &chars_dir, &lore_dir, &themes_dir, &tags_dir] {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to initialize Saves folder {}: {}", dir.display(), e))?;
    }

    Ok(SavesDirs {
        disk_root: base.saves_display_root.clone(),
        resolved_path,
        chars_dir,
        lore_dir,
        themes_dir,
        tags_dir,
    })
}

pub fn resolve_app_vault_paths_from_base(base: &StorageBase) -> Result<AppVaultPaths, String> {
    let app_vault_dir = base.base_dir.join(APP_VAULT_DIRNAME);
    fs::create_dir_all(&app_vault_dir).map_err(|e| {
        format!(
            "Failed to initialize app vault directory {}: {}",
            app_vault_dir.display(),
            e
        )
    })?;
    set_owner_only_dir_mode(&app_vault_dir);

    Ok(AppVaultPaths {
        display_path: base.vault_display_path.clone(),
        vault_file_path: app_vault_dir.join(APP_VAULT_FILENAME),
        key_file_path: app_vault_dir.join(APP_VAULT_KEY_FILENAME),
        legacy_vault_path: base.base_dir.join("Saves").join(LEGACY_VAULT_FILENAME),
    })
}

fn read_or_create_app_vault_key(key_file_path: &Path) -> Result<String, String> {
    if key_file_path.exists() {
        if let Ok(existing) = fs::read_to_string(key_file_path) {
            let trimmed = existing.trim();
            if trimmed.len() >= 32 {
                return Ok(trimmed.to_string());
            }
        }
    }

    let mut random_bytes = [0u8; 32];
    getrandom::getrandom(&mut random_bytes)
        .map_err(|e| format!("OS CSPRNG failed generating vault key: {}", e))?;
    let generated = BASE64_STANDARD.encode(random_bytes);
    write_file_safely(key_file_path, format!("{}\n", generated).as_bytes(), true)?;
    Ok(generated)
}

pub fn read_app_vault_state_in_base(base: &StorageBase) -> Result<AppVaultStatePayload, String> {
    let paths = resolve_app_vault_paths_from_base(base)?;
    let app_key = read_or_create_app_vault_key(&paths.key_file_path)?;

    let mut vault: Option<Value> = None;
    let mut legacy_vault: Option<Value> = None;

    if paths.vault_file_path.exists() {
        if let InspectedJson::Valid { parsed, .. } = inspect_disk_json_file(&paths.vault_file_path)
        {
            vault = Some(Value::Object(parsed));
        }
    }

    if vault.is_none() && paths.legacy_vault_path.exists() {
        if let InspectedJson::Valid { parsed, .. } =
            inspect_disk_json_file(&paths.legacy_vault_path)
        {
            legacy_vault = Some(Value::Object(parsed));
        }
    }

    Ok(AppVaultStatePayload {
        ok: true,
        storage_path: paths.display_path,
        app_key,
        vault,
        legacy_vault,
    })
}

pub fn save_app_vault_state_in_base(
    base: &StorageBase,
    body: &Value,
) -> Result<AppVaultSaveResult, String> {
    let paths = resolve_app_vault_paths_from_base(base)?;
    let _ = read_or_create_app_vault_key(&paths.key_file_path)?;

    if let Some(vault_obj) = body.get("vault").and_then(|v| v.as_object()) {
        let serialized = serde_json::to_string_pretty(&Value::Object(vault_obj.clone()))
            .map_err(|e| format!("Failed to serialize vault envelope: {}", e))?;
        write_file_safely(&paths.vault_file_path, serialized.as_bytes(), true)?;
    }

    if body.get("removeLegacy").and_then(|v| v.as_bool()) == Some(true)
        && paths.legacy_vault_path.exists()
    {
        let _ = fs::remove_file(&paths.legacy_vault_path);
    }

    Ok(AppVaultSaveResult {
        ok: true,
        storage_path: paths.display_path,
        saved: true,
    })
}

pub fn scan_saves_directory_in_base(base: &StorageBase) -> Result<DiskStatePayload, String> {
    let dirs = resolve_saves_dirs_from_base(base)?;

    let mut characters: Vec<Value> = Vec::new();
    let mut lorebooks: Vec<Value> = Vec::new();
    let mut themes: Vec<Value> = Vec::new();
    let mut tags: Vec<Value> = Vec::new();
    let mut meta: Option<Value> = None;
    let mut files: Vec<DiskScannedFileEntry> = Vec::new();

    // 1. Characters/
    for (file_name, full_path) in list_sorted_json_files(&dirs.chars_dir) {
        if !is_file_confined_in_dir(&dirs.chars_dir, &full_path) {
            continue;
        }
        match inspect_disk_json_file(&full_path) {
            InspectedJson::Invalid {
                reason,
                content,
                size_bytes,
                updated_at,
            } => {
                files.push(DiskScannedFileEntry {
                    id: format!("Characters/{}", file_name),
                    entity_id: None,
                    folder_path: "Characters/".to_string(),
                    file_name,
                    kind: "character".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: Some(true),
                    corrupt_reason: Some(reason),
                });
            }
            InspectedJson::Valid {
                mut parsed,
                content,
                size_bytes,
                updated_at,
            } => {
                if parsed.get("_tavernsmithType").and_then(|v| v.as_str()) == Some("lorebook") {
                    continue;
                }
                let entity_id = extract_entity_id_from_json(&parsed);
                parsed.insert("_diskFileName".to_string(), Value::String(file_name.clone()));
                parsed.insert("_diskUpdatedAt".to_string(), Value::String(updated_at.clone()));
                characters.push(Value::Object(parsed));
                files.push(DiskScannedFileEntry {
                    id: format!("Characters/{}", file_name),
                    entity_id: if entity_id.is_empty() {
                        None
                    } else {
                        Some(entity_id)
                    },
                    folder_path: "Characters/".to_string(),
                    file_name,
                    kind: "character".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: None,
                    corrupt_reason: None,
                });
            }
        }
    }

    // 2. Lorebooks/
    for (file_name, full_path) in list_sorted_json_files(&dirs.lore_dir) {
        if !is_file_confined_in_dir(&dirs.lore_dir, &full_path) {
            continue;
        }
        match inspect_disk_json_file(&full_path) {
            InspectedJson::Invalid {
                reason,
                content,
                size_bytes,
                updated_at,
            } => {
                files.push(DiskScannedFileEntry {
                    id: format!("Lorebooks/{}", file_name),
                    entity_id: None,
                    folder_path: "Lorebooks/".to_string(),
                    file_name,
                    kind: "lorebook".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: Some(true),
                    corrupt_reason: Some(reason),
                });
            }
            InspectedJson::Valid {
                mut parsed,
                content,
                size_bytes,
                updated_at,
            } => {
                if parsed.get("_tavernsmithType").and_then(|v| v.as_str()) == Some("character") {
                    continue;
                }
                let entity_id = extract_entity_id_from_json(&parsed);
                parsed.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("lorebook".to_string()),
                );
                parsed.insert("_diskFileName".to_string(), Value::String(file_name.clone()));
                parsed.insert("_diskUpdatedAt".to_string(), Value::String(updated_at.clone()));
                lorebooks.push(Value::Object(parsed));
                files.push(DiskScannedFileEntry {
                    id: format!("Lorebooks/{}", file_name),
                    entity_id: if entity_id.is_empty() {
                        None
                    } else {
                        Some(entity_id)
                    },
                    folder_path: "Lorebooks/".to_string(),
                    file_name,
                    kind: "lorebook".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: None,
                    corrupt_reason: None,
                });
            }
        }
    }

    // 3. Themes/
    for (file_name, full_path) in list_sorted_json_files(&dirs.themes_dir) {
        if !is_file_confined_in_dir(&dirs.themes_dir, &full_path) {
            continue;
        }
        match inspect_disk_json_file(&full_path) {
            InspectedJson::Invalid {
                reason,
                content,
                size_bytes,
                updated_at,
            } => {
                files.push(DiskScannedFileEntry {
                    id: format!("Themes/{}", file_name),
                    entity_id: None,
                    folder_path: "Themes/".to_string(),
                    file_name,
                    kind: "theme".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: Some(true),
                    corrupt_reason: Some(reason),
                });
            }
            InspectedJson::Valid {
                mut parsed,
                content,
                size_bytes,
                updated_at,
            } => {
                let entity_id = extract_entity_id_from_json(&parsed);
                parsed.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("theme".to_string()),
                );
                parsed.insert("_diskFileName".to_string(), Value::String(file_name.clone()));
                parsed.insert("_diskUpdatedAt".to_string(), Value::String(updated_at.clone()));
                themes.push(Value::Object(parsed));
                files.push(DiskScannedFileEntry {
                    id: format!("Themes/{}", file_name),
                    entity_id: if entity_id.is_empty() {
                        None
                    } else {
                        Some(entity_id)
                    },
                    folder_path: "Themes/".to_string(),
                    file_name,
                    kind: "theme".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: None,
                    corrupt_reason: None,
                });
            }
        }
    }

    // 4. Tags/
    for (file_name, full_path) in list_sorted_json_files(&dirs.tags_dir) {
        if !is_file_confined_in_dir(&dirs.tags_dir, &full_path) {
            continue;
        }
        match inspect_disk_json_file(&full_path) {
            InspectedJson::Invalid {
                reason,
                content,
                size_bytes,
                updated_at,
            } => {
                files.push(DiskScannedFileEntry {
                    id: format!("Tags/{}", file_name),
                    entity_id: None,
                    folder_path: "Tags/".to_string(),
                    file_name,
                    kind: "tag".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: Some(true),
                    corrupt_reason: Some(reason),
                });
            }
            InspectedJson::Valid {
                mut parsed,
                content,
                size_bytes,
                updated_at,
            } => {
                let entity_id = extract_entity_id_from_json(&parsed);
                parsed.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("tag".to_string()),
                );
                parsed.insert("_diskFileName".to_string(), Value::String(file_name.clone()));
                parsed.insert("_diskUpdatedAt".to_string(), Value::String(updated_at.clone()));
                tags.push(Value::Object(parsed));
                files.push(DiskScannedFileEntry {
                    id: format!("Tags/{}", file_name),
                    entity_id: if entity_id.is_empty() {
                        None
                    } else {
                        Some(entity_id)
                    },
                    folder_path: "Tags/".to_string(),
                    file_name,
                    kind: "tag".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: None,
                    corrupt_reason: None,
                });
            }
        }
    }

    // 5. _tavernsmith_meta.json
    let meta_path = dirs.resolved_path.join(META_FILENAME);
    if meta_path.exists() && is_file_confined_in_dir(&dirs.resolved_path, &meta_path) {
        match inspect_disk_json_file(&meta_path) {
            InspectedJson::Invalid {
                reason,
                content,
                size_bytes,
                updated_at,
            } => {
                files.push(DiskScannedFileEntry {
                    id: format!("/{}", META_FILENAME),
                    entity_id: None,
                    folder_path: "/".to_string(),
                    file_name: META_FILENAME.to_string(),
                    kind: "meta".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: Some(true),
                    corrupt_reason: Some(reason),
                });
            }
            InspectedJson::Valid {
                parsed,
                content,
                size_bytes,
                updated_at,
            } => {
                meta = Some(Value::Object(parsed));
                files.push(DiskScannedFileEntry {
                    id: format!("/{}", META_FILENAME),
                    entity_id: None,
                    folder_path: "/".to_string(),
                    file_name: META_FILENAME.to_string(),
                    kind: "meta".to_string(),
                    size_bytes,
                    updated_at,
                    content,
                    is_corrupted: None,
                    corrupt_reason: None,
                });
            }
        }
    }

    Ok(DiskStatePayload {
        ok: true,
        disk_root: dirs.disk_root,
        resolved_path: ensure_trailing_slash(&dirs.resolved_path),
        characters,
        lorebooks,
        themes,
        tags,
        meta,
        vault: None,
        files,
        updated_at: now_iso_utc(),
    })
}

pub fn save_to_saves_directory_in_base(
    base: &StorageBase,
    body: &Value,
) -> Result<DiskStatePayload, String> {
    let dirs = resolve_saves_dirs_from_base(base)?;

    // 1. Characters
    if let Some(items) = body.get("characters").and_then(|v| v.as_array()) {
        let mut used_targets: HashSet<String> = HashSet::new();
        let mut written_files: HashSet<String> = HashSet::new();

        for item in items {
            let Some(entry_obj) = item.as_object() else {
                continue;
            };
            let payload_obj = entry_obj
                .get("payload")
                .and_then(|v| v.as_object())
                .unwrap_or(entry_obj);
            if payload_obj
                .get("_tavernsmithType")
                .and_then(|v| v.as_str())
                == Some("lorebook")
            {
                continue;
            }
            let raw_name = entry_obj
                .get("fileName")
                .and_then(|v| v.as_str())
                .or_else(|| {
                    payload_obj
                        .get("data")
                        .and_then(|v| v.as_object())
                        .and_then(|d| d.get("name"))
                        .and_then(|v| v.as_str())
                })
                .or_else(|| payload_obj.get("name").and_then(|v| v.as_str()))
                .unwrap_or("untitled");

            let target_file = reserve_unique_disk_file_name(raw_name, &mut used_targets);
            let out_content = if let Some(raw_str) = entry_obj.get("content").and_then(|v| v.as_str())
            {
                raw_str.to_string()
            } else {
                let mut cloned = payload_obj.clone();
                cloned.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("character".to_string()),
                );
                serde_json::to_string_pretty(&Value::Object(cloned))
                    .map_err(|e| format!("Failed to serialize character: {}", e))?
            };

            write_file_safely(&dirs.chars_dir.join(&target_file), out_content.as_bytes(), false)?;
            written_files.insert(target_file.to_lowercase());
        }

        prune_valid_orphan_json_files(&dirs.chars_dir, &written_files);
    }

    // 2. Lorebooks
    if let Some(items) = body.get("lorebooks").and_then(|v| v.as_array()) {
        let mut used_targets: HashSet<String> = HashSet::new();
        let mut written_files: HashSet<String> = HashSet::new();

        for item in items {
            let Some(entry_obj) = item.as_object() else {
                continue;
            };
            let payload_obj = entry_obj
                .get("payload")
                .and_then(|v| v.as_object())
                .unwrap_or(entry_obj);
            if payload_obj
                .get("_tavernsmithType")
                .and_then(|v| v.as_str())
                == Some("character")
            {
                continue;
            }
            let raw_name = entry_obj
                .get("fileName")
                .and_then(|v| v.as_str())
                .or_else(|| payload_obj.get("name").and_then(|v| v.as_str()))
                .unwrap_or("untitled_lorebook");

            let target_file = reserve_unique_disk_file_name(raw_name, &mut used_targets);
            let out_content = if let Some(raw_str) = entry_obj.get("content").and_then(|v| v.as_str())
            {
                raw_str.to_string()
            } else {
                let mut cloned = payload_obj.clone();
                cloned.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("lorebook".to_string()),
                );
                serde_json::to_string_pretty(&Value::Object(cloned))
                    .map_err(|e| format!("Failed to serialize lorebook: {}", e))?
            };

            write_file_safely(&dirs.lore_dir.join(&target_file), out_content.as_bytes(), false)?;
            written_files.insert(target_file.to_lowercase());
        }

        prune_valid_orphan_json_files(&dirs.lore_dir, &written_files);
    }

    // 3. Themes
    if let Some(items) = body.get("themes").and_then(|v| v.as_array()) {
        let mut used_targets: HashSet<String> = HashSet::new();
        let mut written_files: HashSet<String> = HashSet::new();

        for item in items {
            let Some(entry_obj) = item.as_object() else {
                continue;
            };
            let payload_obj = entry_obj
                .get("payload")
                .and_then(|v| v.as_object())
                .unwrap_or(entry_obj);
            let raw_name = entry_obj
                .get("fileName")
                .and_then(|v| v.as_str())
                .or_else(|| payload_obj.get("name").and_then(|v| v.as_str()))
                .unwrap_or("custom_theme");

            let target_file = reserve_unique_disk_file_name(raw_name, &mut used_targets);
            let out_content = if let Some(raw_str) = entry_obj.get("content").and_then(|v| v.as_str())
            {
                raw_str.to_string()
            } else {
                let mut cloned = payload_obj.clone();
                cloned.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("theme".to_string()),
                );
                serde_json::to_string(&Value::Object(cloned))
                    .map_err(|e| format!("Failed to serialize theme: {}", e))?
            };

            write_file_safely(&dirs.themes_dir.join(&target_file), out_content.as_bytes(), false)?;
            written_files.insert(target_file.to_lowercase());
        }

        prune_valid_orphan_json_files(&dirs.themes_dir, &written_files);
    }

    // 4. Tags
    if let Some(items) = body.get("tags").and_then(|v| v.as_array()) {
        let mut used_targets: HashSet<String> = HashSet::new();
        let mut written_files: HashSet<String> = HashSet::new();

        for item in items {
            let Some(entry_obj) = item.as_object() else {
                continue;
            };
            let payload_obj = entry_obj
                .get("payload")
                .and_then(|v| v.as_object())
                .unwrap_or(entry_obj);
            let raw_name = entry_obj
                .get("fileName")
                .and_then(|v| v.as_str())
                .or_else(|| payload_obj.get("name").and_then(|v| v.as_str()))
                .unwrap_or("custom_tag");

            let target_file = reserve_unique_disk_file_name(raw_name, &mut used_targets);
            let out_content = if let Some(raw_str) = entry_obj.get("content").and_then(|v| v.as_str())
            {
                raw_str.to_string()
            } else {
                let mut cloned = payload_obj.clone();
                cloned.insert(
                    "_tavernsmithType".to_string(),
                    Value::String("tag".to_string()),
                );
                serde_json::to_string(&Value::Object(cloned))
                    .map_err(|e| format!("Failed to serialize tag: {}", e))?
            };

            write_file_safely(&dirs.tags_dir.join(&target_file), out_content.as_bytes(), false)?;
            written_files.insert(target_file.to_lowercase());
        }

        prune_valid_orphan_json_files(&dirs.tags_dir, &written_files);
    }

    // 5. _tavernsmith_meta.json
    if let Some(meta_obj) = body.get("meta").and_then(|v| v.as_object()) {
        let serialized = serde_json::to_string_pretty(&Value::Object(meta_obj.clone()))
            .map_err(|e| format!("Failed to serialize meta JSON: {}", e))?;
        write_file_safely(
            &dirs.resolved_path.join(META_FILENAME),
            serialized.as_bytes(),
            false,
        )?;
    }

    scan_saves_directory_in_base(base)
}

pub fn delete_from_saves_directory_in_base(
    base: &StorageBase,
    body: &Value,
) -> Result<DiskStatePayload, String> {
    let dirs = resolve_saves_dirs_from_base(base)?;

    let raw_folder = body
        .get("folder")
        .or_else(|| body.get("kind"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let mut candidate_names: HashSet<String> = HashSet::new();
    if let Some(raw_file) = body.get("fileName").and_then(|v| v.as_str()) {
        let base_name = extract_basename_only(raw_file);
        if !base_name.is_empty() {
            candidate_names.insert(base_name);
        }
    }
    if let Some(raw_saved) = body.get("savedFileName").and_then(|v| v.as_str()) {
        let base_name = extract_basename_only(raw_saved);
        if !base_name.is_empty() {
            candidate_names.insert(base_name);
        }
    }

    let raw_name = body
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let raw_id = body
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");

    if raw_folder == "root" || raw_folder == "meta" {
        for name in &candidate_names {
            if name != META_FILENAME {
                continue;
            }
            let target_path = dirs.resolved_path.join(name);
            if target_path.exists() && is_file_confined_in_dir(&dirs.resolved_path, &target_path) {
                let _ = fs::remove_file(&target_path);
            }
        }
        return scan_saves_directory_in_base(base);
    }

    let target_dir = match raw_folder.as_str() {
        "lorebooks" | "lorebook" => &dirs.lore_dir,
        "themes" | "theme" => &dirs.themes_dir,
        "tags" | "tag" => &dirs.tags_dir,
        _ => &dirs.chars_dir,
    };

    let mut deleted_any = false;
    for name in &candidate_names {
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        if !name.to_lowercase().ends_with(".json") {
            continue;
        }
        let target_path = target_dir.join(name);
        if target_path.exists() && is_file_confined_in_dir(target_dir, &target_path) {
            if fs::remove_file(&target_path).is_ok() {
                deleted_any = true;
            }
        }
    }

    if !raw_id.is_empty() && target_dir.exists() {
        for (_file_name, full_path) in list_sorted_json_files(target_dir) {
            if !is_file_confined_in_dir(target_dir, &full_path) {
                continue;
            }
            if let Ok(raw_text) = fs::read_to_string(&full_path) {
                if let Ok(Value::Object(parsed)) = serde_json::from_str::<Value>(&raw_text) {
                    if extract_entity_id_from_json(&parsed) == raw_id
                        && fs::remove_file(&full_path).is_ok()
                    {
                        deleted_any = true;
                    }
                }
            }
        }
    }

    if !deleted_any && !raw_name.is_empty() {
        let sanitized_target = target_dir.join(sanitize_disk_file_name(raw_name));
        if sanitized_target.exists() && is_file_confined_in_dir(target_dir, &sanitized_target) {
            let _ = fs::remove_file(&sanitized_target);
        }
    }

    scan_saves_directory_in_base(base)
}

pub fn open_saves_folder_in_os(base: &StorageBase) -> Result<String, String> {
    let dirs = resolve_saves_dirs_from_base(base)?;
    let target = dirs.resolved_path;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(ensure_trailing_slash(&target))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_temp_base(tag: &str) -> StorageBase {
        let dir = std::env::temp_dir().join(format!(
            "tavernsmith_rust_test_{}_{}",
            tag,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        StorageBase {
            base_dir: dir,
            saves_display_root: "./Saves/".to_string(),
            vault_display_path: "./.tavernsmith-app/".to_string(),
        }
    }

    #[test]
    fn test_sanitize_and_unique_names() {
        assert_eq!(sanitize_disk_file_name("Lyra Vance"), "Lyra_Vance.json");
        assert_eq!(
            sanitize_disk_file_name("../../etc/passwd"),
            "passwd.json"
        );
        assert_eq!(
            sanitize_disk_file_name("..\\..\\Windows\\system.json"),
            "system.json"
        );
        assert_eq!(sanitize_disk_file_name("   "), "untitled.json");

        let mut used = HashSet::new();
        assert_eq!(reserve_unique_disk_file_name("Hero", &mut used), "Hero.json");
        assert_eq!(
            reserve_unique_disk_file_name("hero", &mut used),
            "hero_2.json"
        );
        assert_eq!(
            reserve_unique_disk_file_name("Hero", &mut used),
            "Hero_3.json"
        );
    }

    #[test]
    fn test_save_scan_delete_and_vault_isolation() {
        let base = make_temp_base("full_roundtrip");

        let save_body = json!({
            "characters": [
                {
                    "fileName": "Aria.json",
                    "payload": {
                        "spec": "chara_card_v2",
                        "data": {
                            "id": "char-1",
                            "name": "Aria"
                        }
                    }
                }
            ],
            "lorebooks": [
                {
                    "fileName": "Realm.json",
                    "payload": {
                        "id": "lb-1",
                        "name": "Realm"
                    }
                }
            ],
            "themes": [
                {
                    "fileName": "Obsidian.json",
                    "payload": { "id": "theme-1", "name": "Obsidian" }
                }
            ],
            "tags": [
                {
                    "fileName": "Cyberpunk.json",
                    "payload": { "id": "tag-1", "name": "Cyberpunk" }
                }
            ],
            "meta": {
                "schema": "tavernsmith_meta_v1",
                "activeThemeId": "theme-1"
            }
        });

        let saved = save_to_saves_directory_in_base(&base, &save_body).unwrap();
        assert!(saved.ok);
        assert_eq!(saved.characters.len(), 1);
        assert_eq!(saved.lorebooks.len(), 1);
        assert_eq!(saved.themes.len(), 1);
        assert_eq!(saved.tags.len(), 1);
        assert!(saved.meta.is_some());

        // Vault lives strictly outside Saves/
        let vault_initial = read_app_vault_state_in_base(&base).unwrap();
        assert!(vault_initial.ok);
        assert!(vault_initial.app_key.len() >= 32);
        assert!(vault_initial.vault.is_none());

        let vault_save = save_app_vault_state_in_base(
            &base,
            &json!({
                "vault": { "version": 2, "alg": "AES-256-GCM", "ciphertextBase64": "YWJj" }
            }),
        )
        .unwrap();
        assert!(vault_save.saved);
        assert!(base.base_dir.join(APP_VAULT_DIRNAME).join(APP_VAULT_FILENAME).exists());
        assert!(!base.base_dir.join("Saves").join(APP_VAULT_FILENAME).exists());

        // Delete character by ID and confirm traversal filename is rejected
        let after_del = delete_from_saves_directory_in_base(
            &base,
            &json!({ "folder": "Characters", "id": "char-1" }),
        )
        .unwrap();
        assert_eq!(after_del.characters.len(), 0);
        assert_eq!(after_del.lorebooks.len(), 1);

        let _ = fs::remove_dir_all(&base.base_dir);
    }
}
