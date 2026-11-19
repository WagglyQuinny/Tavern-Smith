# Changelog

All notable changes to **TavernSmith** are documented in this file. This file is synced with the in-app **About & Changelog** modal (`src/utils/changelogData.ts`) and the automated GitHub Release workflows (`.github/workflows/version-update.yml` & `.github/workflows/release.yml`).

## [v1.0.0] - 2026-11-19

### 🔐 Security & Privacy Hardening
- **Native Rust Desktop Storage & Zero-CORS AI HTTP Client**: Replaced background browser-launched terminal servers in release builds with a native Tauri v2 Rust desktop shell (`src-tauri/`) using `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` (zero CMD window), `fs::canonicalize` symlink confinement, `0600`/`0700` Unix vault key permissions, strict `http://`/`https://` scheme validation, and a native `reqwest` HTTP client (`http_fetch` / `desktopFetch`) that strips browser `Origin` headers to eliminate local Ollama/LM Studio/KoboldCPP/LAN CORS blocks.
- **Local-Only Server Binding & CSRF/DNS-Rebinding Protection**: Bound Express (`server.ts`) and Vite dev/preview (`vite.config.ts`) strictly to `127.0.0.1`, enforcing `Host`, `Origin`, `Sec-Fetch-Site`, and JSON `Content-Type` validation on all `/api/*` endpoints and blocking static HTTP access to `./Saves/`, `./.tavernsmith-app/`, `.env*`, `.git/`, and server scripts.
- **Separate App-Private AES-256-GCM API Key Vault (No PIN Required)**: Moved encrypted API keys out of `./Saves/` into `./.tavernsmith-app/credentials.vault.enc` (or `~/Library/Application Support/TavernSmith/.tavernsmith-app/` on macOS) with a separate `0600` local key (`vault.key`) via dedicated `get_app_vault`/`save_app_vault` IPC commands and `/api/vault` endpoints. Legacy `./Saves/_tavernsmith_vault.enc` files auto-migrate seamlessly. Added `Saves/`, `.tavernsmith-app/`, and `src-tauri/target/` to `.gitignore`.
- **Fixed Single Saves Root & Symlink Confinement**: Locked disk persistence to `./Saves/` (`Characters/`, `Lorebooks/`, `Themes/`, `Tags/`) next to the portable executable on Windows and Linux (`.AppImage` parent directory via `$APPIMAGE`, falling back to OS App Data only if unwritable), and `~/Library/Application Support/TavernSmith/Saves/` on macOS, with `realpath`/`canonicalize` symlink confinement and `.json`-only deletion guards.
- **SVG/XSS Media Hardening & Secret Export Scanner**: Blocked SVG uploads and `javascript:`/`data:image/svg+xml` URIs across portrait, reaction, and context image uploads (`sanitizeMediaUri`, `isAllowedRasterImageFile`); replaced Gemini `?key=` query params with `x-goog-api-key` headers; upgraded `JsonInspector` to detect real API key patterns (`sk-`, `AIza`, `gsk_`, `xai-`, `Bearer `, non-empty `apiKey`) as export errors.
- **Strict NSFW Hiding Across Entire UI & AI Context**: Enabling **Hide NSFW Content** now completely hides or shields NSFW characters (manual flag, NSFW tags, or linked NSFW lorebook), NSFW lorebooks/entries, NSFW-tagged themes, NSFW saved files, TopBar/Sidebar snapshots, and Raw JSON views — and strips all NSFW context before any AI prompt is constructed or sent.

### 🚀 Highlights & Feature Additions
- **Full v1.0.0 Graduation & Native 3-OS Desktop Release Archives**: Graduated TavernSmith out of beta (archiving legacy `v1.0.1`–`v4.7.0` history under `beta-v*` pre-releases) with a full Tauri v2 native desktop app and multi-OS GitHub Release workflow producing three clearly labeled `.zip` packages on every release:
  - `TavernSmith-Windows-x64-Portable.zip` — Portable `TavernSmith.exe` (no installer, zero CMD window, portable `./Saves/` next to the `.exe`).
  - `TavernSmith-macOS-Universal-DMG.zip` — Universal Apple Silicon & Intel `TavernSmith.dmg` (saves in `~/Library/Application Support/TavernSmith/Saves/`).
  - `TavernSmith-Linux-x64-AppImage.zip` — Portable `TavernSmith.AppImage` (portable `./Saves/` next to the `.AppImage`, with automatic XDG fallback if read-only).
