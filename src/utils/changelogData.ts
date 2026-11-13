export interface ChangelogReleaseEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  fixes: string[];
  fileChanges: string[];
}

export const APP_VERSION = "4.0.2";

export const CHANGELOG_RELEASES: ChangelogReleaseEntry[] = [
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
  },
  {
    "version": "v3.0.1",
    "date": "2026-11-12",
    "title": "Migrate to custom Express dev server (5cbe882)",
    "highlights": [
      "Migrate to custom Express dev server (5cbe882)",
      "Create FUNDING.yml (cd9ca7a)"
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      ".github/FUNDING.yml — Added Project Configuration & Metadata (+15 / -0 lines)",
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+11 / -10 lines)",
      "bun.lock — Added Project Configuration & Metadata (+570 / -0 lines)",
      "index.html — Updated Project Configuration & Metadata (+3 / -0 lines)",
      "package.json — Updated Project Configuration & Metadata (+7 / -6 lines)",
      "public/sw.js — Updated Project Configuration & Metadata (+7 / -66 lines)",
      "server.ts — Added Project Configuration & Metadata (+285 / -0 lines)",
      "src/App.tsx — Updated Project Configuration & Metadata (+186 / -7 lines)",
      "src/components/CharacterEditor.tsx — Updated Character Card Workbench & Wizard (+73 / -4 lines)",
      "src/components/LorebookEditor.tsx — Updated Lorebook / World Info Workbench & Wizard (+70 / -5 lines)",
      "src/components/SidebarNav.tsx — Updated UI Workbench Component (+259 / -117 lines)",
      "src/components/TagSelector.tsx — Updated Tag & Sub-Tag Selector Bar (+335 / -566 lines)",
      "src/components/TopBar.tsx — Updated UI Workbench Component (+126 / -300 lines)",
      "src/context/StoreContext.tsx — Updated Workspace State, Auto-Save & Provider Credential Vault (+1393 / -352 lines)",
      "src/main.tsx — Updated Project Configuration & Metadata (+5 / -21 lines)",
      "src/services/aiService.ts — Updated AI Backend Service & Model Format Engine (+221 / -111 lines)",
      "src/types.ts — Updated Project Configuration & Metadata (+148 / -144 lines)",
      "src/utils/cardIO.ts — Updated PNG tEXt Chunk & JSON Import/Export Parser (+30 / -1 lines)",
      "src/views/OptionsView.tsx — Updated Options, AI Scanner & Save Folder Manager (+101 / -31 lines)",
      "src/views/ThemesAndTagsView.tsx — Updated Context Themes & Global Tag/Sub-Tag Manager (+1110 / -1008 lines)"
    ]
  },
  {
    "version": "v3.0.0",
    "date": "2026-11-12",
    "title": "Automated release v3.0.0 incorporating 1 updated module(s).",
    "highlights": [
      "Automated release v3.0.0 incorporating 1 updated module(s)."
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "package.json & CHANGELOG.md — Version bump and release metadata sync"
    ]
  },
  {
    "version": "v2.2.1",
    "date": "2026-11-12",
    "title": "Automated release v2.2.1 incorporating 1 updated module(s).",
    "highlights": [
      "Automated release v2.2.1 incorporating 1 updated module(s)."
    ],
    "fixes": [
      "Verified TypeScript compilation, zero-crash sandbox storage guards, and cross-platform standalone launcher compatibility."
    ],
    "fileChanges": [
      "package.json & CHANGELOG.md — Version bump and release metadata sync"
    ]
  },
  {
    "version": "v2.2.0",
    "date": "2026-11-12",
    "title": "Remove PWA install button from top bar (96c5075)",
    "highlights": [
      "Remove PWA install button from top bar (96c5075)"
    ],
    "fixes": [
      "Rename standalone to portable in release build (82e2903)"
    ],
    "fileChanges": [
      ".github/workflows/release.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+12 / -11 lines)",
      "README.md — Updated Project Configuration & Metadata (+55 / -66 lines)",
      "src/components/TopBar.tsx — Updated UI Workbench Component (+1 / -3 lines)"
    ]
  },
  {
    "version": "v2.1.1",
    "date": "2026-11-12",
    "title": "Automated release v2.1.1 incorporating 1 updated module(s) (1 file changed, 16 insertions(+), 20 deletions(-)).",
    "highlights": [
      "Automated release v2.1.1 incorporating 1 updated module(s) (1 file changed, 16 insertions(+), 20 deletions(-))."
    ],
    "fixes": [
      "Clean up version-update script logic (04ad2dc)"
    ],
    "fileChanges": [
      ".github/workflows/version-update.yml — Updated GitHub Actions CI/CD & Standalone Release Workflow (+16 / -20 lines)"
    ]
  },
  {
    "version": "v2.1.0",
    "date": "2026-11-12",
    "title": "Per-Provider API Key Persistence, Gemma 4 System-Merged Engine, Sub-Tags & NSFW Filter, Non-Admin Launchers & Automated Git Changelog Analyzer",
    "highlights": [
      "Persistent Per-Provider AI Credentials & Models: Added savedProviderKeys and savedProviderModels keyed by provider ID (google, xai, openrouter, groq, meta, openai, anthropic, lmstudio, ollama, kobold, custom) so switching AI backend presets automatically restores your saved API key and last-used model without retyping.",
      "Model-Driven Auto-Formatting & Gemma 4 Compatibility: Refactored AI compatibility detection to inspect the active model name directly (Gemma 4/3/2, DeepSeek R1/Qwen QwQ, Llama 3/4, Mistral/Mixtral/Pixtral, Grok, Gemini, Claude) regardless of host endpoint.",
      "Hierarchical Sub-Tags & 🔞 Hide NSFW Tags Toggle: Added sub-tag definitions and inline sub-tag creation under parent tags (e.g., Big Breasts, Bondage / Restraints, Excessive Fluids, MILF, Monster Girl) plus a 1-click \"🔞 Hide NSFW Tags\" UI filter that hides adult tags visually while preserving 100% of attached NSFW tags and sub-tags in AI generation prompts.",
      "In-Depth Automated Git Version & Changelog Generator: Upgraded .github/workflows/version-update.yml to automatically analyze git log, git diff --name-status, and line diff stats since the previous tag, generating multi-section release notes into CHANGELOG.md, src/versionInfo.json, and src/utils/changelogData.ts."
    ],
    "fixes": [
      "Fixed LM Studio + Gemma 4 HTTP 400 Bad Request errors by merging system instructions into the user prompt ([SYSTEM INSTRUCTIONS] + [USER REQUEST]), sending strictly universal OpenAI payload fields, and stripping <|thought|>...<|/thought|> and <think>...</think> blocks.",
      "Fixed white screen on normal launch & removed Administrator privilege requirements by wrapping IndexedDB, localStorage, and FileSystemDirectoryHandle startup calls in defensive try/catch blocks and adding a top-level React AppErrorBoundary with 1-click Safe Recovery.",
      "Updated Launch-TavernSmith-Windows.bat and release.yml build steps to strip crossorigin attributes for direct file:// compatibility and run strictly in user-space (127.0.0.1:4173 or Edge/Chrome --app mode) with zero elevation prompts."
    ],
    "fileChanges": [
      "src/services/aiService.ts — Model-ID format detector, Gemma system-merged payload builder, HTTP 400 auto-retry fallback & <|thought|> parser",
      "src/context/StoreContext.tsx — Per-provider API key & model vault, safe localStorage wrappers, NSFW flags & seeded Sub-Tags",
      "src/components/TagSelector.tsx & src/views/ThemesAndTagsView.tsx — Sub-Tag drawers, custom sub-tag creator & 🔞 Hide NSFW Tags toggle",
      "src/App.tsx & src/utils/folderDb.ts — Top-level React Error Boundary & zero-crash IndexedDB / FileSystemDirectoryHandle guards",
      ".github/workflows/release.yml & .github/workflows/version-update.yml — Non-admin Windows launcher & automated git diff changelog generator"
    ]
  },
  {
    "version": "v2.0.0",
    "date": "2026-11-11",
    "title": "Branding Redesign, Expanded Tag Library & Roster UX",
    "highlights": [
      "Redesigned application branding and enhanced Character & Lorebook Roster filtering and sorting.",
      "Expanded built-in genre, trope, anatomy, and dynamic roleplay tag definitions."
    ],
    "fixes": [
      "Improved character card import/export handling and roster state synchronization."
    ],
    "fileChanges": [
      "src/components/CharacterEditor.tsx & src/components/LorebookEditor.tsx — Roster UX & tag filtering",
      "src/context/StoreContext.tsx — Expanded default tag definitions"
    ]
  },
  {
    "version": "v1.0.3",
    "date": "2026-11-11",
    "title": "Unified Root Save Directory Structure",
    "highlights": [
      "Unified storage into a single Root Save Folder with automatic Characters/ and Lorebooks/ subdirectories plus root _tavernsmith_meta.json."
    ],
    "fixes": [
      "Fixed two-way directory synchronization and local storage fallback handling."
    ],
    "fileChanges": [
      "src/context/StoreContext.tsx & src/views/OptionsView.tsx — Unified Save Folder tree & live sync logs"
    ]
  },
  {
    "version": "v1.0.0",
    "date": "2026-11-10",
    "title": "Initial Production Release",
    "highlights": [
      "Interactive SillyTavern 2:3 Portrait Uploader & HTML5 Canvas Cropper Modal.",
      "Pure-browser PNG steganography (chara V2 & ccv3 V3 tEXt chunks) and JSON I/O.",
      "Synchronized <SmartEditor /> with {{macro}} highlighting, autocomplete, and inline AI Ghost Text.",
      "Modular DM/GM Stat-Block Builder and 5-Step Character & Lorebook Creation Wizards."
    ],
    "fixes": [
      "Added multi-provider AI scanner and automatic <think> / <reasoning> block stripper."
    ],
    "fileChanges": [
      "src/ — Initial TavernSmith V2/V3 Character & Lorebook IDE architecture"
    ]
  }
];
