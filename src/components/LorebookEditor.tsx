import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Copy,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Link2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Key,
  Cpu,
  Upload,
  Download,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  Lorebook,
  LorebookEntry,
  LorebookPosition,
  RosterSortOption,
} from '../types';
import { SmartEditor } from './SmartEditor';
import { Tooltip } from './Tooltip';
import {
  calculateLorebookTokens,
  estimateTokens,
} from '../utils/tokenCounter';
import { exportLorebookAsJson } from '../utils/cardIO';
import { AIServiceError, generateCompletionDetailed } from '../services/aiService';

const LOREBOOK_POSITIONS: { value: LorebookPosition; label: string }[] = [
  { value: 'before_char', label: 'Before Character Defs (before_char)' },
  { value: 'after_char', label: 'After Character Defs (after_char)' },
  { value: 'an_top', label: "Top of Author's Note (an_top)" },
  { value: 'an_bottom', label: "Bottom of Author's Note (an_bottom)" },
  { value: 'at_depth', label: 'At Custom Chat Depth (at_depth)' },
];

export const LorebookEditor: React.FC = () => {
  const {
    lorebooks,
    activeLorebookId,
    setActiveLorebookId,
    createNewLorebook,
    deleteLorebook,
    lorebook,
    setLorebook,
    character,
    updateCharacterField,
    tags,
    activeTheme,
    aiConfig,
    importFromFiles,
  } = useStore();

  // Lorebook Roster Sidebar State
  const [rosterOpen, setRosterOpen] = useState(true);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTagFilter, setRosterTagFilter] = useState<string>('all');
  const [rosterSort, setRosterSort] = useState<RosterSortOption>('modified_desc');
  const [deleteTargetLorebook, setDeleteTargetLorebook] =
    useState<Lorebook | null>(null);
  const lorebookFileInputRef = useRef<HTMLInputElement | null>(null);

  // Entry List Filter & Selection State
  const [entrySearch, setEntrySearch] = useState('');
  const [entryTagFilter, setEntryTagFilter] = useState<string>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | number | null>(
    lorebook.entries[0]?.id ?? null
  );

  // Key Input Drafts
  const [primaryKeyInput, setPrimaryKeyInput] = useState('');
  const [secondaryKeyInput, setSecondaryKeyInput] = useState('');
  const [isSuggestingKeys, setIsSuggestingKeys] = useState(false);
  const [aiKeyError, setAiKeyError] = useState<{
    message: string;
    corsHint?: string;
  } | null>(null);
  const [syncSuccessBanner, setSyncSuccessBanner] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Keep selectedEntryId valid when switching lorebooks
  useEffect(() => {
    if (
      !lorebook.entries.some((e) => e.id === selectedEntryId)
    ) {
      setSelectedEntryId(lorebook.entries[0]?.id ?? null);
    }
  }, [lorebook.id, lorebook.entries, selectedEntryId]);

  const lorebooksWithTokens = useMemo(() => {
    return lorebooks.map((lb) => ({
      lb,
      tokens: calculateLorebookTokens(lb),
    }));
  }, [lorebooks]);

  const filteredAndSortedLorebooks = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    const filtered = lorebooksWithTokens.filter(({ lb }) => {
      const lbTags = Array.from(
        new Set([
          ...(lb.tags || []),
          ...lb.entries.flatMap((e) => e.tags || []),
        ])
      );
      const matchesTag =
        rosterTagFilter === 'all' || lbTags.includes(rosterTagFilter);
      const matchesQuery =
        !q ||
        lb.name.toLowerCase().includes(q) ||
        lb.description.toLowerCase().includes(q) ||
        lbTags.some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (rosterSort === 'name_asc') {
        return a.lb.name.localeCompare(b.lb.name);
      }
      if (rosterSort === 'name_desc') {
        return b.lb.name.localeCompare(a.lb.name);
      }
      if (rosterSort === 'tokens_desc') {
        return b.tokens.total - a.tokens.total;
      }
      if (rosterSort === 'tokens_asc') {
        return a.tokens.total - b.tokens.total;
      }
      return (b.lb.modification_date || 0) - (a.lb.modification_date || 0);
    });
  }, [lorebooksWithTokens, rosterSearch, rosterTagFilter, rosterSort]);

  const activeLorebookTokens = useMemo(
    () => calculateLorebookTokens(lorebook),
    [lorebook]
  );

  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    return lorebook.entries.filter((entry) => {
      const matchesTag =
        entryTagFilter === 'all' || (entry.tags || []).includes(entryTagFilter);
      const matchesQuery =
        !q ||
        (entry.comment || '').toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        entry.keys.some((k) => k.toLowerCase().includes(q)) ||
        entry.secondary_keys.some((k) => k.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });
  }, [lorebook.entries, entrySearch, entryTagFilter]);

  const selectedEntry = useMemo(
    () =>
      lorebook.entries.find((e) => e.id === selectedEntryId) ||
      lorebook.entries[0] ||
      null,
    [lorebook.entries, selectedEntryId]
  );

  // Sync changes to character.character_book if this lorebook is bound to the active character
  const updateLorebookAndSync = (updater: (prev: Lorebook) => Lorebook) => {
    setLorebook((prev) => {
      const updated = updater(prev);
      if (
        character.character_book?.id === updated.id ||
        character.character_book?.name === prev.name
      ) {
        updateCharacterField('character_book', updated);
      }
      return updated;
    });
  };

  const handleBindToActiveCharacter = () => {
    updateCharacterField('character_book', lorebook);
    setSyncSuccessBanner(true);
    window.setTimeout(() => setSyncSuccessBanner(false), 3000);
  };

  // Entry CRUD Handlers
  const handleCreateEntry = () => {
    const newEntry: LorebookEntry = {
      id: `entry-${Date.now()}`,
      comment: `New World Info Entry #${lorebook.entries.length + 1}`,
      keys: ['keyword'],
      secondary_keys: [],
      content: '',
      enabled: true,
      insertion_order: 100,
      case_sensitive: false,
      constant: false,
      selective: false,
      position: 'before_char',
      priority: 10,
      depth: 4,
      probability: 100,
      tags: [],
    };
    updateLorebookAndSync((prev) => ({
      ...prev,
      entries: [newEntry, ...prev.entries],
    }));
    setSelectedEntryId(newEntry.id);
  };

  const handleDuplicateEntry = (entry: LorebookEntry) => {
    const copy: LorebookEntry = {
      ...entry,
      id: `entry-${Date.now()}`,
      comment: `${entry.comment || 'Entry'} (Copy)`,
      keys: [...entry.keys],
      secondary_keys: [...entry.secondary_keys],
      tags: [...(entry.tags || [])],
    };
    updateLorebookAndSync((prev) => ({
      ...prev,
      entries: [copy, ...prev.entries],
    }));
    setSelectedEntryId(copy.id);
  };

  const handleDeleteEntry = (id: string | number) => {
    updateLorebookAndSync((prev) => {
      const remaining = prev.entries.filter((e) => e.id !== id);
      return { ...prev, entries: remaining };
    });
  };

  const handleUpdateSelectedEntry = (patch: Partial<LorebookEntry>) => {
    if (!selectedEntry) return;
    updateLorebookAndSync((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.id === selectedEntry.id ? { ...e, ...patch } : e
      ),
    }));
  };

  const handleAddKeyChip = (
    type: 'keys' | 'secondary_keys',
    rawInput: string
  ) => {
    if (!selectedEntry || !rawInput.trim()) return;
    const newKeys = rawInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...selectedEntry[type], ...newKeys]));
    handleUpdateSelectedEntry({ [type]: merged });
    if (type === 'keys') setPrimaryKeyInput('');
    else setSecondaryKeyInput('');
  };

  const handleRemoveKeyChip = (
    type: 'keys' | 'secondary_keys',
    keyToRemove: string
  ) => {
    if (!selectedEntry) return;
    handleUpdateSelectedEntry({
      [type]: selectedEntry[type].filter((k) => k !== keyToRemove),
    });
  };

  const toggleEntryTag = (tagName: string) => {
    if (!selectedEntry) return;
    const current = selectedEntry.tags || [];
    const exists = current.includes(tagName);
    handleUpdateSelectedEntry({
      tags: exists
        ? current.filter((t) => t !== tagName)
        : [...current, tagName],
    });
  };

  // 1-Click AI Auto-Key Suggestion
  const handleSuggestTriggerKeysWithAI = async () => {
    if (!selectedEntry) return;
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSuggestingKeys(true);
    setAiKeyError(null);

    const prompt = [
      `Analyze this SillyTavern Lorebook / World Info entry and suggest 4 to 7 concise, high-signal trigger keywords or proper nouns that should activate this entry when mentioned in roleplay chat.`,
      `Entry Title: ${selectedEntry.comment || 'Untitled'}`,
      `Entry Content: ${selectedEntry.content || '(Empty)'}`,
      `Output ONLY a comma-separated list of trigger keywords (e.g., Ashen Reach, Hollow Bell, Warden Signet, Oakhaven). Do not include numbering or explanations.`,
    ].join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        `Lorebook: ${lorebook.name} (${lorebook.description})`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 120,
          temperature: 0.4,
          activeTheme,
          allTags: tags,
          characterTags: selectedEntry.tags,
        }
      );

      if (!controller.signal.aborted && detailed.content) {
        const suggested = detailed.content
          .split(/,|\n/)
          .map((s) => s.replace(/^[-*•\d.)\s]+|["'`]+$/g, '').trim())
          .filter((s) => s.length > 1 && s.length < 40);

        if (suggested.length > 0) {
          const merged = Array.from(
            new Set([...selectedEntry.keys, ...suggested])
          );
          handleUpdateSelectedEntry({ keys: merged });
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setAiKeyError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setAiKeyError({
          message: 'Failed to suggest trigger keys. Check AI connection.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSuggestingKeys(false);
      }
    }
  };

  const isBoundToActiveChar =
    character.character_book?.id === lorebook.id ||
    character.character_book?.name === lorebook.name;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Collapsible Lorebook Library Roster Sidebar */}
      {rosterOpen ? (
        <aside
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          className="w-full lg:w-72 shrink-0 rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Lorebook Roster ({lorebooks.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRosterOpen(false)}
              title="Collapse Lorebook Roster"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* + New Lorebook & Import Lorebook Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => createNewLorebook()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-slate-900 dark:bg-white px-2.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Book</span>
            </button>
            <button
              type="button"
              onClick={() => lorebookFileInputRef.current?.click()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-white dark:bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
            >
              <Upload
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Import JSON</span>
            </button>
          </div>
          <input
            ref={lorebookFileInputRef}
            type="file"
            accept=".json,.png,application/json,image/png"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                try {
                  await importFromFiles(e.target.files);
                } catch (err: unknown) {
                  setAiKeyError({
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Failed to import Lorebook file.',
                  });
                }
                e.target.value = '';
              }
            }}
          />

          {/* Search, Sort & Tag Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search lorebooks..."
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                aria-label="Sort Lorebooks"
                value={rosterSort}
                onChange={(e) =>
                  setRosterSort(e.target.value as RosterSortOption)
                }
                className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="modified_desc">Sort: Last Modified</option>
                <option value="name_asc">Sort: Name (A–Z)</option>
                <option value="name_desc">Sort: Name (Z–A)</option>
                <option value="tokens_desc">Sort: Tokens (High)</option>
                <option value="tokens_asc">Sort: Tokens (Low)</option>
              </select>

              <select
                aria-label="Filter Lorebooks by Tag"
                value={rosterTagFilter}
                onChange={(e) => setRosterTagFilter(e.target.value)}
                className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">All Tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lorebooks List */}
          <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-0.5">
            {filteredAndSortedLorebooks.map(({ lb, tokens }) => {
              const isSelected = lb.id === activeLorebookId;
              return (
                <div
                  key={lb.id}
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-lg border p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveLorebookId(lb.id!)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {lb.name || 'Untitled Lorebook'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {lb.entries.length} entries
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTargetLorebook(lb)}
                      title="Permanently Delete Lorebook"
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      {tokens.total.toLocaleString()} tkn
                    </span>
                    <span>Budget: {lb.token_budget}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          style={{ borderColor: 'var(--theme-accent)' }}
          className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shrink-0"
        >
          <PanelLeftOpen
            className="h-4 w-4"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span>Lorebooks ({lorebooks.length})</span>
        </button>
      )}

      {/* Main Lorebook Workbench Area */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        {/* Top Lorebook Header & Global Settings */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {lorebook.name || 'Untitled Lorebook'}
                </h1>
                <Tooltip content="SillyTavern World Info / Character Book settings and trigger entries." />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Constant: {activeLorebookTokens.constant} tkn · Triggered:{' '}
                {activeLorebookTokens.triggered} tkn · Budget:{' '}
                {lorebook.token_budget} tkn
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleBindToActiveCharacter}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
              >
                {syncSuccessBanner || isBoundToActiveChar ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Link2
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                )}
                <span>
                  {isBoundToActiveChar
                    ? `Bound to ${character.name}`
                    : `Bind to ${character.name}`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => exportLorebookAsJson(lorebook)}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Download
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Export .JSON</span>
              </button>

              <button
                type="button"
                onClick={handleCreateEntry}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Entry</span>
              </button>
            </div>
          </div>

          {/* Lorebook Metadata Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Lorebook Title
              </label>
              <input
                type="text"
                value={lorebook.name}
                onChange={(e) =>
                  updateLorebookAndSync((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Scan Depth</span>
                <Tooltip content="Number of recent chat messages scanned for Lorebook trigger keys." />
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={lorebook.scan_depth}
                onChange={(e) =>
                  updateLorebookAndSync((prev) => ({
                    ...prev,
                    scan_depth: Number(e.target.value),
                  }))
                }
                className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Token Budget</span>
                <Tooltip content="Maximum token budget allocated to activated Lorebook entries." />
              </label>
              <input
                type="number"
                min={128}
                max={16384}
                step={64}
                value={lorebook.token_budget}
                onChange={(e) =>
                  updateLorebookAndSync((prev) => ({
                    ...prev,
                    token_budget: Number(e.target.value),
                  }))
                }
                className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lorebook.recursive_scanning}
                  onChange={(e) =>
                    updateLorebookAndSync((prev) => ({
                      ...prev,
                      recursive_scanning: e.target.checked,
                    }))
                  }
                  style={{ accentColor: 'var(--theme-accent)' }}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Recursive Scan</span>
              </label>
            </div>
          </div>
        </div>

        {/* Split Grid: Left 5 Cols Entries List + Right 7 Cols Entry Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Columns: Entries List & Filter */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="lg:col-span-5 rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Entries ({filteredEntries.length} / {lorebook.entries.length})
              </h2>
              <button
                type="button"
                onClick={handleCreateEntry}
                className="text-xs font-semibold hover:underline cursor-pointer"
                style={{ color: 'var(--theme-accent)' }}
              >
                + Add Entry
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2 relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                  placeholder="Search entries or keys..."
                  className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <select
                aria-label="Filter Entries by Tag"
                value={entryTagFilter}
                onChange={(e) => setEntryTagFilter(e.target.value)}
                className="theme-focus-ring rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">All Tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5">
              {filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                const entryTokens = estimateTokens(entry.content);
                return (
                  <div
                    key={entry.id}
                    style={
                      isSelected
                        ? {
                            borderColor: 'var(--theme-accent)',
                            backgroundColor:
                              'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                          }
                        : undefined
                    }
                    className={`rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-slate-800/70'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={() =>
                            updateLorebookAndSync((prev) => ({
                              ...prev,
                              entries: prev.entries.map((e) =>
                                e.id === entry.id
                                  ? { ...e, enabled: !e.enabled }
                                  : e
                              ),
                            }))
                          }
                          style={{ accentColor: 'var(--theme-accent)' }}
                          className="h-3.5 w-3.5 cursor-pointer shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedEntryId(entry.id)}
                          className="text-left text-xs font-semibold text-slate-900 dark:text-white hover:underline truncate cursor-pointer"
                        >
                          {entry.comment || 'Untitled Entry'}
                        </button>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDuplicateEntry(entry)}
                          title="Duplicate Entry"
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          title="Delete Entry"
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Keys: {entry.keys.join(', ') || 'None'}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>
                        {entry.constant
                          ? 'Constant'
                          : entry.selective
                            ? 'Selective'
                            : 'Keyword'}{' '}
                        · Order {entry.insertion_order}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {entryTokens} tkn
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredEntries.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No Lorebook entries found. Click &ldquo;+ Add Entry&rdquo; to create one.
                </div>
              )}
            </div>
          </div>

          {/* Right 7 Columns: Selected Entry Editor */}
          <div className="lg:col-span-7">
            {selectedEntry ? (
              <div
                style={{ borderColor: 'var(--theme-accent)' }}
                className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
              >
                {/* Entry Title & Enabled Switch */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-medium text-slate-500">
                      Entry Title / Comment
                    </label>
                    <input
                      type="text"
                      value={selectedEntry.comment || ''}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({ comment: e.target.value })
                      }
                      placeholder="Entry title or summary..."
                      className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-4">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEntry.enabled}
                        onChange={(e) =>
                          handleUpdateSelectedEntry({
                            enabled: e.target.checked,
                          })
                        }
                        style={{ accentColor: 'var(--theme-accent)' }}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                </div>

                {aiKeyError && (
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">{aiKeyError.message}</div>
                        {aiKeyError.corsHint && (
                          <div className="text-[11px] opacity-90">
                            {aiKeyError.corsHint}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiKeyError(null)}
                      className="text-amber-700 dark:text-amber-300 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Trigger Keys & Secondary Keys with 1-Click AI Auto-Key Suggestion */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Primary Keys */}
                  <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Key
                          className="h-3.5 w-3.5"
                          style={{ color: 'var(--theme-accent)' }}
                        />
                        <span>Primary Trigger Keys</span>
                      </label>
                      <button
                        type="button"
                        disabled={isSuggestingKeys}
                        onClick={handleSuggestTriggerKeysWithAI}
                        style={{ borderColor: 'var(--theme-accent)' }}
                        className="theme-hover-outline flex items-center gap-1 rounded border bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                      >
                        {isSuggestingKeys ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            style={{ color: 'var(--theme-accent)' }}
                          />
                        ) : (
                          <Sparkles
                            className="h-3 w-3"
                            style={{ color: 'var(--theme-accent)' }}
                          />
                        )}
                        <span>AI Suggest Keys</span>
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={primaryKeyInput}
                        onChange={(e) => setPrimaryKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddKeyChip('keys', primaryKeyInput);
                          }
                        }}
                        placeholder="Add key(s), comma-separated..."
                        className="theme-focus-ring flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleAddKeyChip('keys', primaryKeyInput)
                        }
                        className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedEntry.keys.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200"
                        >
                          <span>{k}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyChip('keys', k)}
                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Secondary Selective Keys */}
                  <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span>Secondary Keys (Selective)</span>
                        <Tooltip content="When Selective mode is enabled, at least one secondary key must also appear alongside a primary key." />
                      </label>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={secondaryKeyInput}
                        onChange={(e) => setSecondaryKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddKeyChip(
                              'secondary_keys',
                              secondaryKeyInput
                            );
                          }
                        }}
                        placeholder="Add secondary key(s)..."
                        className="theme-focus-ring flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleAddKeyChip('secondary_keys', secondaryKeyInput)
                        }
                        className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedEntry.secondary_keys.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200"
                        >
                          <span>{k}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveKeyChip('secondary_keys', k)
                            }
                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SmartEditor for Lorebook Entry Content */}
                <SmartEditor
                  label={`Entry Content · ${selectedEntry.comment || 'World Info'}`}
                  fieldKey="lorebook_entry_content"
                  value={selectedEntry.content}
                  onChange={(val) =>
                    handleUpdateSelectedEntry({ content: val })
                  }
                  tooltip="Worldbuilding facts, faction lore, or environmental rules injected into the prompt when triggered."
                  rows={6}
                  isPermanentTokenField={selectedEntry.constant}
                  extraContextSummary={`Lorebook: ${lorebook.name}\nEntry Title: ${selectedEntry.comment || ''}\nTrigger Keys: ${selectedEntry.keys.join(', ')}`}
                  additionalTags={selectedEntry.tags}
                />

                {/* Insertion Order, Position & Trigger Flags */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Insertion Position</span>
                      <Tooltip content="Controls where in the prompt stack this entry is injected." />
                    </label>
                    <select
                      value={selectedEntry.position}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          position: e.target.value as LorebookPosition,
                        })
                      }
                      className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white cursor-pointer"
                    >
                      {LOREBOOK_POSITIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Insertion Order</span>
                      <Tooltip content="Higher numbers are inserted closer to the bottom of the prompt (higher influence)." />
                    </label>
                    <input
                      type="number"
                      value={selectedEntry.insertion_order}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          insertion_order: Number(e.target.value),
                        })
                      }
                      className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Depth (when at_depth)</span>
                      <Tooltip content="Chat history depth from the bottom when position is set to at_depth." />
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedEntry.depth ?? 4}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          depth: Number(e.target.value),
                        })
                      }
                      className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>
                </div>

                {/* Boolean Trigger Switches */}
                <div className="flex flex-wrap items-center gap-6 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={selectedEntry.constant}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          constant: e.target.checked,
                        })
                      }
                      style={{ accentColor: 'var(--theme-accent)' }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span>Constant (Always Active)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={selectedEntry.selective}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          selective: e.target.checked,
                        })
                      }
                      style={{ accentColor: 'var(--theme-accent)' }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span>Selective (Require Secondary Key)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={selectedEntry.case_sensitive}
                      onChange={(e) =>
                        handleUpdateSelectedEntry({
                          case_sensitive: e.target.checked,
                        })
                      }
                      style={{ accentColor: 'var(--theme-accent)' }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span>Case Sensitive Keys</span>
                  </label>
                </div>

                {/* Entry Semantic Tags */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>Entry Semantic Tags (Injected into AI Assist)</span>
                    <Tooltip content="Tags attached to this Lorebook entry automatically provide their AI Context Descriptions when generating or expanding this entry." />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active = (selectedEntry.tags || []).includes(
                        tag.name
                      );
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleEntryTag(tag.name)}
                          style={
                            active
                              ? {
                                  borderColor: tag.color,
                                  backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                                }
                              : undefined
                          }
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'text-slate-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                }}
                className="rounded-xl border bg-white dark:bg-slate-900 p-8 text-center space-y-3"
              >
                <Cpu
                  className="mx-auto h-6 w-6"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  No Lorebook Entry Selected
                </div>
                <p className="text-xs text-slate-500">
                  Select an entry from the list or create a new World Info entry to start editing.
                </p>
                <button
                  type="button"
                  onClick={handleCreateEntry}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline inline-flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Entry</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Permanent Delete Lorebook Confirmation Modal */}
      {deleteTargetLorebook && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="w-full max-w-md rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Permanently Delete Lorebook?
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTargetLorebook(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 dark:text-white">
                {deleteTargetLorebook.name || 'Untitled Lorebook'}
              </strong>{' '}
              ({deleteTargetLorebook.entries.length} entries) from your library and local storage? This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetLorebook(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteTargetLorebook.id) {
                    deleteLorebook(deleteTargetLorebook.id);
                  }
                  setDeleteTargetLorebook(null);
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