- **Native Save Dialogs & One-Click Open Saves Folder**: Exports (`.png`, `.json`, backups) open the native OS Save As dialog in desktop mode; Options displays the resolved active save path and adds a one-click **Open Folder** button to reveal the Saves folder in Explorer, Finder, or the Linux file manager.
- **Live-Only AI Models + Local Loaded vs. Installed Detection**: Removed all hardcoded/fake model lists; every provider displays only models actively returned by its endpoint. Local servers (Ollama, LM Studio, KoboldCPP) now distinguish **Currently Loaded** (`🟢`) vs. **Installed — Not Loaded** (`⚪`) models. Added direct Anthropic Messages API support and fixed OpenRouter `/api/v1` and Gemini URL routing.
- **ID-Synced Character ↔ Lorebook Linking & AI Context**: Characters linked to a lorebook stay synced by lorebook ID, automatically embed the latest linked lorebook on `.png` and `.json` exports, inject linked lorebook entries into AI generation context (respecting NSFW hiding), and import embedded `character_book` lorebooks directly into the Lorebooks area.
- **Global Tag Deletion ("Yeet") & Targeted Reset Defaults**: Deleting a tag permanently strips it from every character, lorebook, entry, and theme without resurrecting on reload (persisting `deletedDefaultTagIds` / `deletedDefaultThemeIds`). **Reset Defaults** restores only deleted or modified built-in Themes and Tags while leaving custom items, characters, lorebooks, settings, and API keys untouched.
- **Strict Backup Import/Export Scope**: Workspace backup export and import strictly include Characters, Lorebooks, Themes, and Tags — never settings, active theme selection, AI configuration, or API key vault data.
- **Node 24 CI/CD & Safe Release Publishing**: Upgraded `.github/workflows/release.yml` to Node 24-native `actions/upload-artifact@v7` and `actions/download-artifact@v8` (zero deprecation warnings) and gated GitHub Release publishing strictly to `v*.*.*` tags or manual dispatch so routine `main` pushes run full 3-OS CI builds without overwriting existing releases; upgraded `.github/workflows/version-update.yml` to track stable `v[0-9]*` tags, promote curated `## [Unreleased]` notes, sync semantic versions across `package.json`, `src/versionInfo.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, parse structured git commit bodies safely without shell interpolation or `eval`, and refreshed `README.md`.

### 🛠️ Bug Fixes, Memory & Stability
- **Fixed Stale AI Callbacks, Uncancelled Streams & Abort Leaks**: Added dedicated per-operation `AbortController` refs, entity-switch aborts, unmount cleanup, and `finally` stream reader cancellation across `CharacterEditor`, `LorebookEditor`, `SmartEditor`, `ThemesAndTagsView`, and `aiService`.
- **Fixed Card I/O & Token Accounting Bugs**: Eliminated duplicate avatar base64 embedding inside `extensions.tavernsmith` (reducing PNG/JSON export bloat), preserved non-PNG avatars and third-party `extensions`, preserved World Info `position` and `priority`, fixed `$` replacement corruption in `renderInitialStatBlockInstance`, and fixed double-counting of `stat_block` tokens.
- **Fixed Editor, Drag-and-Drop & Canvas Issues**: Fixed `SmartEditor` `insertMacro` selection replacement, ghost-text `maxTokens` inflation, and backdrop scroll/placeholder alignment; disabled Tauri native file-drop interception (`dragDropEnabled: false`) to preserve HTML5 drag-and-drop; fixed non-sticky manual `isNsfw` flag; fixed Firefox drag-and-drop (`dataTransfer.setData`), inner dropzone `stopPropagation`, and Wizard Step 3 keyword typing; upgraded `PortraitCropperModal` to non-passive wheel zoom with guaranteed canvas cleanup; fixed `JsonInspector` raw JSON edits not to overwrite standalone lorebooks; fixed `TopBar` save error reporting and `SidebarNav` legacy tab alias highlighting; hid browser PWA install button inside the native desktop app.

### 📂 Component & File Changes
- `src-tauri/Cargo.toml — Added Tauri v2 Rust Crate Manifest & Native Dependencies (reqwest, dialog, getrandom, chrono)`
- `src-tauri/tauri.conf.json — Added Tauri v2 Desktop App Configuration, CSP & Multi-OS Bundle Settings`
- `src-tauri/capabilities/default.json — Added Tauri v2 Core & Dialog Capabilities`
- `src-tauri/src/main.rs — Added Native Desktop Entrypoint with No-CMD Windows Subsystem`
- `src-tauri/src/lib.rs — Added Native Tauri IPC Commands, Dialog Exporter & Zero-CORS Rust HTTP Client`
- `src-tauri/src/storage.rs — Added Native Rust Local ./Saves/ & App-Private Vault Storage Engine with Unit Tests`
- `src-tauri/icons/ — Added Multi-Platform Application Icons (.ico, .icns, .png)`
- `src/utils/desktopBridge.ts — Added Native Tauri IPC & HTTP Fetch Bridge with Browser Dev Fallback`
- `.github/workflows/release.yml — Built Node 24 Native 3-OS Desktop App Release Matrix with Tag-Only Release Publishing`
- `.github/workflows/version-update.yml — Upgraded Automated Changelog & Version Updater Workflow with Stable v* Tag Tracking & Tauri Manifest Sync`
- `README.md — Updated Documentation for v1.0.0 Native 3-OS Downloads, Vault, and Strict NSFW Mode`
- `.gitignore — Ignored Local Saves/, .tavernsmith-app/, and src-tauri/target/ Directories`
- `server.ts — Hardened Local Express Server, Fixed ./Saves/ Disk API & App-Private Vault`
- `vite.config.ts — Hardened Vite Dev/Preview Middleware & Local Security Guards`
- `src/types.ts — Added Live Model Statuses, Vault State Response & Deleted Default Tracking Types`
- `src/utils/cryptoVault.ts — Rebuilt App-Private PIN-Free AES-256-GCM Vault with Desktop Bridge Support & Legacy Migration`
- `src/utils/cardIO.ts — Added Native Desktop Save Dialogs, Media URI Sanitization, SVG Rejection, Deduplicated PNG/JSON Exports & World Info Preservation`
- `src/utils/tokenCounter.ts — Fixed Dollar-Sign Macro Replacement & Stat Block Token Double-Counting`
- `src/services/aiService.ts — Routed Desktop HTTP Calls Through Native Rust Fetch, Removed Hardcoded Models, Added Loaded/Not-Loaded Local Detection, Direct Anthropic Support & SFW Filtering`
- `src/context/StoreContext.tsx — Routed Disk Persistence Through Desktop Bridge, Implemented Global Tag Yeeting, Targeted Reset Defaults, Strict Backup Scope, ID-Synced Lorebooks & Strict NSFW Helpers`
- `src/views/OptionsView.tsx — Added Desktop Open Folder Button, Active OS Save Path Display, Vault Status Card, Live Model Optgroups & Strict Backup UI`
- `src/components/PWAInstallButton.tsx — Hidden Browser PWA Install Prompt Inside Native Desktop App`
- `src/views/ThemesAndTagsView.tsx — Added Strict SFW Theme/Tag Hiding, AbortControllers & Restore Default Themes & Tags`
- `src/components/CharacterEditor.tsx — Added SFW Shield, Dedicated AbortControllers, Non-Sticky NSFW Flag & ID-Synced Lorebook Context/Export`
- `src/components/LorebookEditor.tsx — Added SFW Shield, ID-Synced Character Binding, Raw Keyword Drafts & Dedicated AbortControllers`
- `src/components/SmartEditor.tsx — Fixed Macro Insertion, Ghost-Text Tokens, Backdrop Sync, Unmount Aborts & SVG Rejection`
- `src/components/TagSelector.tsx — Enforced Strict SFW Tag Filtering & Creation Guards`
- `src/components/JsonInspector.tsx — Added SFW Shield, Real Secret Scanner, Resolved Lorebook Serialization & Safe Raw JSON Edits`
- `src/components/PortraitCropperModal.tsx — Added Non-Passive Wheel Zoom, Touch Guards & Guaranteed Canvas Cleanup`
- `src/components/ContextImagesBar.tsx — Blocked SVG Uploads, Capped Reference Images at 6 & Added Unmount Guard`
- `src/components/TopBar.tsx — Added SFW Theme Filtering, Unmount-Safe Save Timer & Accurate Save Error State`
- `src/components/SidebarNav.tsx — Fixed Tab Alias Highlighting & SFW Snapshot Shielding`
- `src/App.tsx — Updated Vault Path Hint & Tag Deletion Confirmation Copy`

## [beta-v4.7.0] - 2026-11-19

### 🚀 Highlights & Feature Additions
- Automated release v4.7.0 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [beta-v4.6.0] - 2026-11-18

### 🚀 Highlights & Feature Additions
- Implement deterministic tag sorting (d2cfa4f)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 9 files changed, 1449 insertions(+), 387 deletions(-)
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+27 / -7 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+37 / -14 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+7 / -3 lines)`
- `src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+39 / -33 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1030 / -284 lines)`
- `src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+13 / -3 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+4 / -2 lines)`
- `src/utils/tagOrder.ts — Added Core Utility Module (+186 / -0 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+106 / -41 lines)`

