# Changelog

All notable changes to **TavernSmith** are documented in this file. This file is synced with the in-app **About & Changelog** modal (`src/utils/changelogData.ts`) and the automated GitHub Release workflows (`.github/workflows/version-update.yml` & `.github/workflows/release.yml`).

## [v3.0.2] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v3.0.2 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [v3.0.1] - 2026-11-12

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

## [v3.0.0] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v3.0.0 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [v2.2.1] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v2.2.1 incorporating 1 updated module(s).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility.

### 📂 Detailed Component & File Changes
- `package.json & CHANGELOG.md — Version bump and release metadata sync`

## [v2.2.0] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Remove PWA install button from top bar (96c5075)

### 🛠️ Bug Fixes, AI & Stability Improvements
- Rename standalone to portable in release build (82e2903)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 3 files changed, 68 insertions(+), 80 deletions(-)
- `.github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+12 / -11 lines)`
- `README.md — Updated Project Configuration & Metadata (+55 / -66 lines)`
- `src/components/TopBar.tsx — Updated UI Workbench Component (+1 / -3 lines)`

## [v2.1.1] - 2026-11-12

### 🚀 Highlights & Feature Additions
- Automated release v2.1.1 incorporating 1 updated module(s) (1 file changed, 16 insertions(+), 20 deletions(-)).

### 🛠️ Bug Fixes, AI & Stability Improvements
- Clean up version-update script logic (04ad2dc)

### 📂 Detailed Component & File Changes
- **Repository Diff Summary**: 1 file changed, 16 insertions(+), 20 deletions(-)
- `.github/workflows/version-update.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+16 / -20 lines)`

## [v2.1.0] - 2026-11-12

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

## [v2.0.0] - 2026-11-11

### Highlights
Lots of changes! improoved character handling, more included tags, NSFW tags, ETC.

### Commits & Changes
- feat(ui): redesign branding and enhance roster UX (f19ed18)

## [v1.0.3] - 2026-11-11

### Highlights
fixed storage

### Commits & Changes
- feat: unify save directory structure (f1467d9)

## [v1.0.2] - 2026-11-11

### Highlights
fixed release issues AGAIN

### Commits & Changes
- chore: upgrade CI actions and refine editor features (8211ba3)

## [v1.0.1] - 2026-11-11

### Highlights
fixed release issues

### Commits & Changes
- feat: implement PWA support and standalone launchers (bf364b2)
- feat: add toggleable main sidebar (e60633b)
- feat: initialize TavernSmith project structure (4a18f04)
- Initial commit (c1eb2ae)

## [v1.0.0] — Production Release

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
