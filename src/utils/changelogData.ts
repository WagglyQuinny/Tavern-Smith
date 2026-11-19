export interface ChangelogReleaseEntry {
  version: string;
  date: string;
  title: string;
  security?: string[];
  highlights: string[];
  fixes: string[];
  fileChanges: string[];
}

export const APP_VERSION = "4.7.0";

export const CHANGELOG_RELEASES: ChangelogReleaseEntry[] = [
  {
    "version": "Unreleased",
    "date": "Pending Release",
    "title": "Native 3-OS Desktop App (No CMD Window), Security Hardening, App-Private Vault, Live Models & Strict NSFW Mode",
    "security": [
      "Native Rust Desktop Storage & Zero-CORS AI HTTP Client: replaced background terminal servers in releases with a native Tauri v2 desktop app (zero CMD window), canonical symlink confinement, 0600/0700 vault key permissions, strict http/https URL validation, and a native Rust reqwest client that strips Origin headers to prevent Ollama/LAN CORS errors.",
      "Local-Only Server Binding & CSRF/DNS-Rebinding Protection: bound Express and Vite dev/preview servers strictly to 127.0.0.1 with Host, Origin, Sec-Fetch-Site, and JSON Content-Type validation plus static blocking for ./Saves/, ./.tavernsmith-app/, .env*, and server scripts.",
      "Separate App-Private AES-256-GCM API Key Vault (No PIN Required): moved encrypted provider keys outside ./Saves/ into ./.tavernsmith-app/ (or ~/Library/Application Support/TavernSmith/.tavernsmith-app/ on macOS) with automatic legacy vault migration.",
      "Fixed Single Saves Root & Symlink Confinement: locked disk storage to portable ./Saves/ next to the binary on Windows & Linux (with read-only App Data fallback) and ~/Library/Application Support/TavernSmith/Saves/ on macOS, with symlink confinement and .json-only deletes.",
      "SVG/XSS Media Hardening & Secret Export Scanner: blocked SVG/javascript: media URIs, moved Gemini keys to x-goog-api-key headers, and upgraded JsonInspector to flag real API key patterns before export.",
      "Strict NSFW Hiding Across UI & AI Context: Hide NSFW Content now completely shields NSFW characters, lorebooks, entries, themes, saved files, JSON views, and strips all NSFW context from AI generation requests."
    ],
    "highlights": [
      "Native 3-OS Desktop App & 3 Labeled Release Archives: every GitHub Release now ships TavernSmith-Windows-x64-Portable.zip (portable .exe, zero CMD window), TavernSmith-macOS-Universal-DMG.zip (Apple Silicon & Intel .dmg), and TavernSmith-Linux-x64-AppImage.zip (portable .AppImage).",
      "Native Save Dialogs & One-Click Open Saves Folder: PNG/JSON/backup exports use native OS Save As dialogs in desktop mode, and Options displays the active save path with a one-click Open Folder button.",
      "Live-Only AI Models & Local Loaded Status: removed all hardcoded/fake model lists; Ollama, LM Studio, and KoboldCPP distinguish Currently Loaded vs. Installed — Not Loaded models; added direct Anthropic support and fixed OpenRouter/Gemini routing.",
      "ID-Synced Character ↔ Lorebook Linking: linked lorebooks stay synced by ID, embed live updates into PNG/JSON character exports, inject into AI character generation context, and auto-import embedded character_book lorebooks.",
      "Global Tag Deletion & Targeted Reset Defaults: deleting a tag strips it from every character, lorebook, entry, and theme permanently; Reset Defaults restores only deleted/modified built-in Themes & Tags without touching custom items or saves.",
      "Strict Backup Import/Export Scope: workspace backup exports and imports strictly handle Characters, Lorebooks, Themes, and Tags — never settings, AI configs, or API keys.",
      "Smarter GitHub Release & Changelog Actions: upgraded version-update.yml to promote curated [Unreleased] entries, sync package.json + versionInfo.json + Tauri/Cargo manifests, parse commit bodies safely without shell interpolation or eval, and remove fake boilerplate."
    ],
    "fixes": [
      "Added dedicated per-operation AbortControllers, entity-switch aborts, unmount cleanup, and stream reader cancellation across editors and aiService.",
      "Eliminated duplicate avatar base64 inside extensions.tavernsmith, preserved non-PNG avatars, third-party extensions, and World Info position/priority, and fixed dollar-sign macro replacement and stat_block token double-counting.",
      "Disabled Tauri native drag-drop interception to preserve HTML5 drag-and-drop, hid the browser PWA install button in desktop mode, and fixed SmartEditor macro insertion, ghost-text token limits, scroll/placeholder sync, non-sticky manual NSFW toggle, Firefox DnD, PortraitCropperModal wheel zoom/cleanup, JsonInspector raw edits, TopBar save errors, and SidebarNav tab alias highlighting."
    ],
    "fileChanges": [
      "src-tauri/Cargo.toml — Added Tauri v2 Rust Crate Manifest & Native Dependencies",
      "src-tauri/tauri.conf.json — Added Tauri v2 Desktop App Configuration, CSP & Multi-OS Bundle Settings",
      "src-tauri/capabilities/default.json — Added Tauri v2 Core & Dialog Capabilities",
      "src-tauri/src/main.rs — Added Native Desktop Entrypoint (No-CMD Windows Subsystem)",
      "src-tauri/src/lib.rs — Added Native Tauri IPC Commands, Dialog Exporter & Rust HTTP Client",
      "src-tauri/src/storage.rs — Added Native Rust Local ./Saves/ & App-Private Vault Storage Engine with Unit Tests",
      "src-tauri/icons/ — Added Multi-Platform Application Icons (.ico, .icns, .png)",
      "src/utils/desktopBridge.ts — Added Native Tauri IPC & HTTP Fetch Bridge with Browser Dev Fallback",
      ".github/workflows/release.yml — Built Native 3-OS Desktop App Release Matrix (Windows, macOS, Linux)",
      ".github/workflows/version-update.yml — Upgraded Automated Changelog & Version Updater Workflow with Tauri Manifest Sync",
      ".gitignore — Ignored Local Saves/, .tavernsmith-app/, and src-tauri/target/ Directories",
      "server.ts — Hardened Local Express Server, Fixed ./Saves/ Disk API & App-Private Vault",
      "vite.config.ts — Hardened Vite Dev/Preview Middleware & Local Security Guards",
      "src/types.ts — Added Live Model Statuses, Vault State Response & Deleted Default Tracking Types",
      "src/utils/cryptoVault.ts — Rebuilt App-Private PIN-Free AES-256-GCM Vault with Desktop Bridge Support & Legacy Migration",
      "src/utils/cardIO.ts — Added Native Desktop Save Dialogs, Media URI Sanitization, SVG Rejection, Deduplicated PNG/JSON Exports & World Info Preservation",
      "src/utils/tokenCounter.ts — Fixed Dollar-Sign Macro Replacement & Stat Block Token Double-Counting",
      "src/services/aiService.ts — Routed Desktop HTTP Calls Through Native Rust Fetch, Removed Hardcoded Models, Added Loaded/Not-Loaded Local Detection, Direct Anthropic Support & SFW Filtering",
      "src/context/StoreContext.tsx — Routed Disk Persistence Through Desktop Bridge, Implemented Global Tag Yeeting, Targeted Reset Defaults, Strict Backup Scope, ID-Synced Lorebooks & Strict NSFW Helpers",
      "src/views/OptionsView.tsx — Added Desktop Open Folder Button, Active OS Save Path Display, Vault Status Card, Live Model Optgroups & Strict Backup UI",
      "src/components/PWAInstallButton.tsx — Hidden Browser PWA Install Prompt Inside Native Desktop App",
      "src/views/ThemesAndTagsView.tsx — Added Strict SFW Theme/Tag Hiding, AbortControllers & Restore Default Themes & Tags",
      "src/components/CharacterEditor.tsx — Added SFW Shield, Dedicated AbortControllers, Non-Sticky NSFW Flag & ID-Synced Lorebook Context/Export",
      "src/components/LorebookEditor.tsx — Added SFW Shield, ID-Synced Character Binding, Raw Keyword Drafts & Dedicated AbortControllers",
      "src/components/SmartEditor.tsx — Fixed Macro Insertion, Ghost-Text Tokens, Backdrop Sync, Unmount Aborts & SVG Rejection",
      "src/components/TagSelector.tsx — Enforced Strict SFW Tag Filtering & Creation Guards",
      "src/components/JsonInspector.tsx — Added SFW Shield, Real Secret Scanner, Resolved Lorebook Serialization & Safe Raw JSON Edits",
      "src/components/PortraitCropperModal.tsx — Added Non-Passive Wheel Zoom, Touch Guards & Guaranteed Canvas Cleanup",
      "src/components/ContextImagesBar.tsx — Blocked SVG Uploads, Capped Reference Images at 6 & Added Unmount Guard",
      "src/components/TopBar.tsx — Added SFW Theme Filtering, Unmount-Safe Save Timer & Accurate Save Error State",
      "src/components/SidebarNav.tsx — Fixed Tab Alias Highlighting & SFW Snapshot Shielding",
      "src/App.tsx — Updated Vault Path Hint & Tag Deletion Confirmation Copy"
    ]
  },
  {
    "version": "v4.7.0",
    "date": "2026-11-19",
    "title": "Automated release v4.7.0 incorporating 1 updated module(s).",
    "highlights": [
      "Automated release v4.7.0 incorporating 1 updated module(s)."
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "package.json & CHANGELOG.md — Version bump and release metadata sync"
    ]
  },
  {
    "version": "v4.6.0",
    "date": "2026-11-18",
    "title": "Implement deterministic tag sorting (d2cfa4f)",
    "highlights": [
      "Implement deterministic tag sorting (d2cfa4f)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+27 / -7 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+37 / -14 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+7 / -3 lines)",
      "src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+39 / -33 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1030 / -284 lines)",
      "src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+13 / -3 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+4 / -2 lines)",
      "src/utils/tagOrder.ts — Added Core Utility Module (+186 / -0 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+106 / -41 lines)"
    ]
  },
  {
    "version": "v4.5.1",
    "date": "2026-11-17",
    "title": "Enhance save path security and state management (2ad644a)",
    "highlights": [
      "Enhance save path security and state management (2ad644a)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+672 / -324 lines)",
      "server.ts — Updated Project Configuration & Metadata (+368 / -178 lines)",
      "src/App.tsx — Updated Project Configuration & Metadata (+30 / -12 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+0 / -3 lines)",
      "src/components/JsonInspector.tsx — Updated UI Workbench Component (+41 / -17 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+0 / -4 lines)",
      "src/components/PortraitCropperModal.tsx — Updated UI Workbench Component (+10 / -0 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+166 / -113 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+13 / -2 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+66 / -15 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+162 / -27 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+14 / -2 lines)",
      "vite.config.ts — Updated Project Configuration & Metadata (+400 / -192 lines)"
    ]
  },
  {
    "version": "v4.5.0",
    "date": "2026-11-17",
    "title": "Automated release v4.5.0 incorporating 10 updated module(s) (10 files changed, 2220 insertions(+), 600 deletions(-)).",
    "highlights": [
      "Automated release v4.5.0 incorporating 10 updated module(s) (10 files changed, 2220 insertions(+), 600 deletions(-))."
    ],
    "fixes": [
      "Improve server disk handling and view state (568a4cf)"
    ],
    "fileChanges": [
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+914 / -357 lines)",
      "server.ts — Updated Project Configuration & Metadata (+655 / -7 lines)",
      "src/App.tsx — Updated Project Configuration & Metadata (+25 / -7 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+83 / -62 lines)",
      "src/components/JsonInspector.tsx — Updated UI Workbench Component (+40 / -21 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+125 / -92 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+264 / -36 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+105 / -5 lines)",
      "src/utils/tokenCounter.ts — Updated Core Utility Module (+6 / -3 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+3 / -10 lines)"
    ]
  },
  {
    "version": "v4.4.1",
    "date": "2026-11-17",
    "title": "Add support for character reaction images (63241c9)",
    "highlights": [
      "Add support for character reaction images (63241c9)",
      "Add body type and skin trait tags (63d6333)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+694 / -3 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+455 / -0 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+18 / -0 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+141 / -0 lines)"
    ]
  },
  {
    "version": "v4.4.0",
    "date": "2026-11-17",
    "title": "Support persistent themes and tags (47ab82c)",
    "highlights": [
      "Support persistent themes and tags (47ab82c)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "server.ts — Updated Project Configuration & Metadata (+3 / -3 lines)",
      "src/App.tsx — Updated Project Configuration & Metadata (+20 / -6 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1670 / -489 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+9 / -5 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+195 / -3 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+30 / -89 lines)",
      "vite.config.ts — Updated Project Configuration & Metadata (+200 / -10 lines)"
    ]
  },
  {
    "version": "v4.3.0",
    "date": "2026-11-17",
    "title": "Add inlineDataList support to generate endpoint (a1c048b)",
    "highlights": [
      "Add inlineDataList support to generate endpoint (a1c048b)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "public/assets/aistudio/image_38f3372f.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "public/assets/aistudio/image_7f03481d.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "public/assets/aistudio/image_dffe1b4e.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "public/assets/aistudio/image_ec020d63.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "server.ts — Updated Project Configuration & Metadata (+41 / -20 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+891 / -441 lines)",
      "src/components/ContextImagesBar.tsx — Added UI Workbench Component (+222 / -0 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+138 / -190 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+138 / -301 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+19 / -5 lines)",
      "src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+78 / -40 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+12 / -2 lines)",
      "src/utils/tokenCounter.ts — Updated Core Utility Module (+170 / -34 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+3 / -0 lines)"
    ]
  },
  {
    "version": "v4.2.1",
    "date": "2026-11-17",
    "title": "Add support for importing save folder backups (851ffa5)",
    "highlights": [
      "Add support for importing save folder backups (851ffa5)",
      "Persist editor UI state in workspace draft (65b4ec0)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "public/assets/aistudio/image_6eabd08b.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "public/assets/aistudio/image_dad0a584.png — Added Project Configuration & Metadata (+0 / -0 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+58 / -17 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+70 / -29 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+84 / -28 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+843 / -42 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+66 / -0 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+48 / -2 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+336 / -317 lines)"
    ]
  },
  {
    "version": "v4.2.0",
    "date": "2026-11-13",
    "title": "Automated release v4.2.0 incorporating 3 updated module(s) (3 files changed, 518 insertions(+), 352 deletions(-)).",
    "highlights": [
      "Automated release v4.2.0 incorporating 3 updated module(s) (3 files changed, 518 insertions(+), 352 deletions(-))."
    ],
    "fixes": [
      "Improve disk save logic and state naming (b9bf6d2)"
    ],
    "fileChanges": [
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+106 / -75 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+375 / -193 lines)",
      "vite.config.ts — Updated Project Configuration & Metadata (+37 / -84 lines)"
    ]
  },
  {
    "version": "v4.1.0",
    "date": "2026-11-13",
    "title": "massive bug fixing, AI related integration",
    "highlights": [
      "massive bug fixing, AI related integration",
      "Update Gemini models and deprecation logic (a32c6f4)",
      "Implement centralized delete confirmation modal (56e63cb)",
      "Implement local filesystem persistence API (ab29254)"
    ],
    "fixes": [
      "Stop filtering legacy Gemini models (188c34f)",
      "Update Gemini models and cleanup character files (6240485)",
      "Simplify UI terminology and copy (45c89b7)"
    ],
    "fileChanges": [
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+615 / -36 lines)",
      "public/sw.js — Removed Project Configuration & Metadata (+0 / -14 lines)",
      "server.ts — Updated Project Configuration & Metadata (+109 / -30 lines)",
      "src/App.tsx — Updated Project Configuration & Metadata (+95 / -20 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+191 / -229 lines)",
      "src/components/JsonInspector.tsx — Updated UI Workbench Component (+30 / -30 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+246 / -296 lines)",
      "src/components/SidebarNav.tsx — Updated UI Workbench Component (+17 / -17 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+228 / -103 lines)",
      "src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+34 / -25 lines)",
      "src/components/TopBar.tsx — Updated UI Workbench Component (+10 / -10 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1501 / -1933 lines)",
      "src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+661 / -415 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+31 / -1 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+165 / -68 lines)",
      "src/utils/cryptoVault.ts — Updated Core Utility Module (+104 / -136 lines)",
      "src/utils/folderDb.ts — Removed IndexedDB & Native Directory Handle Persistence (+0 / -228 lines)",
      "src/utils/tokenCounter.ts — Updated Core Utility Module (+1 / -1 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+390 / -650 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+27 / -26 lines)",
      "vite.config.ts — Updated Project Configuration & Metadata (+596 / -2 lines)"
    ]
  },
  {
    "version": "v4.0.2",
    "date": "2026-11-13",
    "title": "Grand AI conections overhaul",
    "highlights": [
      "Grand AI conections overhaul"
    ],
    "fixes": [
      "Streamline AI connection manager UI (da37285)"
    ],
    "fileChanges": [
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+420 / -538 lines)"
    ]
  },
  {
    "version": "v4.0.1",
    "date": "2026-11-13",
    "title": "Reorganize And add tags",
    "highlights": [
      "Reorganize And add tags",
      "Reorganize and expand tag categories (1a787ab)",
      "Add multimodal vision support and API key auth (42a54bf)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "server.ts — Updated Project Configuration & Metadata (+78 / -15 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+294 / -33 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+215 / -34 lines)",
      "src/components/SidebarNav.tsx — Updated UI Workbench Component (+6 / -6 lines)",
      "src/components/SmartEditor.tsx — Updated Synchronized Macro & Ghost-Text SmartEditor (+384 / -5 lines)",
      "src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+6 / -2 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+505 / -41 lines)",
      "src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+512 / -56 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+6 / -0 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+78 / -0 lines)",
      "src/utils/cryptoVault.ts — Added Core Utility Module (+535 / -0 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+429 / -38 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+26 / -3 lines)",
      "vite.config.ts — Updated Project Configuration & Metadata (+22 / -1 lines)"
    ]
  },
  {
    "version": "v4.0.0",
    "date": "2026-11-13",
    "title": "Automated release v4.0.0 incorporating 1 updated module(s).",
    "highlights": [
      "Automated release v4.0.0 incorporating 1 updated module(s)."
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "package.json & CHANGELOG.md — Version bump and release metadata sync"
    ]
  },
  {
    "version": "v3.1.0",
    "date": "2026-11-13",
    "title": "Automated release v3.1.0 incorporating 1 updated module(s) (1 file changed, 5 insertions(+), 1 deletion(-)).",
    "highlights": [
      "Automated release v3.1.0 incorporating 1 updated module(s) (1 file changed, 5 insertions(+), 1 deletion(-))."
    ],
    "fixes": [
      "Disable HMR and file watching in dev server (ddda2ec)"
    ],
    "fileChanges": [
      "server.ts — Updated Project Configuration & Metadata (+5 / -1 lines)"
    ]
  },
  {
    "version": "v3.0.2",
    "date": "2026-11-12",
    "title": "Automated release v3.0.2 incorporating 1 updated module(s).",
    "highlights": [
      "Automated release v3.0.2 incorporating 1 updated module(s)."
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "package.json & CHANGELOG.md — Version bump and release metadata sync"
    ]
  }
];