## [beta-v4.5.1] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Enhance save path security and state management (2ad644a)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 13 files changed, 1942 insertions(+), 889 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+672 / -324 lines)`
- `server.ts — Updated Project Configuration & Metadata (+368 / -178 lines)`
- `src/App.tsx — Updated Project Configuration & Metadata (+30 / -12 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+0 / -3 lines)`
- `src/components/JsonInspector.tsx — Updated UI Workbench Component (+41 / -17 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+0 / -4 lines)`
- `src/components/PortraitCropperModal.tsx — Updated UI Workbench Component (+10 / -0 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+166 / -113 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+13 / -2 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+66 / -15 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+162 / -27 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+14 / -2 lines)`
- `vite.config.ts — Updated Project Configuration & Metadata (+400 / -192 lines)`

## [beta-v4.5.0] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Automated release v4.5.0 incorporating 10 updated module(s) (10 files changed, 2220 insertions(+), 600 deletions(-)).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Improve server disk handling and view state (568a4cf)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 10 files changed, 2220 insertions(+), 600 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+914 / -357 lines)`
- `server.ts — Updated Project Configuration & Metadata (+655 / -7 lines)`
- `src/App.tsx — Updated Project Configuration & Metadata (+25 / -7 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+83 / -62 lines)`
- `src/components/JsonInspector.tsx — Updated UI Workbench Component (+40 / -21 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+125 / -92 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+264 / -36 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+105 / -5 lines)`
- `src/utils/tokenCounter.ts — Updated Core Utility Module (+6 / -3 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+3 / -10 lines)`

