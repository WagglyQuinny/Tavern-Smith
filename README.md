# TavernSmith — SillyTavern V2 & V3 Character & Lorebook IDE

**TavernSmith** (`v1.0.0`) is a modular, browser-native Character Card (`chara_card_v2` & `chara_card_v3`) and World Info (Lorebook) IDE with local and cloud AI integration. Built with React, TypeScript, Tailwind CSS, and pure browser binary APIs—running natively across **Windows, macOS (Intel x64 & Apple Silicon ARM), Linux, iOS/iPadOS, and Android** with zero CPU architecture lock-in.

---

## Key Features

### 1. SillyTavern V2 & V3 PNG Steganography & JSON I/O
- **Pure-Browser PNG Chunk Engine**: Reads and writes PNG `tEXt` chunks (`chara` for V2 and `ccv3` for V3) using `ArrayBuffer`, `DataView`, `Uint8Array`, and an IEEE 802.3 CRC32 lookup table—no Node.js `Buffer` or server dependencies required.
- **Drag-and-Drop Import**: Drop `.png` Character Cards, `.json` Character/Lorebook files, or portrait images directly onto the Character or Lorebook workbenches.
- **Zero-Credential Export Guarantee**: Exported `.png` and `.json` files strictly serialize SillyTavern specification fields and never include API keys or endpoint tokens.

### 2. Interactive `2:3` SillyTavern Portrait Cropper
- **Automatic Aspect-Ratio Verification**: Checks uploaded or dropped character portraits against SillyTavern's standard `2:3` vertical aspect ratio (`Math.abs(width / height - 2 / 3) <= 0.02`).
- **HTML5 `<canvas>` Cropper Modal**: Click-and-drag pan, mouse-wheel & slider zoom (`1.0x`–`4.0x`), rule-of-thirds composition guides, and target resolution selection (`512×768 px` HD Portrait or `400×600 px` Classic ST Portrait).

### 3. Synchronized `<SmartEditor />` with Macro Highlighting & AI Ghost Text
- **Zero-Dependency Backdrop Overlay**: Highlights SillyTavern macros (`{{char}}`, `{{user}}`, `{{random:...}}`, `{{roll:...}}`, `{{time}}`, `{{date}}`, `{{weekday}}`, `{{idle_duration}}`) in real time.
- **Instant Macro Autocomplete**: Typing `{{` opens a keyboard-navigable macro picker (`Up`/`Down`, `Enter`/`Tab`, `Esc`) with zero network latency.
- **Inline AI Ghost Text**: Debounced, context-aware inline completion (`Tab` to accept, `Esc` to dismiss) backed by automatic `AbortController` cleanup.
- **Per-Field AI Toolbar**: 1-click **Generate**, **Expand**, **Rewrite**, and **Polish Prose** actions with an inspectable Reasoning Drawer for `<think>` models.

### 4. Full-Width Modular DM / GM Stat-Block Builder
- **Custom RPG & Relationship Telemetry**: Configure `bar` (`[████░░]`), `number`, `text`, and `list` attributes with drag-and-drop reordering.
- **Per-Stat `✨ AI Assist Rule`**: Generates concise, turn-by-turn progression rules tailored to your character's persona and scenario.
- **1-Click Card Compiler**: Compiles tracking instructions into `post_history_instructions` (UJB) and injects the rendered starting block into `first_mes`.

### 5. Dual-Mode Character & Lorebook Workbenches (Full Sandbox + 5-Step Wizards)
- **Character Workbench**: Full Sandbox and 5-Step Guided Wizard with a 1-Click Concept-to-Character generator and draggable Alternate Greetings carousel.
- **Lorebook Workbench**: Full Sandbox and 5-Step Guided Wizard with a Multi-Entry World Generator, per-entry `✨ AI Assist Draft`, `✨ AI Suggest Trigger Keys`, token budget sliders, and 1-Click Character Binding.

### 6. Dual-Layer Theme System
- **Appearance Mode**: True Obsidian Dark Mode (`#09090b`) and Alabaster Light Mode (`#f4f4f5`).
- **Context Themes & Global Tag Library**: Front-and-center in the top bar. Each Context Theme defines both a global AI system prompt directive and a dynamic `--theme-accent` hex color that styles active workspace borders, focus rings, and highlights.

### 7. Multi-Provider AI Connections & Storage Manager
- **One-Click Provider Presets**: LM Studio, Ollama, KoboldCPP, Google Gemini, xAI Grok, Meta Llama 4 (OpenRouter, Groq, Meta Direct), and custom OpenAI-compatible endpoints.
- **Live Model Scanner & `⚡ Connect & Test`**: Queries `/v1/models`, `/api/tags`, or `/v1beta/models` and auto-detects `<think>` / reasoning formats.
- **Storage & Save Folder Manager**: Supports native local directory access (`window.showDirectoryPicker`) alongside an In-App Save Folder Manager and 1-Click Backup Bundle export.

---

## Standalone Cross-Platform Execution & PWA Support

TavernSmith builds with relative asset paths (`base: './'` in `vite.config.ts`) and ships with a full Web App Manifest (`public/manifest.json`), Service Worker (`public/sw.js`), and desktop launchers:

1. **Windows (x64 / ARM64)**: Run `Launch-TavernSmith-Windows.bat` inside `TavernSmith-Standalone-Universal.zip` or click **Install App** in Edge/Chrome.
2. **macOS (Intel x64 & Apple Silicon M1/M2/M3/M4) & Linux**: Run `./Launch-TavernSmith-Mac-Linux.command` or click **Install App** / **Add to Dock**.
3. **iOS / iPadOS & Android**: Open in Safari or Chrome and use **Add to Home Screen** / **Install App** for a full-screen standalone experience.

---

## Automated GitHub Actions Workflows

1. **Version & Changelog Updater (`.github/workflows/version-update.yml`)**:
   - Trigger manually from the **Actions** tab (`workflow_dispatch`) by choosing `patch`, `minor`, or `major` and optional `release_notes`.
   - Bumps `package.json`, collects all commits since the previous tag, prepends a dated `## [vX.Y.Z] - YYYY-MM-DD` entry to `CHANGELOG.md`, commits back to `main`, and pushes the new `vX.Y.Z` tag.
2. **Standalone Release Push & PWA Deploy (`.github/workflows/release.yml`)**:
   - Triggered automatically on `v*.*.*` tags, pushes to `main`, or `workflow_dispatch`.
   - Runs `npm install` (no `package-lock.json` required) and `npm run build`, generates `Launch-TavernSmith-Windows.bat` and `Launch-TavernSmith-Mac-Linux.command` inside `dist/`, packages `TavernSmith-Standalone-Universal.zip`, and publishes a GitHub Release with the latest notes extracted from `CHANGELOG.md`.

---

## Local Development Quick Start

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check & lint
npm run lint

# Build standalone bundle to ./dist
npm run build
```
