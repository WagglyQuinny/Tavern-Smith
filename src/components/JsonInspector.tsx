import React, { useState, useMemo, useRef } from 'react';
import {
  FileJson,
  Copy,
  Check,
  Download,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Eye,
  GitBranch,
  ShieldCheck,
  BarChart3,
  FileCode2,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Tooltip } from './Tooltip';
import {
  serializeCharacterCard,
  exportCharacterAsPng,
  exportCharacterAsJson,
  exportLorebookAsJson,
  triggerBrowserDownload,
} from '../utils/cardIO';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';

type InspectorTab = 'v2' | 'v3' | 'lorebook' | 'github_kit';
type ReleaseKitDoc = 'workflow' | 'readme' | 'changelog';

interface ValidationIssue {
  level: 'ok' | 'warn' | 'error';
  label: string;
  detail: string;
}

const GITHUB_RELEASE_WORKFLOW_YML = `name: TavernSmith CI/CD & Release Kit

on:
  push:
    branches: [ main ]
    tags:
      - 'v*.*.*'
  pull_request:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: "pages-and-release-\${{ github.ref }}"
  cancel-in-progress: true

jobs:
  build-and-verify:
    name: Typecheck, Lint & Production Vite Bundle
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: TypeScript Strict Verification
        run: npm run lint

      - name: Build Production SPA Bundle
        run: npm run build

      - name: Upload Pages Artifact
        if: github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

      - name: Archive Release Zip for Tag
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          cd dist
          zip -r ../tavernsmith-\${{ github.ref_name }}-web-bundle.zip .

      - name: Create Automated GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: tavernsmith-\${{ github.ref_name }}-web-bundle.zip
          generate_release_notes: true
          body_path: CHANGELOG.md

  deploy-pages:
    if: github.ref == 'refs/heads/main'
    needs: build-and-verify
    name: Deploy to GitHub Pages
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

export const TAVERNSmith_CHANGELOG_MD = `# Changelog — TavernSmith IDE

All notable changes to **TavernSmith** are documented in this file.

## [v1.0.0] — Production Release

### Added
- **Unified SillyTavern V2 & V3 Character Card Engine**:
  - Full schema support for \`chara_card_v2\` (2.0) and \`chara_card_v3\` (3.0) specifications.
  - Pure-browser PNG steganography (\`tEXt\` chunk reader & writer with IEEE 802.3 CRC32 verification) embedding both \`chara\` (V2 Base64 UTF-8 JSON) and \`ccv3\` (V3 Base64 UTF-8 JSON) chunks for maximum cross-client compatibility.
- **Synchronized \`<SmartEditor />\` with Macro & Ghost Text Support**:
  - Zero-dependency pixel-aligned backdrop highlighter for \`{{char}}\`, \`{{user}}\`, \`{{random:...}}\`, \`{{roll:...}}\`, and \`{{time}}\` macros.
  - Instant keyboard-navigable \`{{macro}}\` autocomplete popup without AI latency.
  - Non-intrusive debounced AI Ghost Text (\`Tab\` to accept, \`Esc\` to dismiss) with strict \`AbortController\` lifecycle cleanup.
- **DM / GM Stat Block & RPG HUD Builder**:
  - Modular tracked stats (\`number\`, \`bar\`, \`text\`, \`list\`) with custom ASCII HUD templates (Modern Bracketed, Classic RPG Box, Minimalist Inline) and 1-Click Compilation into System Prompt, Post-History, or Author's Note.
- **Multi-Provider AI Scanner & Reasoning Parser**:
  - One-click presets for LM Studio, Ollama, KoboldCPP, Google Gemini, xAI Grok, Meta Llama 4 (OpenRouter, Groq, Meta Direct), and OpenAI-compatible APIs.
  - Live endpoint model scanner (\`/v1/models\`, \`/api/tags\`, \`/v1beta/models\`) and automatic stripping of \`<think>\`, \`<thought>\`, and \`<reasoning>\` blocks into a collapsible Reasoning Inspector.
- **Storage & Save Folder Manager**:
  - Native Local PC Save Folder integration (\`window.showDirectoryPicker\`) paired with an interactive In-App Save Folder Manager, live save log, quota telemetry, and 1-click backup bundle export.
- **Dual-Layer Theme Architecture**:
  - True Dark Mode (\`#09090b\` obsidian canvas) and Light Mode (\`#f4f4f5\` daylight alabaster canvas) combined with customizable Context Themes that dynamically bind \`--theme-accent\` across all active borders and focus rings.
`;