## [beta-v4.4.1] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Add support for character reaction images (63241c9)
- Add body type and skin trait tags (63d6333)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 4 files changed, 1308 insertions(+), 3 deletions(-)
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+694 / -3 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+455 / -0 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+18 / -0 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+141 / -0 lines)`

## [beta-v4.4.0] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Support persistent themes and tags (47ab82c)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 7 files changed, 2127 insertions(+), 605 deletions(-)
- `server.ts — Updated Project Configuration & Metadata (+3 / -3 lines)`
- `src/App.tsx — Updated Project Configuration & Metadata (+20 / -6 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1670 / -489 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+9 / -5 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+195 / -3 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+30 / -89 lines)`
- `vite.config.ts — Updated Project Configuration & Metadata (+200 / -10 lines)`

## [beta-v4.3.0] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Add inlineDataList support to generate endpoint (a1c048b)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 14 files changed, 1712 insertions(+), 1033 deletions(-)
- `public/assets/aistudio/image_38f3372f.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `public/assets/aistudio/image_7f03481d.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `public/assets/aistudio/image_dffe1b4e.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `public/assets/aistudio/image_ec020d63.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `server.ts — Updated Project Configuration & Metadata (+41 / -20 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+891 / -441 lines)`
- `src/components/ContextImagesBar.tsx — Added UI Workbench Component (+222 / -0 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+138 / -190 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+138 / -301 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+19 / -5 lines)`
- `src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+78 / -40 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+12 / -2 lines)`
- `src/utils/tokenCounter.ts — Updated Core Utility Module (+170 / -34 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+3 / -0 lines)`

## [beta-v4.2.1] - 2026-11-17

### 🚀 Highlights & Feature Additions
- Add support for importing save folder backups (851ffa5)
- Persist editor UI state in workspace draft (65b4ec0)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 9 files changed, 1505 insertions(+), 435 deletions(-)
- `public/assets/aistudio/image_6eabd08b.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `public/assets/aistudio/image_dad0a584.png — Added Project Configuration & Metadata (+0 / -0 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+58 / -17 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+70 / -29 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+84 / -28 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+843 / -42 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+66 / -0 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+48 / -2 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+336 / -317 lines)`

