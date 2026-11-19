import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ShieldCheck,
  BarChart3,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import {
  isCharacterNsfw,
  isLorebookEntryNsfw,
  isLorebookNsfw,
  useStore,
} from '../context/StoreContext';
import { InspectorTab, Lorebook } from '../types';
import { Tooltip } from './Tooltip';
import {
  serializeCharacterCard,
  serializeLorebookCard,
  normalizeLorebookObject,
  exportCharacterAsPng,
  exportCharacterAsJson,
  exportLorebookAsJson,
} from '../utils/cardIO';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';

interface ValidationIssue {
  level: 'ok' | 'warn' | 'error';
  label: string;
  detail: string;
}

const SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'OpenAI/Anthropic-style key', regex: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: 'Google Gemini API key', regex: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: 'Groq API key', regex: /\bgsk_[A-Za-z0-9_-]{16,}\b/ },
  { label: 'xAI API key', regex: /\bxai-[A-Za-z0-9_-]{16,}\b/ },
  { label: 'Bearer token', regex: /\bBearer\s+[A-Za-z0-9._-]{12,}/i },
  { label: 'Non-empty apiKey field', regex: /"apiKey"\s*:\s*"[^"\s]{6,}"/i },
];

function detectEmbeddedSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const { label, regex } of SECRET_PATTERNS) {
    if (regex.test(text)) {
      hits.push(label);
    }
  }
  return hits;
}

