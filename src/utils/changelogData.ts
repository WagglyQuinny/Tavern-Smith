export interface ChangelogReleaseEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  fixes: string[];
  fileChanges: string[];
}

export const APP_VERSION = "4.4.0";

export const CHANGELOG_RELEASES: ChangelogReleaseEntry[] = [
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
  }
];