## [beta-v4.2.0] - 2026-11-13

### 🚀 Highlights & Feature Additions
- Automated release v4.2.0 incorporating 3 updated module(s) (3 files changed, 518 insertions(+), 352 deletions(-)).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Improve disk save logic and state naming (b9bf6d2)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 3 files changed, 518 insertions(+), 352 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+106 / -75 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+375 / -193 lines)`
- `vite.config.ts — Updated Project Configuration & Metadata (+37 / -84 lines)`

## [beta-v4.1.0] - 2026-11-13

### 🚀 Highlights & Feature Additions
- massive bug fixing, AI related integration
- Update Gemini models and deprecation logic (a32c6f4)
- Implement centralized delete confirmation modal (56e63cb)
- Implement local filesystem persistence API (ab29254)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Stop filtering legacy Gemini models (188c34f)
- Update Gemini models and cleanup character files (6240485)
- Simplify UI terminology and copy (45c89b7)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 21 files changed, 5051 insertions(+), 4270 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+615 / -36 lines)`
- `public/sw.js — Removed Project Configuration & Metadata (+0 / -14 lines)`
- `server.ts — Updated Project Configuration & Metadata (+109 / -30 lines)`
- `src/App.tsx — Updated Project Configuration & Metadata (+95 / -20 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+191 / -229 lines)`
- `src/components/JsonInspector.tsx — Updated UI Workbench Component (+30 / -30 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+246 / -296 lines)`
- `src/components/SidebarNav.tsx — Updated UI Workbench Component (+17 / -17 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+228 / -103 lines)`
- `src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+34 / -25 lines)`
- `src/components/TopBar.tsx — Updated UI Workbench Component (+10 / -10 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1501 / -1933 lines)`
- `src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+661 / -415 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+31 / -1 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+165 / -68 lines)`
- `src/utils/cryptoVault.ts — Updated Core Utility Module (+104 / -136 lines)`
- `src/utils/folderDb.ts — Removed IndexedDB & Native Directory Handle Persistence (+0 / -228 lines)`
- `src/utils/tokenCounter.ts — Updated Core Utility Module (+1 / -1 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+390 / -650 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+27 / -26 lines)`
- `vite.config.ts — Updated Project Configuration & Metadata (+596 / -2 lines)`

## [beta-v4.0.2] - 2026-11-13

### 🚀 Highlights & Feature Additions
- Grand AI conections overhaul

