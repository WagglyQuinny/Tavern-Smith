# Changelog

All notable changes to **TavernSmith** are documented in this file. This file is synced with the in-app **About & Changelog** modal and the automated GitHub Release workflow (`.github/workflows/release.yml`).

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