export const JsonInspector: React.FC = () => {
  const {
    character,
    setCharacter,
    lorebook,
    setLorebook,
    lorebooks,
    tags,
    settings,
    setActiveTab: setWorkspaceTab,
    getResolvedLorebookForCharacter,
    statBlock,
    updateSettings,
    importFromFiles,
    activeTheme,
    inspectorDraft,
    updateInspectorDraft,
  } = useStore();

  const activeTab = inspectorDraft.activeTab;
  const isRawEditMode = inspectorDraft.isRawEditMode;
  const rawJsonDraft = inspectorDraft.rawJsonDraft;
  const rawEditError = inspectorDraft.rawEditError;

  const setActiveTab = (next: InspectorTab) =>
    updateInspectorDraft({ activeTab: next });
  const setIsRawEditMode = (next: boolean) =>
    updateInspectorDraft({ isRawEditMode: next });
  const setRawJsonDraft = (next: string) =>
    updateInspectorDraft({ rawJsonDraft: next });
  const setRawEditError = (next: string | null) =>
    updateInspectorDraft({ rawEditError: next });

  const [copied, setCopied] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<Set<number>>(new Set());

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current.clear();
    };
  }, []);

  const hideNsfw = Boolean(settings.hideNsfwTags);
  const isCharShielded =
    hideNsfw && isCharacterNsfw(character, tags, lorebooks);
  const isLorebookShielded = hideNsfw && isLorebookNsfw(lorebook, tags);
  const isActiveViewShielded =
    activeTab === 'lorebook' ? isLorebookShielded : isCharShielded;

  useEffect(() => {
    if (isActiveViewShielded && isRawEditMode) {
      updateInspectorDraft({ isRawEditMode: false, rawEditError: null });
    }
  }, [isActiveViewShielded, isRawEditMode, updateInspectorDraft]);

  const resolvedLinkedLorebook = useMemo(
    () => getResolvedLorebookForCharacter(character),
    [character, getResolvedLorebookForCharacter]
  );

  const visibleLorebookEntryCount = useMemo(
    () =>
      isLorebookShielded
        ? 0
        : hideNsfw
          ? lorebook.entries.filter((e) => !isLorebookEntryNsfw(e, tags)).length
          : lorebook.entries.length,
    [isLorebookShielded, hideNsfw, lorebook.entries, tags]
  );

  const v2JsonString = useMemo(
    () =>
      isCharShielded
        ? ''
        : JSON.stringify(
            serializeCharacterCard(character, 'v2', resolvedLinkedLorebook),
            null,
            2
          ),
    [isCharShielded, character, resolvedLinkedLorebook]
  );

  const v3JsonString = useMemo(
    () =>
      isCharShielded
        ? ''
        : JSON.stringify(
            serializeCharacterCard(character, 'v3', resolvedLinkedLorebook),
            null,
            2
          ),
    [isCharShielded, character, resolvedLinkedLorebook]
  );

  const lorebookJsonString = useMemo(
    () =>
      isLorebookShielded
        ? ''
        : JSON.stringify(serializeLorebookCard(lorebook), null, 2),
    [isLorebookShielded, lorebook]
  );

  const displayedContent = useMemo(() => {
    if (activeTab === 'v2') return v2JsonString;
    if (activeTab === 'v3') return v3JsonString;
    return lorebookJsonString;
  }, [activeTab, v2JsonString, v3JsonString, lorebookJsonString]);

  const displayedSizeKb = useMemo(() => {
    if (!displayedContent) return '0.00';
    return (new TextEncoder().encode(displayedContent).length / 1024).toFixed(2);
  }, [displayedContent]);

  const tokenBreakdown = useMemo(
    () =>
      calculateCardTokenBreakdown(
        character,
        resolvedLinkedLorebook,
        statBlock
      ),
    [character, resolvedLinkedLorebook, statBlock]
  );

  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (isActiveViewShielded) return [];
    const issues: ValidationIssue[] = [];

    if (activeTab !== 'lorebook') {
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
          label: 'Description',
          detail: `${tokenBreakdown.description} tokens in description.`,
        });
      } else {
        issues.push({
          level: 'warn',
          label: 'Empty Description',
          detail: 'Adding appearance and backstory helps keep the character consistent.',
        });
      }

      if (character.first_mes.trim().length > 0) {
        issues.push({
          level: 'ok',
          label: 'First Greeting',
          detail: `${tokenBreakdown.first_mes} tokens (+${character.alternate_greetings.length} alternates).`,
        });
      } else {
        issues.push({
          level: 'warn',
          label: 'Empty First Greeting',
          detail: 'SillyTavern cards work best with an opening message.',
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
          label: 'Macro Braces Match',
          detail: `${openMacros} {{macro}} tag(s) look good.`,
        });
      } else {
        issues.push({
          level: 'warn',
          label: 'Unmatched Macro Braces',
          detail: `Found ${openMacros} opening "{{" vs ${closeMacros} closing "}}".`,
        });
      }
    }

    // Check Linked Lorebook entries (or active Lorebook when inspecting Lorebook JSON)
    const validationBook =
      activeTab === 'lorebook' ? lorebook : resolvedLinkedLorebook;
    if (!validationBook) {
      issues.push({
        level: 'ok',
        label: 'Linked Lorebook',
        detail: 'None linked (standalone character card).',
      });
    } else {
      const invalidEntries = validationBook.entries.filter(
        (e) => e.enabled && !e.constant && e.keys.length === 0
      );
      if (invalidEntries.length === 0) {
        issues.push({
          level: 'ok',
          label: 'Lorebook Keywords',
          detail: `${validationBook.entries.length} entries checked (${validationBook.entries.filter((e) => e.enabled).length} enabled).`,
        });
      } else {
        issues.push({
          level: 'warn',
          label: 'Entries Missing Keywords',
          detail: `${invalidEntries.length} enabled entry has no trigger keywords and isn't Always Active.`,
        });
      }
    }

    // Verify no secret leakage in exported JSON
    const secretHits = detectEmbeddedSecrets(displayedContent);
    if (secretHits.length === 0) {
      issues.push({
        level: 'ok',
        label: 'Safe Export',
        detail: 'No API keys or secrets detected in your export JSON.',
      });
    } else {
      issues.push({
        level: 'error',
        label: 'Potential Secret Detected',
        detail: `Found possible credential pattern (${secretHits.join(', ')}) inside this JSON. Remove sensitive keys before sharing.`,
      });
    }

    return issues;
  }, [
    isActiveViewShielded,
    activeTab,
    character,
    lorebook,
    resolvedLinkedLorebook,
    tokenBreakdown,
    displayedContent,
  ]);

  const handleSwitchTab = (tab: InspectorTab) => {
    setActiveTab(tab);
    setIsRawEditMode(false);
    setRawEditError(null);
    if (tab === 'v2' || tab === 'v3') {
      updateSettings({ cardSpecVersion: tab });
    }
  };

  const handleToggleRawEdit = () => {
    if (isActiveViewShielded) return;
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
    if (isActiveViewShielded) return;
    setRawEditError(null);
    try {
      const parsed = JSON.parse(rawJsonDraft);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setRawEditError('Root JSON value must be an object.');
        return;
      }

      if (activeTab === 'lorebook') {
        const hasEntries =
          Array.isArray(parsed.entries) ||
          (parsed.entries && typeof parsed.entries === 'object');
        if (!hasEntries) {
          setRawEditError(
            'Lorebook JSON must contain an `entries` array or SillyTavern entry map.'
          );
          return;
        }
        const normalized = normalizeLorebookObject(
          parsed as Record<string, unknown>,
          lorebook.name || 'Lorebook'
        );
        setLorebook((prev) => ({
          ...normalized,
          id: prev.id,
          isNsfw:
            typeof parsed.isNsfw === 'boolean' ? parsed.isNsfw : prev.isNsfw,
          tags: Array.isArray(parsed.tags)
            ? parsed.tags
                .filter((t: unknown): t is string => typeof t === 'string')
                .map((t: string) => t.trim())
                .filter(Boolean)
            : normalized.tags && normalized.tags.length > 0
              ? normalized.tags
              : prev.tags,
        }));
        setIsRawEditMode(false);
        setStatusNotice('Applied raw JSON edits to active Lorebook.');
        scheduleTimer(() => setStatusNotice(null), 3000);
        return;
      }

      const dataObj =
        parsed.data &&
        typeof parsed.data === 'object' &&
        !Array.isArray(parsed.data)
          ? (parsed.data as Record<string, unknown>)
          : (parsed as Record<string, unknown>);

      if (typeof dataObj.name !== 'string') {
        setRawEditError(
          'Character JSON must contain a valid `data.name` or top-level `name` string.'
        );
        return;
      }

      const nextAltGreetings = Array.isArray(dataObj.alternate_greetings)
        ? dataObj.alternate_greetings.filter(
            (g): g is string => typeof g === 'string'
          )
        : undefined;
      const nextTags = Array.isArray(dataObj.tags)
        ? dataObj.tags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      let nextEmbeddedBook: Lorebook | null | undefined = undefined;
      if (dataObj.character_book === null) {
        nextEmbeddedBook = null;
      } else if (
        dataObj.character_book &&
        typeof dataObj.character_book === 'object' &&
        !Array.isArray(dataObj.character_book)
      ) {
        const rawBook = dataObj.character_book as Record<string, unknown>;
        const hasValidEntries =
          Array.isArray(rawBook.entries) ||
          (rawBook.entries && typeof rawBook.entries === 'object');
        if (!hasValidEntries) {
          setRawEditError(
            '`character_book` must contain an `entries` array or entry map.'
          );
          return;
        }
        const normalizedBook = normalizeLorebookObject(
          rawBook,
          `${dataObj.name || character.name || 'Character'} Lorebook`
        );
        nextEmbeddedBook = {
          ...normalizedBook,
          id:
            typeof rawBook.id === 'string' && rawBook.id.trim()
              ? rawBook.id.trim()
              : character.character_book?.id || normalizedBook.id,
        };
      }

      setCharacter((prev) => ({
        ...prev,
        name: dataObj.name as string,
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
        alternate_greetings: nextAltGreetings ?? prev.alternate_greetings,
        tags: nextTags ?? prev.tags,
        creator:
          typeof dataObj.creator === 'string' ? dataObj.creator : prev.creator,
        character_version:
          typeof dataObj.character_version === 'string'
            ? dataObj.character_version
            : prev.character_version,
        character_book:
          nextEmbeddedBook === undefined
            ? prev.character_book
            : nextEmbeddedBook === null
              ? undefined
              : nextEmbeddedBook,
      }));

      setIsRawEditMode(false);
      setStatusNotice('Applied raw JSON edits to active Character Card.');
      scheduleTimer(() => setStatusNotice(null), 3000);
    } catch (err) {
      setRawEditError(
        err instanceof Error ? err.message : 'Invalid JSON syntax.'
      );
    }
  };

  const handleCopyCurrent = async () => {
    if (isActiveViewShielded) return;
    try {
      await navigator.clipboard.writeText(
        isRawEditMode ? rawJsonDraft : displayedContent
      );
      setCopied(true);
      scheduleTimer(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadCurrent = async () => {
    if (isActiveViewShielded) return;
    if (activeTab === 'v2' || activeTab === 'v3') {
      exportCharacterAsJson(character, activeTab, resolvedLinkedLorebook);
      setStatusNotice(
        `Downloaded ${character.name} (${activeTab.toUpperCase()}) JSON.`
      );
      scheduleTimer(() => setStatusNotice(null), 3000);
      return;
    }
    exportLorebookAsJson(lorebook);
    setStatusNotice(`Downloaded ${lorebook.name} Lorebook JSON.`);
    scheduleTimer(() => setStatusNotice(null), 3000);
  };

  const handleExportPng = async () => {
    if (isActiveViewShielded) return;
    await exportCharacterAsPng(
      character,
      resolvedLinkedLorebook,
      activeTheme.color
    );
    setStatusNotice(
      `Exported ${character.name}.png with embedded V2 (chara) + V3 (ccv3) tEXt chunks.`
    );
    scheduleTimer(() => setStatusNotice(null), 3200);
  };

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const res = await importFromFiles(files);
    setStatusNotice(res.summary);
    scheduleTimer(() => setStatusNotice(null), 3500);
  };

  const breakdownRows = [
    { label: 'Description', tokens: tokenBreakdown.description },
    { label: 'Personality', tokens: tokenBreakdown.personality },
    { label: 'Scenario', tokens: tokenBreakdown.scenario },
    { label: 'First Message', tokens: tokenBreakdown.first_mes },
    { label: 'Example Dialogue', tokens: tokenBreakdown.mes_example },
    { label: 'System Prompt', tokens: tokenBreakdown.system_prompt },
    {
      label: 'Post-History Instructions',
      tokens: tokenBreakdown.post_history_instructions,
    },
    { label: 'Stat Tracker', tokens: tokenBreakdown.stat_block },
    { label: 'Lorebook (Always On)', tokens: tokenBreakdown.lorebook_constant },
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
                Raw JSON &amp; Export
              </h1>
              <Tooltip content="Check your card for issues, see token counts per field, edit raw JSON directly, or export your character as a .PNG or .JSON file." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Preview V2/V3 card JSON, inspect token counts, and export clean .PNG or .JSON cards (no API keys included).
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

          <button
            type="button"
            disabled={isActiveViewShielded}
            onClick={handleToggleRawEdit}
            style={
              isRawEditMode ? { borderColor: 'var(--theme-accent)' } : undefined
            }
            className={`theme-hover-outline flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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

          {(activeTab === 'v2' || activeTab === 'v3') && (
            <button
              type="button"
              disabled={isActiveViewShielded}
              onClick={() => void handleExportPng()}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
            disabled={isActiveViewShielded}
            onClick={() => void handleDownloadCurrent()}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>Download .JSON</span>
          </button>

          <button
            type="button"
            disabled={isActiveViewShielded}
            onClick={() => void handleCopyCurrent()}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy JSON</span>
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
            <span>
              {isLorebookShielded
                ? 'Lorebook JSON (Hidden)'
                : `Lorebook JSON (${visibleLorebookEntryCount} entries)`}
            </span>
          </button>
        </div>

        {!isActiveViewShielded && (
          <div className="flex items-center gap-3 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              File Size:{' '}
              <strong className="text-slate-900 dark:text-white">
                {displayedSizeKb} KB
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
        )}
      </div>

      {isActiveViewShielded ? (
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
          }}
          className="rounded-2xl border bg-white dark:bg-slate-900 p-8 sm:p-12 text-center space-y-4 shadow-sm"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              NSFW {activeTab === 'lorebook' ? 'Lorebook' : 'Character'} JSON Hidden (SFW Mode Active)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              This {activeTab === 'lorebook' ? 'lorebook' : 'character card'} is flagged NSFW and is shielded while <strong>Hide NSFW Content</strong> is enabled in Options. Select an SFW item or disable SFW Mode to inspect or export it.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() =>
                setWorkspaceTab(
                  activeTab === 'lorebook' ? 'lorebook' : 'character'
                )
              }
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              Switch to {activeTab === 'lorebook' ? 'Lorebooks' : 'Characters'}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab('options')}
              className="theme-hover-outline rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Open Options
            </button>
          </div>
        </div>
      ) : (
      /* Main Fluid Responsive Grid: Code/Editor + Schema Validation & Token Breakdown */
      <div
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
        }}
        className="grid gap-6 items-start"
      >
        {/* Left Column: JSON Code Viewer or Raw Editor */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
          }}
          className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden min-w-0"
        >
          {/* Sub-header inside Code Panel */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-4 py-2.5">
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

            {isRawEditMode && (
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

          {isRawEditMode ? (
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

        {/* Right Column: Live Schema Validator & Per-Field Token Telemetry */}
        <div className="space-y-6 min-w-0">
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
                  Card Check
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
                  className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs ${
                    issue.level === 'error'
                      ? 'border-rose-500/40 bg-rose-500/10'
                      : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/50'
                  }`}
                >
                  {issue.level === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : issue.level === 'error' ? (
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
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

          {/* Token Breakdown by Field */}
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
                  Tokens by Field
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
      )}
    </div>
  );
};