### 🛠️ Bug Fixes, AI & Stability Improvements
- Streamline AI connection manager UI (da37285)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 1 file changed, 420 insertions(+), 538 deletions(-)
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+420 / -538 lines)`

## [beta-v4.0.1] - 2026-11-13

### 🚀 Highlights & Feature Additions
- Reorganize And add tags
- Reorganize and expand tag categories (1a787ab)
- Add multimodal vision support and API key auth (42a54bf)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 14 files changed, 3096 insertions(+), 234 deletions(-)
- `server.ts — Updated Project Configuration & Metadata (+78 / -15 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+294 / -33 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+215 / -34 lines)`
- `src/components/SidebarNav.tsx — Updated UI Workbench Component (+6 / -6 lines)`
- `src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+384 / -5 lines)`
- `src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+6 / -2 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+505 / -41 lines)`
- `src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+512 / -56 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+6 / -0 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+78 / -0 lines)`
- `src/utils/cryptoVault.ts — Added Core Utility Module (+535 / -0 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+429 / -38 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+26 / -3 lines)`
- `vite.config.ts — Updated Project Configuration & Metadata (+22 / -1 lines)`

## [beta-v4.0.0] - 2026-11-13

### 🚀 Highlights & Feature Additions
- Automated release v4.0.0 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [beta-v3.1.0] - 2026-11-13

### 🚀 Highlights & Feature Additions
- Automated release v3.1.0 incorporating 1 updated module(s) (1 file changed, 5 insertions(+), 1 deletion(-)).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Disable HMR and file watching in dev server (ddda2ec)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 1 file changed, 5 insertions(+), 1 deletion(-)
- `server.ts — Updated Project Configuration & Metadata (+5 / -1 lines)`

## [beta-v3.0.2] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v3.0.2 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [beta-v3.0.1] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Migrate to custom Express dev server (5cbe882)
- Create FUNDING.yml (cd9ca7a)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 20 files changed, 4955 insertions(+), 2749 deletions(-)
- `.github/FUNDING.yml — Added Project Configuration & Metadata (+15 / -0 lines)`
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+11 / -10 lines)`
- `bun.lock — Added Project Configuration & Metadata (+570 / -0 lines)`
- `index.html — Updated Project Configuration & Metadata (+3 / -0 lines)`
- `package.json — Updated Project Configuration & Metadata (+7 / -6 lines)`
- `public/sw.js — Updated Project Configuration & Metadata (+7 / -66 lines)`
- `server.ts — Added Project Configuration & Metadata (+285 / -0 lines)`
- `src/App.tsx — Updated Project Configuration & Metadata (+186 / -7 lines)`
- `src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+73 / -4 lines)`
- `src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+70 / -5 lines)`
- `src/components/SidebarNav.tsx — Updated UI Workbench Component (+259 / -117 lines)`
- `src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+335 / -566 lines)`
- `src/components/TopBar.tsx — Updated UI Workbench Component (+126 / -300 lines)`
- `src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1393 / -352 lines)`
- `src/main.tsx — Updated Project Configuration & Metadata (+5 / -21 lines)`
- `src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+221 / -111 lines)`
- `src/types.ts — Updated Project Configuration & Metadata (+148 / -144 lines)`
- `src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+30 / -1 lines)`
- `src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+101 / -31 lines)`
- `src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+1110 / -1008 lines)`

## [beta-v3.0.0] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v3.0.0 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [beta-v2.2.1] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v2.2.1 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [beta-v2.2.0] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Remove PWA install button from top bar (96c5075)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Rename standalone to portable in release build (82e2903)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 3 files changed, 68 insertions(+), 80 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+12 / -11 lines)`
- `README.md — Updated Project Configuration & Metadata (+55 / -66 lines)`
- `src/components/TopBar.tsx — Updated UI Workbench Component (+1 / -3 lines)`

## [beta-v2.1.1] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v2.1.1 incorporating 1 updated module(s) (1 file changed, 16 insertions(+), 20 deletions(-)).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Clean up version-update script logic (04ad2dc)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 1 file changed, 16 insertions(+), 20 deletions(-)
- `.github/workflows/version-update.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+16 / -20 lines)`

## [beta-v2.1.0] - 2026-11-12