export const TAVERNSmith_README_MD = `# TavernSmith — SillyTavern V2 & V3 Character & Lorebook IDE

**TavernSmith** (\`v1.0.0\`) is a browser-native Character Card V2/V3 and World Info (Lorebook) IDE built with React, TypeScript, and Tailwind CSS.

## Core Capabilities
1. **Character Workbench & 5-Step Guided Wizard**:
   - Edit Identity, Scenario, Greeting Carousel, Example Dialogue, System Prompts, and RPG Stat Blocks with real-time token telemetry.
2. **Pure-Browser PNG & JSON Card I/O**:
   - Drag and drop any SillyTavern \`.png\` or \`.json\` card to inspect and edit its embedded \`chara\` / \`ccv3\` chunks, or export directly to PNG/JSON with zero server dependencies.
3. **World Info / Lorebook Workbench**:
   - Manage constant and keyword-triggered lore entries, insertion orders, selective keys, and live keyword-activation simulation.
4. **Storage & Save Folder Manager**:
   - Connect a local directory via the File System Access API (\`showDirectoryPicker\`) or organize cards across virtual Save Folders with automatic interval snapshots.

## Quick Start
\`\`\`bash
npm install
npm run dev
\`\`\`

## Production Build & Type Check
\`\`\`bash
npm run lint
npm run build
\`\`\`
`;