### 🚀 Highlights & Feature Additions
- **Persistent AI API Keys & Models Per Provider**: Added a persistent credential vault (`savedProviderKeys` and `savedProviderModels`) keyed by canonical provider ID (`google`, `xai`, `openrouter`, `groq`, `meta`, `openai`, `anthropic`, `lmstudio`, `ollama`, `kobold`, `custom`). Switching between AI backend presets now automatically restores that provider's saved API key and last-used model so you never have to retype keys.
- **Model-Based Auto-Formatting (`aiService.ts`)**: Refactored compatibility and thinking format detection to inspect the selected **Model Name / ID** (`config.modelName.toLowerCase()`) regardless of which endpoint hosts it (`gemma` -> `Gemma (System-Merged & Reasoning)`, `deepseek`/`qwen`/`qwq`/`r1` -> `DeepSeek / Qwen (<think>)`, `llama` -> `Llama 3 / 4`, `mistral`/`mixtral`/`pixtral` -> `Mistral`, `grok` -> `xAI Grok`, `gemini` -> `Google Gemini`, `claude` -> `Anthropic Claude`).
- **Hierarchical Sub-Tags & "🔞 Hide NSFW Tags" UI Toggle**: Added `isNsfw` flags and `subTags` support across the tag system with pre-seeded sub-tags (`Big Breasts` -> `Huge / Hyper`, `Perky`, `Natural Sag`, `Cleavage Window`; `Bondage / Restraints` -> `Shibari Rope`, `Cuffs & Chains`, `Spreader Bar`, `Blindfold & Gag`; `Excessive Fluids / Hyper Messy` -> `Overflowing`, `Messy Sheets`, `Saliva Strings`, etc.). Added a prominent **"🔞 Hide NSFW Tags"** toggle in the Character, Lorebook, and Tag Manager views that hides adult tags visually while keeping 100% of attached NSFW tags and sub-tags active in AI generation prompts.
- **In-Depth Automated GitHub Version & Changelog Generator**: Upgraded `.github/workflows/version-update.yml` to automatically analyze `git log`, `git diff --name-status`, and `git diff --numstat` since the previous tag, generating structured release sections into `CHANGELOG.md`, `src/versionInfo.json`, and `src/utils/changelogData.ts`.

### 🛠️ Bug Fixes, AI & Stability Improvements
- **Fixed LM Studio + Gemma 4 `400 Bad Request` Errors**: When running Gemma models (`gemma-4`, `gemma-3`, `gemma-2`) or when a local server returns HTTP 400/422, TavernSmith now automatically merges the `system` prompt into the `user` message (`[SYSTEM INSTRUCTIONS]\n...\n\n[USER REQUEST]\n...`), sends only universally supported fields (`model`, `messages`, `temperature`, `max_tokens`), and strips both `<think>...</think>` and Gemma 4's `<|thought|>...<|/thought|>` / `<thought>...</thought>` tags.
- **Fixed White Screen on Normal Launch & Removed Admin Requirement**: Wrapped all startup `IndexedDB` (`folderDb.ts`), `localStorage`, and `FileSystemDirectoryHandle` initialization in strict `try/catch` blocks, and added a top-level React Error Boundary (`AppErrorBoundary` in `App.tsx`) with a 1-click "Safe Recovery / Reset View".
- **Non-Admin Standalone Windows Launcher & Direct `file://` Support**: Updated `Launch-TavernSmith-Windows.bat` in `.github/workflows/release.yml` to start with `cd /d "%~dp0"`, run strictly as a standard non-admin user via `python -m http.server 4173 --bind 127.0.0.1`, `npx --yes serve -l tcp://127.0.0.1:4173`, or Edge/Chrome `--app` mode with `--allow-file-access-from-files`, and stripped `crossorigin` attributes from `dist/index.html`.

### 📂 Detailed Component & File Changes
- `src/services/aiService.ts` — Model-ID auto-detection, Gemma system-merged prompt formatting, HTTP 400 retry fallback, `<|thought|>` tag stripping, and full NSFW tag + sub-tag AI context preservation.
- `src/context/StoreContext.tsx` — Per-provider API key/model persistence, safe `localStorage` wrappers, `isNsfw` markings, and seeded `subTags`.
- `src/components/TagSelector.tsx` & `src/views/ThemesAndTagsView.tsx` — Sub-tag selector drawers, custom sub-tag creation, `NSFW Tag` checkbox, and `🔞 Hide NSFW Tags` toggle button.
- `src/App.tsx`, `src/main.tsx` & `src/utils/folderDb.ts` — Top-level Error Boundary and defensive `try/catch` startup guards.
- `src/views/OptionsView.tsx` & `src/utils/changelogData.ts` — Per-provider key badge indicators and synced multi-version About & Changelog modal.
- `.github/workflows/release.yml` & `.github/workflows/version-update.yml` — Non-admin standalone launcher, `crossorigin` stripping, and automated git repository changelog analyzer.