export const JsonInspector: React.FC = () => {
  const {
    character,
    setCharacter,
    lorebook,
    setLorebook,
    statBlock,
    settings,
    updateSettings,
    importFromFiles,
    activeTheme,
  } = useStore();

  const [activeTab, setActiveTab] = useState<InspectorTab>(
    settings.cardSpecVersion === 'v2' ? 'v2' : 'v3'
  );
  const [releaseDoc, setReleaseDoc] = useState<ReleaseKitDoc>('workflow');
  const [copied, setCopied] = useState(false);
  const [isRawEditMode, setIsRawEditMode] = useState(false);
  const [rawJsonDraft, setRawJsonDraft] = useState('');
  const [rawEditError, setRawEditError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const v2JsonString = useMemo(
    () =>
      JSON.stringify(
        serializeCharacterCard(character, 'v2', lorebook),
        null,
        2
      ),
    [character, lorebook]
  );

  const v3JsonString = useMemo(
    () =>
      JSON.stringify(
        serializeCharacterCard(character, 'v3', lorebook),
        null,
        2
      ),
    [character, lorebook]
  );

  const lorebookJsonString = useMemo(
    () => JSON.stringify(lorebook, null, 2),
    [lorebook]
  );

  const displayedContent = useMemo(() => {
    if (activeTab === 'v2') return v2JsonString;
    if (activeTab === 'v3') return v3JsonString;
    if (activeTab === 'lorebook') return lorebookJsonString;
    if (releaseDoc === 'workflow') return GITHUB_RELEASE_WORKFLOW_YML;
    if (releaseDoc === 'readme') return TAVERNSmith_README_MD;
    return TAVERNSmith_CHANGELOG_MD;
  }, [activeTab, releaseDoc, v2JsonString, v3JsonString, lorebookJsonString]);

  const tokenBreakdown = useMemo(
    () => calculateCardTokenBreakdown(character, lorebook, statBlock),
    [character, lorebook, statBlock]
  );

  const validationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];

    if (character.name.trim().length > 0) {
      issues.push({
        level: 'ok',
        label: 'Character Name',
        detail: `"${character.name}" is defined.`,
      });
    } else {
      issues.push({
        level: 'error',
        label: 'Missing Character Name',
        detail: 'SillyTavern V2/V3 requires a non-empty `data.name` field.',
      });
    }

    if (character.description.trim().length > 0) {
      issues.push({
        level: 'ok',
        label: 'Core Description',
        detail: `${tokenBreakdown.description} tokens in description.`,
      });
    } else {
      issues.push({
        level: 'warn',
        label: 'Empty Description',
        detail: 'Adding physical/narrative traits improves roleplay consistency.',
      });
    }

    if (character.first_mes.trim().length > 0) {
      issues.push({
        level: 'ok',
        label: 'First Greeting (`first_mes`)',
        detail: `${tokenBreakdown.first_mes} tokens (+${character.alternate_greetings.length} alternates).`,
      });
    } else {
      issues.push({
        level: 'warn',
        label: 'Empty First Greeting',
        detail: 'SillyTavern cards should include an opening message.',
      });
    }

    // Check macro balanced braces across all text fields
    const combinedText = [
      character.description,
      character.personality,
      character.scenario,
      character.first_mes,
      character.mes_example,
      character.system_prompt,
      character.post_history_instructions,
      ...character.alternate_greetings,
    ].join('\n');

    const openMacros = (combinedText.match(/\{\{/g) || []).length;
    const closeMacros = (combinedText.match(/\}\}/g) || []).length;
    if (openMacros === closeMacros) {
      issues.push({
        level: 'ok',
        label: 'Macro Syntax Integrity',
        detail: `${openMacros} balanced {{macro}} tag(s) verified.`,
      });
    } else {
      issues.push({
        level: 'warn',
        label: 'Unbalanced Macro Braces',
        detail: `Found ${openMacros} opening "{{" vs ${closeMacros} closing "}}".`,
      });
    }

    // Check Lorebook entries
    const invalidEntries = lorebook.entries.filter(
      (e) => e.enabled && !e.constant && e.keys.length === 0
    );
    if (invalidEntries.length === 0) {
      issues.push({
        level: 'ok',
        label: 'Lorebook Entry Triggers',
        detail: `${lorebook.entries.length} entries validated (${lorebook.entries.filter((e) => e.enabled).length} enabled).`,
      });
    } else {
      issues.push({
        level: 'warn',
        label: 'Unkeyed Lorebook Entries',
        detail: `${invalidEntries.length} enabled non-constant entry has no trigger keywords.`,
      });
    }

    // Verify no secret leakage
    const hasSecretKey =
      v3JsonString.includes('apiKey') || v3JsonString.includes('Bearer ');
    if (!hasSecretKey) {
      issues.push({
        level: 'ok',
        label: 'Sanitized Export Payload',
        detail: 'Zero API keys or endpoint credentials present in card JSON.',
      });
    }

    return issues;
  }, [character, lorebook, tokenBreakdown, v3JsonString]);

  const handleSwitchTab = (tab: InspectorTab) => {
    setActiveTab(tab);
    setIsRawEditMode(false);
    setRawEditError(null);
    if (tab === 'v2' || tab === 'v3') {
      updateSettings({ cardSpecVersion: tab });
    }
  };

  const handleToggleRawEdit = () => {
    if (activeTab === 'github_kit') return;
    if (!isRawEditMode) {
      setRawJsonDraft(displayedContent);
      setRawEditError(null);
      setIsRawEditMode(true);
    } else {
      setIsRawEditMode(false);
      setRawEditError(null);
    }
  };

  const handleApplyRawJson = () => {
    setRawEditError(null);
    try {
      const parsed = JSON.parse(rawJsonDraft);
      if (activeTab === 'lorebook') {
        if (!parsed || !Array.isArray(parsed.entries)) {
          setRawEditError('Lorebook JSON must contain an `entries` array.');
          return;
        }
        setLorebook((prev) => ({
          ...prev,
          name: typeof parsed.name === 'string' ? parsed.name : prev.name,
          description:
            typeof parsed.description === 'string'
              ? parsed.description
              : prev.description,
          scan_depth:
            typeof parsed.scan_depth === 'number'
              ? parsed.scan_depth
              : prev.scan_depth,
          token_budget:
            typeof parsed.token_budget === 'number'
              ? parsed.token_budget
              : prev.token_budget,
          recursive_scanning: Boolean(parsed.recursive_scanning),
          entries: parsed.entries,
        }));
        setIsRawEditMode(false);
        setStatusNotice('Applied raw JSON edits to active Lorebook.');
        window.setTimeout(() => setStatusNotice(null), 3000);
        return;
      }

      const dataObj =
        parsed && typeof parsed.data === 'object' && parsed.data !== null
          ? parsed.data
          : parsed;

      if (!dataObj || typeof dataObj.name !== 'string') {
        setRawEditError(
          'Character JSON must contain a valid `data.name` or top-level `name` string.'
        );
        return;
      }

      setCharacter((prev) => ({
        ...prev,
        name: dataObj.name,
        description:
          typeof dataObj.description === 'string'
            ? dataObj.description
            : prev.description,
        personality:
          typeof dataObj.personality === 'string'
            ? dataObj.personality
            : prev.personality,
        scenario:
          typeof dataObj.scenario === 'string'
            ? dataObj.scenario
            : prev.scenario,
        first_mes:
          typeof dataObj.first_mes === 'string'
            ? dataObj.first_mes
            : prev.first_mes,
        mes_example:
          typeof dataObj.mes_example === 'string'
            ? dataObj.mes_example
            : prev.mes_example,
        creator_notes:
          typeof dataObj.creator_notes === 'string'
            ? dataObj.creator_notes
            : prev.creator_notes,
        system_prompt:
          typeof dataObj.system_prompt === 'string'
            ? dataObj.system_prompt
            : prev.system_prompt,
        post_history_instructions:
          typeof dataObj.post_history_instructions === 'string'
            ? dataObj.post_history_instructions
            : prev.post_history_instructions,
        alternate_greetings: Array.isArray(dataObj.alternate_greetings)
          ? dataObj.alternate_greetings
          : prev.alternate_greetings,
        tags: Array.isArray(dataObj.tags) ? dataObj.tags : prev.tags,
        creator:
          typeof dataObj.creator === 'string' ? dataObj.creator : prev.creator,
        character_version:
          typeof dataObj.character_version === 'string'
            ? dataObj.character_version
            : prev.character_version,
      }));

      if (
        dataObj.character_book &&
        Array.isArray(dataObj.character_book.entries)
      ) {
        setLorebook(dataObj.character_book);
      }

      setIsRawEditMode(false);
      setStatusNotice('Applied raw JSON edits to active Character Card.');
      window.setTimeout(() => setStatusNotice(null), 3000);
    } catch (err) {
      setRawEditError(
        err instanceof Error ? err.message : 'Invalid JSON syntax.'
      );
    }
  };

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(
        isRawEditMode ? rawJsonDraft : displayedContent
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadCurrent = async () => {
    if (activeTab === 'v2' || activeTab === 'v3') {
      exportCharacterAsJson(character, activeTab, lorebook);
      setStatusNotice(
        `Downloaded ${character.name} (${activeTab.toUpperCase()}) JSON.`
      );
      window.setTimeout(() => setStatusNotice(null), 3000);
      return;
    }
    if (activeTab === 'lorebook') {
      exportLorebookAsJson(lorebook);
      setStatusNotice(`Downloaded ${lorebook.name} Lorebook JSON.`);
      window.setTimeout(() => setStatusNotice(null), 3000);
      return;
    }
    // GitHub Release Kit file download
    if (releaseDoc === 'workflow') {
      triggerBrowserDownload(
        GITHUB_RELEASE_WORKFLOW_YML,
        'release.yml',
        'text/yaml;charset=utf-8'
      );
    } else if (releaseDoc === 'readme') {
      triggerBrowserDownload(
        TAVERNSmith_README_MD,
        'README.md',
        'text/markdown;charset=utf-8'
      );
    } else {
      triggerBrowserDownload(
        TAVERNSmith_CHANGELOG_MD,
        'CHANGELOG.md',
        'text/markdown;charset=utf-8'
      );
    }
  };

  const handleExportPng = async () => {
    await exportCharacterAsPng(character, lorebook, activeTheme.color);
    setStatusNotice(
      `Exported ${character.name}.png with embedded V2 (chara) + V3 (ccv3) tEXt chunks.`
    );
    window.setTimeout(() => setStatusNotice(null), 3200);
  };

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const res = await importFromFiles(files);
    setStatusNotice(res.summary);
    window.setTimeout(() => setStatusNotice(null), 3500);
  };

  const breakdownRows = [
    { label: 'Core Description', tokens: tokenBreakdown.description },
    { label: 'Personality Summary', tokens: tokenBreakdown.personality },
    { label: 'Scenario & Setting', tokens: tokenBreakdown.scenario },
    { label: 'First Greeting (first_mes)', tokens: tokenBreakdown.first_mes },
    { label: 'Example Dialogue (mes_example)', tokens: tokenBreakdown.mes_example },
    { label: 'System Prompt Override', tokens: tokenBreakdown.system_prompt },
    {
      label: 'Post-History / Jailbreak',
      tokens: tokenBreakdown.post_history_instructions,
    },
    { label: 'DM StatBlock Tracker', tokens: tokenBreakdown.stat_block },
    { label: 'Lorebook (Constant)', tokens: tokenBreakdown.lorebook_constant },
    { label: 'Lorebook (Triggered)', tokens: tokenBreakdown.lorebook_Triggered },
  ];

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.json,image/png,application/json"
        onChange={(e) => {
          void handleFileImport(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Header & Primary Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              borderColor: 'var(--theme-accent)',
              backgroundColor:
                'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg border shrink-0"
          >
            <FileJson
              className="h-5 w-5"
              style={{ color: 'var(--theme-accent)' }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                SillyTavern V2/V3 Inspector & Release Kit
              </h1>
              <Tooltip content="Inspect live V2/V3 serialized JSON, verify schema & token budgets, edit raw JSON directly, or export your GitHub Actions CI/CD Release Kit." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live Schema Validator · Pure-Browser PNG Steganography (`chara` + `ccv3`) · GitHub Release Automation
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" style={{ color: 'var(--theme-accent)' }} />
            <span>Import .PNG / .JSON</span>
          </button>

          {activeTab !== 'github_kit' && (
            <button
              type="button"
              onClick={handleToggleRawEdit}
              style={
                isRawEditMode ? { borderColor: 'var(--theme-accent)' } : undefined
              }
              className={`theme-hover-outline flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                isRawEditMode
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isRawEditMode ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span>Exit Raw Edit</span>
                </>
              ) : (
                <>
                  <Edit3
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>Raw JSON Edit</span>
                </>
              )}
            </button>
          )}

          {(activeTab === 'v2' || activeTab === 'v3') && (
            <button
              type="button"
              onClick={() => void handleExportPng()}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ImageIcon
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export .PNG Card</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleDownloadCurrent()}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Download
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>
              {activeTab === 'github_kit' ? 'Download File' : 'Download .JSON'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyCurrent()}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Payload</span>
              </>
            )}
          </button>
        </div>
      </div>

      {statusNotice && (
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="flex items-center justify-between rounded-lg border bg-slate-50 dark:bg-slate-900/90 px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200"
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => handleSwitchTab('v2')}
            style={
              activeTab === 'v2'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'v2'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            chara_card_v2 (2.0)
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('v3')}
            style={
              activeTab === 'v3'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'v3'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            chara_card_v3 (3.0)
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('lorebook')}
            style={
              activeTab === 'lorebook'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'lorebook'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Lorebook JSON ({lorebook.entries.length} entries)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('github_kit')}
            style={
              activeTab === 'github_kit'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'github_kit'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>GitHub CI/CD Release Kit</span>
          </button>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            Payload Size:{' '}
            <strong className="text-slate-900 dark:text-white">
              {(new Blob([displayedContent]).size / 1024).toFixed(2)} KB
            </strong>
          </span>
          <span>·</span>
          <span>
            Permanent Tokens:{' '}
            <strong className="text-slate-900 dark:text-white">
              {tokenBreakdown.permanentTokens}
            </strong>
          </span>
          <span>·</span>
          <span>
            Total w/ Lore:{' '}
            <strong style={{ color: 'var(--theme-accent)' }}>
              {tokenBreakdown.totalCardTokens} tokens
            </strong>
          </span>
        </div>
      </div>

      {/* Main 12-Col Grid: Left 8 Cols Code/Editor, Right 4 Cols Schema Validation & Token Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: JSON / Release Kit Code Viewer or Raw Editor */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
          }}
          className="lg:col-span-8 rounded-xl border bg-white dark:bg-slate-900 overflow-hidden"
        >
          {/* Sub-header inside Code Panel */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-4 py-2.5">
            {activeTab === 'github_kit' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReleaseDoc('workflow')}
                  style={
                    releaseDoc === 'workflow'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                    releaseDoc === 'workflow'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  <span>.github/workflows/release.yml</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReleaseDoc('readme')}
                  style={
                    releaseDoc === 'readme'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                    releaseDoc === 'readme'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>README.md</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReleaseDoc('changelog')}
                  style={
                    releaseDoc === 'changelog'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                    releaseDoc === 'changelog'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>CHANGELOG.md</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {activeTab === 'v2' &&
                    `${character.name || 'character'}.v2.json`}
                  {activeTab === 'v3' &&
                    `${character.name || 'character'}.v3.json`}
                  {activeTab === 'lorebook' &&
                    `${lorebook.name || 'lorebook'}.worldinfo.json`}
                </span>
                <span className="rounded bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                  {isRawEditMode ? 'EDITABLE RAW JSON' : 'READ-ONLY SNAPSHOT'}
                </span>
              </div>
            )}

            {isRawEditMode && activeTab !== 'github_kit' && (
              <button
                type="button"
                onClick={handleApplyRawJson}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Apply Raw JSON to Workspace</span>
              </button>
            )}
          </div>

          {rawEditError && (
            <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-600 dark:text-rose-300 font-mono">
              JSON Parse Error: {rawEditError}
            </div>
          )}

          {isRawEditMode && activeTab !== 'github_kit' ? (
            <textarea
              value={rawJsonDraft}
              onChange={(e) => setRawJsonDraft(e.target.value)}
              spellCheck={false}
              className="w-full h-[64vh] bg-slate-50 dark:bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100 focus:outline-none resize-y"
            />
          ) : (
            <pre className="font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-200 overflow-x-auto max-h-[64vh] p-4">
              {displayedContent}
            </pre>
          )}
        </div>

        {/* Right 4 Columns: Live Schema Validator & Per-Field Token Telemetry */}
        <div className="lg:col-span-4 space-y-6">
          {/* Schema & Security Validation Card */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Live Schema & Security Audit
                </h2>
              </div>
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {validationIssues.filter((i) => i.level === 'ok').length}/
                {validationIssues.length} Passed
              </span>
            </div>

            <div className="space-y-2">
              {validationIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/50 p-2.5 text-xs"
                >
                  {issue.level === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {issue.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {issue.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Field Token Telemetry Breakdown */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3
                  className="h-4 w-4"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Per-Field Token Breakdown
                </h2>
              </div>
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                {tokenBreakdown.totalCardTokens} total
              </span>
            </div>

            <div className="space-y-2.5">
              {breakdownRows.map((row) => {
                const pct =
                  tokenBreakdown.totalCardTokens > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (row.tokens / tokenBreakdown.totalCardTokens) * 100
                        )
                      )
                    : 0;
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400 truncate">
                        {row.label}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white tabular-nums">
                        {row.tokens} tok ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: 'var(--theme-accent)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