## [beta-v2.0.0] - 2026-11-11

### Highlights
Lots of changes! improoved character handling, more included tags, NSFW tags, ETC.

### Commits & Changes
- feat(ui): redesign branding and enhance roster UX (f19ed18)

## [beta-v1.0.3] - 2026-11-11

### Highlights
fixed storage

### Commits & Changes
- feat: unify save directory structure (f1467d9)

## [beta-v1.0.2] - 2026-11-11

### Highlights
fixed release issues AGAIN

### Commits & Changes
- chore: upgrade CI actions and refine editor features (8211ba3)

## [beta-v1.0.1] - 2026-11-11

### Highlights
fixed release issues

### Commits & Changes
- feat: implement PWA support and standalone launchers (bf364b2)
- feat: add toggleable main sidebar (e60633b)
- feat: initialize TavernSmith project structure (4a18f04)
- Initial commit (c1eb2ae)

## [beta-v1.0.0] — Production Release

### Added
- **Interactive SillyTavern `2:3` Portrait Uploader & Cropper Modal**:
  - Added character portrait slot in the Character Identity panel and miniature `2:3` portrait thumbnails in the Character Roster.
  - Added automatic `2:3` aspect-ratio detection (`400×600` / `512×768`) when uploading or dropping images, launching an interactive HTML5 `<canvas>` pan-and-zoom cropper modal that exports clean PNG DataURLs directly into exported `.png` character cards.
- **Full Drag-and-Drop File Import & Item Reordering**:
  - Drag and drop `.png` Character Cards, `.json` Character/Lorebook files, or portrait images directly onto the Character View, Lorebook View, or Roster sidebars.
  - Drag-and-drop reordering for **Lorebook Entries**, **Modular DM/GM Stat-Block attributes**, and **Alternate Greetings**.
- **Pure-Browser PNG Steganography & JSON I/O (`src/utils/cardIO.ts`)**:
  - Reads and writes SillyTavern V2 (`chara`) and V3 (`ccv3`) PNG `tEXt` chunks with IEEE 802.3 CRC32 checksum calculation and defensive buffer bounds validation.
- **Synchronized `<SmartEditor />` (`src/components/SmartEditor.tsx`)**:
  - Zero-dependency pixel-aligned backdrop highlighter for SillyTavern `{{macros}}`, instant `{{` autocomplete menu, per-field AI Assist toolbar, and debounced inline AI Ghost Text.
- **Full-Width Modular DM / GM Stat-Block Builder**:
  - Expandable 2-column RPG/status tracker with per-stat `✨ AI Assist Rule` generation, live Markdown preview, and 1-Click Compiler to `post_history_instructions` and `first_mes`.
- **5-Step Character & Lorebook Creation Wizards**:
  - Guided 5-step workflows for both Characters and Lorebooks, including 1-Click Concept-to-Character generation, AI Multi-Entry Lorebook generation, AI Trigger Key suggestion, and 1-Click Character binding.
- **Multi-Provider AI Scanner & Reasoning Stripper (`src/services/aiService.ts`)**:
  - Presets for LM Studio, Ollama, KoboldCPP, Google Gemini, xAI Grok, Meta Llama 4 (OpenRouter, Groq, Meta Direct), and custom OpenAI-compatible APIs.
  - Added `⚡ Connect & Test` diagnostic probe and automatic stripping of `<think>`, `<thought>`, and `<reasoning>` blocks into a collapsible Reasoning drawer.
- **Storage & Save Folder Manager (`src/views/OptionsView.tsx`)**:
  - Local PC directory integration (`window.showDirectoryPicker`) + In-App Save Folder selector, unified manual/auto-save target, and 1-click folder backup bundle export.
