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
  Sliders,
  Wand2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  RefreshCw,
  FolderOpen,
  ShieldAlert,
  Image as ImageIcon,
} from 'lucide-react';
import { useStore, isLorebookNsfw } from '../context/StoreContext';
import {
  Lorebook,
  LorebookEntry,
  LorebookPosition,
  RosterSortOption,
} from '../types';
import { SmartEditor } from './SmartEditor';
import { Tooltip } from './Tooltip';
import { isTagNsfw, TagSelector } from './TagSelector';
import {
  calculateLorebookTokens,
  estimateTokens,
} from '../utils/tokenCounter';
import {
  compressImageForVision,
  exportLorebookAsJson,
  readImageFileAsDataUrl,
} from '../utils/cardIO';
import {
  AIServiceError,
  doesBackendSupportVision,
  generateCompletionDetailed,
} from '../services/aiService';

const LOREBOOK_POSITIONS: { value: LorebookPosition; label: string }[] = [
  { value: 'before_char', label: 'Before Character Defs (before_char)' },
  { value: 'after_char', label: 'After Character Defs (after_char)' },
  { value: 'an_top', label: "Top of Author's Note (an_top)" },
  { value: 'an_bottom', label: "Bottom of Author's Note (an_bottom)" },
  { value: 'at_depth', label: 'At Custom Chat Depth (at_depth)' },
];

const LOREBOOK_WIZARD_STEPS = [
  {
    step: 1,
    title: 'World Concept & Meta',
    subtitle: 'Title, tags & ✨ AI Multi-Entry Generator',
  },
  {
    step: 2,
    title: 'Core Entries Builder',
    subtitle: 'Factions, locations, systems & ✨ AI Entry Assist',
  },
  {
    step: 3,
    title: 'Trigger Keys & Rules',
    subtitle: 'Primary/Secondary keys & ✨ AI Key Suggest',
  },
  {
    step: 4,
    title: 'Budget & Mechanics',
    subtitle: 'Scan depth, token budget, order & positions',
  },
  {
    step: 5,
    title: 'Review, Bind & Export',
    subtitle: 'Token audit, 1-click Character bind & JSON export',
  },
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
    characters,
    character,
    updateCharacterField,
    bindLorebookToCharacter,
    tags,
    ensureTagRegistered,
    activeTheme,
    aiConfig,
    settings,
    updateSettings,
    importFromFiles,
    checkAndTriggerNameConflict,
  } = useStore();

  // Lorebook Roster Sidebar State
  const [rosterOpen, setRosterOpen] = useState(true);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTagFilter, setRosterTagFilter] = useState<string>('all');
  const [rosterSort, setRosterSort] = useState<RosterSortOption>('modified_desc');
  const [deleteTargetLorebook, setDeleteTargetLorebook] =
    useState<Lorebook | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importStatusBanner, setImportStatusBanner] = useState<string | null>(
    null
  );
  const [newCustomTagInput, setNewCustomTagInput] = useState('');
  const lorebookFileInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-Drop Reordering for Lorebook Entries
  const [draggedEntryId, setDraggedEntryId] = useState<string | number | null>(
    null
  );
  const [dragOverEntryId, setDragOverEntryId] = useState<
    string | number | null
  >(null);

  // 5-Step Lorebook Wizard State
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [worldConceptPrompt, setWorldConceptPrompt] = useState<string>('');
  const [isGeneratingMultiLore, setIsGeneratingMultiLore] =
    useState<boolean>(false);
  const [entryDraftPrompt, setEntryDraftPrompt] = useState<string>('');
  const [isDraftingEntryContent, setIsDraftingEntryContent] =
    useState<boolean>(false);
  const [suggestingEntryId, setSuggestingEntryId] = useState<
    string | number | null
  >(null);
  const [boundCharacterNotice, setBoundCharacterNotice] = useState<
    string | null
  >(null);

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

  // Temporary Reference Image State for Lorebook AI Assist (never saved into Lorebook JSON)
  const [loreTempRefImageUrl, setLoreTempRefImageUrl] = useState<string | null>(
    null
  );
  const [loreTempRefImageName, setLoreTempRefImageName] = useState<string>('');
  const [visionFallbackBanner, setVisionFallbackBanner] = useState<
    string | null
  >(null);
  const loreTempRefInputRef = useRef<HTMLInputElement | null>(null);

  const visionSupported = useMemo(
    () => doesBackendSupportVision(aiConfig),
    [aiConfig]
  );

  const handleLoadLoreTempReferenceFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAiKeyError({
        message: 'Please select or drop a valid image file (PNG, JPEG, WebP).',
      });
      return;
    }
    try {
      const rawUrl = await readImageFileAsDataUrl(file);
      const compressed = await compressImageForVision(rawUrl, 512);
      setLoreTempRefImageUrl(compressed);
      setLoreTempRefImageName(file.name);
      setAiKeyError(null);
    } catch (err) {
      setAiKeyError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to compress reference image for vision.',
      });
    }
  };
  const [syncSuccessBanner, setSyncSuccessBanner] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const handleLorebookFilesDropped = async (
    files: FileList | File[] | null
  ) => {
    if (!files || files.length === 0) return;
    try {
      const res = await importFromFiles(files);
      setImportStatusBanner(res.summary);
      window.setTimeout(() => setImportStatusBanner(null), 4000);
    } catch (err: unknown) {
      setAiKeyError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to import Lorebook or Character file.',
      });
    }
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Keep selectedEntryId valid when switching lorebooks
  useEffect(() => {
    if (!lorebook.entries.some((e) => e.id === selectedEntryId)) {
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
      if (settings.hideNsfwTags && isLorebookNsfw(lb, tags)) {
        return false;
      }
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
  }, [
    lorebooksWithTokens,
    rosterSearch,
    rosterTagFilter,
    rosterSort,
    settings.hideNsfwTags,
    tags,
  ]);

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

  const handleDropReorderEntries = (
    fromId: string | number,
    toId: string | number
  ) => {
    if (fromId === toId) return;
    updateLorebookAndSync((prev) => {
      const fromIdx = prev.entries.findIndex((e) => e.id === fromId);
      const toIdx = prev.entries.findIndex((e) => e.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev.entries];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...prev, entries: next };
    });
  };

  const toggleLorebookGlobalTag = (tagName: string) => {
    ensureTagRegistered(tagName);
    updateLorebookAndSync((prev) => {
      const current = prev.tags || [];
      const exists = current.includes(tagName);
      return {
        ...prev,
        tags: exists
          ? current.filter((t) => t !== tagName)
          : [...current, tagName],
      };
    });
  };

  const handleAddCustomLorebookTag = (directTagName?: string) => {
    const clean = (directTagName ?? newCustomTagInput).trim();
    if (!clean) return;
    const registered = ensureTagRegistered(clean);
    const tagName = registered ? registered.name : clean;
    updateLorebookAndSync((prev) => {
      const current = prev.tags || [];
      if (current.includes(tagName)) return prev;
      return {
        ...prev,
        tags: [...current, tagName],
      };
    });
    setNewCustomTagInput('');
  };

  const handleBindToActiveCharacter = () => {
    updateCharacterField('character_book', lorebook);
    setSyncSuccessBanner(true);
    window.setTimeout(() => setSyncSuccessBanner(false), 3000);
  };

  const handleBindToAnyCharacter = (charId: string, charName: string) => {
    bindLorebookToCharacter(charId, lorebook);
    setBoundCharacterNotice(`Bound "${lorebook.name}" to ${charName}.`);
    window.setTimeout(() => setBoundCharacterNotice(null), 3500);
  };

  // Entry CRUD Handlers
  const handleCreateEntry = (customCategoryLabel?: string) => {
    const newEntry: LorebookEntry = {
      id: `entry-${Date.now()}`,
      comment:
        customCategoryLabel ||
        `New World Info Entry #${lorebook.entries.length + 1}`,
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
      tags: [...(lorebook.tags || [])],
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

  const handleUpdateEntryById = (
    id: string | number,
    patch: Partial<LorebookEntry>
  ) => {
    updateLorebookAndSync((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const handleUpdateSelectedEntry = (patch: Partial<LorebookEntry>) => {
    if (!selectedEntry) return;
    handleUpdateEntryById(selectedEntry.id, patch);
  };

  const handleAddKeyChip = (
    type: 'keys' | 'secondary_keys',
    rawInput: string,
    targetEntry?: LorebookEntry
  ) => {
    const entry = targetEntry || selectedEntry;
    if (!entry || !rawInput.trim()) return;
    const newKeys = rawInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...entry[type], ...newKeys]));
    handleUpdateEntryById(entry.id, { [type]: merged });
    if (!targetEntry) {
      if (type === 'keys') setPrimaryKeyInput('');
      else setSecondaryKeyInput('');
    }
  };

  const handleRemoveKeyChip = (
    type: 'keys' | 'secondary_keys',
    keyToRemove: string,
    targetEntry?: LorebookEntry
  ) => {
    const entry = targetEntry || selectedEntry;
    if (!entry) return;
    handleUpdateEntryById(entry.id, {
      [type]: entry[type].filter((k) => k !== keyToRemove),
    });
  };

  const toggleEntryTag = (tagName: string) => {
    if (!selectedEntry) return;
    ensureTagRegistered(tagName);
    const current = selectedEntry.tags || [];
    const exists = current.includes(tagName);
    handleUpdateSelectedEntry({
      tags: exists
        ? current.filter((t) => t !== tagName)
        : [...current, tagName],
    });
  };

  const handleAddCustomEntryTag = (directTagName?: string) => {
    if (!selectedEntry) return;
    const clean = (directTagName ?? newCustomTagInput).trim();
    if (!clean) return;
    const registered = ensureTagRegistered(clean);
    const tagName = registered ? registered.name : clean;
    const current = selectedEntry.tags || [];
    if (!current.includes(tagName)) {
      handleUpdateSelectedEntry({
        tags: [...current, tagName],
      });
    }
    setNewCustomTagInput('');
  };

  // Wizard Step 1: "✨ AI Generate Multi-Entry Lorebook from Concept"
  const handleGenerateMultiEntryLorebook = async (e: React.FormEvent) => {
    e.preventDefault();
    const useRefImage = Boolean(visionSupported && loreTempRefImageUrl);
    if (!worldConceptPrompt.trim() && !useRefImage) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingMultiLore(true);
    setAiKeyError(null);
    setVisionFallbackBanner(null);

    const prompt = [
      worldConceptPrompt.trim()
        ? `Design a rich SillyTavern World Info / Lorebook based on this concept: "${worldConceptPrompt.trim()}"`
        : `Design a rich SillyTavern World Info / Lorebook inspired directly by the attached Reference Image.`,
      useRefImage
        ? `A Reference Image is attached (~260 tokens). Inspect the visual setting, architecture, atmosphere, items, or entities in the image and incorporate them into the generated Lorebook entries.`
        : '',
      lorebook.name && lorebook.name !== 'New Lorebook'
        ? `Lorebook Title: ${lorebook.name}`
        : '',
      `Return a valid JSON object with this exact schema (containing 4 distinct, high-craft entries covering Locations, Factions, Lore/Rules, and Key Entities):`,
      `{`,
      `  "name": "Lorebook Title",`,
      `  "description": "Concise 1-2 sentence overview of the world setting",`,
      `  "entries": [`,
      `    {`,
      `      "comment": "Entry Title (e.g. Location, Faction, Magic/Tech System)",`,
      `      "keys": ["primary keyword 1", "primary keyword 2", "proper noun"],`,
      `      "secondary_keys": [],`,
      `      "content": "Detailed 1-2 paragraph worldbuilding lore ready for SillyTavern prompt injection.",`,
      `      "constant": false,`,
      `      "insertion_order": 100`,
      `    }`,
      `  ]`,
      `}`,
      `Output ONLY valid JSON without markdown codeblocks or extra commentary.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        `Active Context Theme: ${activeTheme.name}\nLorebook Description: ${lorebook.description}`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 1400,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: lorebook.tags || [],
          imageDataUrl: useRefImage ? loreTempRefImageUrl! : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const jsonMatch = detailed.content.match(/\{[\s\S]*\}/);
        const rawJson = jsonMatch ? jsonMatch[0] : detailed.content;
        const parsed = JSON.parse(rawJson) as {
          name?: string;
          description?: string;
          entries?: Array<{
            comment?: string;
            keys?: string[];
            secondary_keys?: string[];
            content?: string;
            constant?: boolean;
            insertion_order?: number;
          }>;
        };

        const builtEntries: LorebookEntry[] = (parsed.entries || []).map(
          (item, idx) => ({
            id: `entry-${Date.now()}-${idx}`,
            comment: item.comment || `Lore Entry #${idx + 1}`,
            keys:
              Array.isArray(item.keys) && item.keys.length > 0
                ? item.keys
                : ['world'],
            secondary_keys: Array.isArray(item.secondary_keys)
              ? item.secondary_keys
              : [],
            content: item.content || '',
            enabled: true,
            insertion_order:
              typeof item.insertion_order === 'number'
                ? item.insertion_order
                : 100 - idx * 5,
            case_sensitive: false,
            constant: Boolean(item.constant) || idx === 0,
            selective: false,
            position: 'before_char',
            priority: 10,
            depth: 4,
            probability: 100,
            tags: [...(lorebook.tags || [])],
          })
        );

        updateLorebookAndSync((prev) => ({
          ...prev,
          name: parsed.name || prev.name,
          description: parsed.description || prev.description,
          entries:
            builtEntries.length > 0
              ? [...builtEntries, ...prev.entries]
              : prev.entries,
        }));

        if (builtEntries[0]) {
          setSelectedEntryId(builtEntries[0].id);
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
          message:
            err instanceof Error
              ? `Could not parse AI Lorebook response: ${err.message}`
              : 'Failed to generate multi-entry lorebook.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingMultiLore(false);
      }
    }
  };

  // Wizard Step 2: Per-Entry "✨ AI Assist" Draft from Short Prompt (supports Temporary Reference Image)
  const handleDraftSelectedEntryWithAI = async () => {
    if (!selectedEntry) return;
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setIsDraftingEntryContent(true);
    setAiKeyError(null);
    setVisionFallbackBanner(null);

    const useRefImage = Boolean(visionSupported && loreTempRefImageUrl);

    const prompt = [
      `Write a rich, atmospheric SillyTavern World Info / Lorebook entry (1 to 2 concise paragraphs) for:`,
      `Entry Title: "${selectedEntry.comment || 'World Lore'}"`,
      entryDraftPrompt.trim()
        ? `Specific Directive / Concept: "${entryDraftPrompt.trim()}"`
        : '',
      useRefImage
        ? `A Reference Image is attached (~260 tokens). Describe the location, item, outfit, faction, or entity shown in the attached picture with vivid worldbuilding detail.`
        : '',
      selectedEntry.keys.length > 0
        ? `Associated Keywords: ${selectedEntry.keys.join(', ')}`
        : '',
      `Focus on concrete worldbuilding facts, sensory details, faction rules, or narrative hooks that help the AI roleplay accurately. Output ONLY the lore entry text.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        `Lorebook: ${lorebook.name} (${lorebook.description})`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 450,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: selectedEntry.tags || lorebook.tags || [],
          imageDataUrl: useRefImage ? loreTempRefImageUrl! : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        handleUpdateSelectedEntry({ content: detailed.content.trim() });
        setEntryDraftPrompt('');
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
          message: 'Failed to draft entry content with AI.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsDraftingEntryContent(false);
      }
    }
  };

  // 1-Click AI Auto-Key Suggestion (works for selectedEntry or any entry passed in Wizard Step 3)
  const handleSuggestTriggerKeysForEntry = async (targetEntry?: LorebookEntry) => {
    const entry = targetEntry || selectedEntry;
    if (!entry) return;
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSuggestingKeys(true);
    setSuggestingEntryId(entry.id);
    setAiKeyError(null);

    const prompt = [
      `Analyze this SillyTavern Lorebook / World Info entry and suggest 4 to 7 concise, high-signal trigger keywords or proper nouns that should activate this entry when mentioned in roleplay chat.`,
      `Entry Title: ${entry.comment || 'Untitled'}`,
      `Entry Content: ${entry.content || '(Empty)'}`,
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
          characterTags: entry.tags || lorebook.tags,
        }
      );

      if (!controller.signal.aborted && detailed.content) {
        const suggested = detailed.content
          .split(/,|\n/)
          .map((s) => s.replace(/^[-*•\d.)\s]+|["'`]+$/g, '').trim())
          .filter((s) => s.length > 1 && s.length < 40);

        if (suggested.length > 0) {
          const merged = Array.from(new Set([...entry.keys, ...suggested]));
          handleUpdateEntryById(entry.id, { keys: merged });
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
        setSuggestingEntryId(null);
      }
    }
  };

  const isBoundToActiveChar =
    character.character_book?.id === lorebook.id ||
    character.character_book?.name === lorebook.name;

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setIsDraggingFile(false);
          void handleLorebookFilesDropped(e.dataTransfer.files);
        }
      }}
      className="flex flex-col lg:flex-row gap-6 items-start min-w-0 w-full"
    >
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

          {/* + New Lorebook, Import Lorebook & Rescan Save Folder Buttons */}
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
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleLorebookFilesDropped(e.target.files);
                e.target.value = '';
              }
            }}
          />

          {/* Drag & Drop Lorebook JSON / PNG Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              void handleLorebookFilesDropped(e.dataTransfer.files);
            }}
            onClick={() => lorebookFileInputRef.current?.click()}
            style={
              isDraggingFile ? { borderColor: 'var(--theme-accent)' } : undefined
            }
            className={`rounded-lg border border-dashed p-2.5 text-center text-[11px] transition-colors cursor-pointer ${
              isDraggingFile
                ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            Drop SillyTavern <strong>.JSON</strong> Lorebook or <strong>.PNG</strong> Card here
          </div>

          {importStatusBanner && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
              {importStatusBanner}
            </div>
          )}

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
                {tags
                  .filter((t) => !settings.hideNsfwTags || !isTagNsfw(t))
                  .map((t) => (
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
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {lb.name || 'Untitled Lorebook'}
                        </div>
                        {isLorebookNsfw(lb, tags) && (
                          <span className="shrink-0 rounded bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 font-mono text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">
                            NSFW
                          </span>
                        )}
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

            {filteredAndSortedLorebooks.length === 0 && (
              <div className="py-6 px-3 text-center text-xs text-slate-400 space-y-1.5">
                {lorebooks.length === 0 ? (
                  <>
                    <div className="font-medium text-slate-500 dark:text-slate-300">
                      Lorebook Roster is Empty
                    </div>
                    <div>
                      Click <strong>+ New</strong> above, start editing on the right, or drop a SillyTavern <code>.JSON</code> World Book here.
                    </div>
                  </>
                ) : (
                  <div>No lorebooks match your filter.</div>
                )}
              </div>
            )}
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
        {/* Top Lorebook Header & Mode Switcher */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  {lorebook.name || 'Untitled Lorebook'}
                </h1>
                {isLorebookNsfw(lorebook, tags) && (
                  <span
                    title="Automatically flagged NSFW because an NSFW (18+) tag is attached or manual NSFW flag is enabled."
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-600 dark:text-rose-300"
                  >
                    <ShieldAlert className="h-3 w-3" />
                    <span>🔞 NSFW</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    updateLorebookAndSync((prev) => ({
                      ...prev,
                      isNsfw: !prev.isNsfw,
                    }))
                  }
                  title="Toggle explicit manual NSFW flag on this lorebook (lorebooks with NSFW tags are also auto-flagged NSFW)"
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-colors ${
                    lorebook.isNsfw
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {lorebook.isNsfw ? 'Manual NSFW: ON' : 'Flag NSFW'}
                </button>
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
                onClick={() => handleCreateEntry()}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Entry</span>
              </button>
            </div>
          </div>

          {/* Lorebook Metadata Row */}
          <div
            style={{
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
            }}
            className="grid gap-3 items-end"
          >
            <div className="space-y-1">
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
                onBlur={(e) => {
                  if (lorebook.id) {
                    checkAndTriggerNameConflict(
                      'lorebook',
                      lorebook.id,
                      e.target.value,
                      'rename'
                    );
                  }
                }}
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

            <div className="pb-1.5">
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

        {/* AI Error Banner */}
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

        {/* MODE A: 5-STEP LOREBOOK WIZARD */}
        {settings.editorMode === 'wizard' ? (
          <div className="space-y-6">
            {/* Stepper Header */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-4"
            >
              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
                }}
                className="grid gap-2"
              >
                {LOREBOOK_WIZARD_STEPS.map((item) => {
                  const isCurrent = wizardStep === item.step;
                  const isCompleted = wizardStep > item.step;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setWizardStep(item.step)}
                      style={
                        isCurrent
                          ? {
                              borderColor: 'var(--theme-accent)',
                              backgroundColor:
                                'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
                            }
                          : undefined
                      }
                      className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'text-slate-900 dark:text-white'
                          : isCompleted
                            ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-700 dark:text-slate-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>
                          0{item.step}. {item.title}
                        </span>
                        {isCompleted && (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] opacity-80 truncate">
                        {item.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 1: World / Lore Concept & Metadata */}
            {wizardStep === 1 && (
              <div className="space-y-6">
                <form
                  onSubmit={handleGenerateMultiEntryLorebook}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className="h-4 w-4"
                        style={{ color: 'var(--theme-accent)' }}
                      />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        ✨ AI Generate Multi-Entry Lorebook from Concept
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500">
                      Uses Active Theme ({activeTheme.name}) &amp; Lorebook Tags
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Describe your world setting, faction conflict, or magic/tech rules in 1–3 sentences. TavernSmith will automatically draft a multi-entry Lorebook with trigger keys.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={worldConceptPrompt}
                      onChange={(e) => setWorldConceptPrompt(e.target.value)}
                      placeholder="e.g., A sunken bioluminescent archipelago ruled by rival deep-sea salvage guilds and ancient leviathan cults..."
                      className="theme-focus-ring flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={
                        isGeneratingMultiLore ||
                        (!worldConceptPrompt.trim() &&
                          !(visionSupported && loreTempRefImageUrl))
                      }
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {isGeneratingMultiLore ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Generating Entries...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>✨ AI Generate Multi-Entry Lorebook</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Hidden File Input for Temporary Reference Image in Lorebook */}
                  <input
                    ref={loreTempRefInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        void handleLoadLoreTempReferenceFile(f);
                      }
                      e.target.value = '';
                    }}
                  />

                  {visionSupported && (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) void handleLoadLoreTempReferenceFile(f);
                      }}
                      className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-xs"
                    >
                      {loreTempRefImageUrl ? (
                        <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1">
                          <img
                            src={loreTempRefImageUrl}
                            alt="Lorebook Temp Reference"
                            className="h-6 w-6 rounded object-cover"
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                            {loreTempRefImageName || 'Reference Image'}
                          </span>
                          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                            👁️ ~260 tok JPEG (Temp Ref)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setLoreTempRefImageUrl(null);
                              setLoreTempRefImageName('');
                            }}
                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => loreTempRefInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <ImageIcon
                            className="h-3.5 w-3.5"
                            style={{ color: 'var(--theme-accent)' }}
                          />
                          <span>
                            👁️ Drop or Select Temp Reference Image (~260 tok · Never saved to JSON)
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </form>

                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    World Metadata &amp; Global Semantic Tags
                  </h3>

                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                    }}
                    className="grid gap-4"
                  >
                    <div className="space-y-1">
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
                        onBlur={(e) => {
                          if (lorebook.id) {
                            checkAndTriggerNameConflict(
                              'lorebook',
                              lorebook.id,
                              e.target.value,
                              'rename'
                            );
                          }
                        }}
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        World Synopsis / Description
                      </label>
                      <input
                        type="text"
                        value={lorebook.description}
                        onChange={(e) =>
                          updateLorebookAndSync((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="High-level summary of this Lorebook..."
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <TagSelector
                    tags={tags}
                    selectedTagNames={lorebook.tags || []}
                    onToggleTag={toggleLorebookGlobalTag}
                    onAddCustomTag={(tagName) => handleAddCustomLorebookTag(tagName)}
                    label="Global Lorebook Semantic Tags (Injected into AI Lore Generation)"
                    tooltip="Attach tags from the 64+ SFW & NSFW Tag Library to guide multi-entry worldbuilding and lore generation."
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Core Entries & Entities Builder */}
            {wizardStep === 2 && (
              <div className="space-y-5">
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Quick-Add World Entity Archetypes
                    </h3>
                    <p className="text-xs text-slate-500">
                      Add structured entries for Factions, Locations, Magic/Tech Systems, Key NPCs, or Artifacts.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      'Faction: New Syndicate',
                      'Location: Landmark',
                      'System: Magic / Tech Rules',
                      'NPC: Notable Figure',
                      'Artifact: Relic / Item',
                    ].map((presetLabel) => (
                      <button
                        key={presetLabel}
                        type="button"
                        onClick={() => handleCreateEntry(presetLabel)}
                        style={{ borderColor: 'var(--theme-accent)' }}
                        className="theme-hover-outline rounded-lg border bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        + {presetLabel.split(':')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                  }}
                  className="grid gap-6 items-start"
                >
                  {/* Left: Entry Selector Cards with Drag-and-Drop Reordering */}
                  <div
                    style={{
                      borderColor:
                        'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                    }}
                    className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        Lorebook Entries ({lorebook.entries.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCreateEntry()}
                        className="text-xs font-semibold hover:underline cursor-pointer"
                        style={{ color: 'var(--theme-accent)' }}
                      >
                        + Blank Entry
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                      {lorebook.entries.map((entry) => {
                        const isSelected = selectedEntry?.id === entry.id;
                        const isDragOver = dragOverEntryId === entry.id;
                        return (
                          <div
                            key={entry.id}
                            draggable
                            onDragStart={() => setDraggedEntryId(entry.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (
                                draggedEntryId !== null &&
                                draggedEntryId !== entry.id
                              ) {
                                setDragOverEntryId(entry.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverEntryId === entry.id) {
                                setDragOverEntryId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedEntryId !== null) {
                                handleDropReorderEntries(
                                  draggedEntryId,
                                  entry.id
                                );
                              }
                              setDraggedEntryId(null);
                              setDragOverEntryId(null);
                            }}
                            onDragEnd={() => {
                              setDraggedEntryId(null);
                              setDragOverEntryId(null);
                            }}
                            style={
                              isSelected
                                ? {
                                    borderColor: 'var(--theme-accent)',
                                    backgroundColor:
                                      'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                                  }
                                : isDragOver
                                  ? { borderColor: 'var(--theme-accent)' }
                                  : undefined
                            }
                            className={`rounded-lg border p-3 transition-colors ${
                              isSelected
                                ? 'bg-slate-50 dark:bg-slate-800/70'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span
                                  title="Drag to reorder entry"
                                  className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntryId(entry.id)}
                                  className="flex-1 text-left text-xs font-semibold text-slate-900 dark:text-white truncate cursor-pointer"
                                >
                                  {entry.comment || 'Untitled Entry'}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                              {entry.content || 'No content drafted yet...'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Guided Entry Content Builder with ✨ AI Assist */}
                  <div
                    style={{ borderColor: 'var(--theme-accent)' }}
                    className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                  >
                    {selectedEntry ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Entry Title / Entity Name
                          </label>
                          <input
                            type="text"
                            value={selectedEntry.comment || ''}
                            onChange={(e) =>
                              handleUpdateSelectedEntry({
                                comment: e.target.value,
                              })
                            }
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        {/* Per-Entry ✨ AI Assist Draft Bar */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              ✨ AI Assist Entry Drafter
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Drafts lore from title &amp; optional prompt
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={entryDraftPrompt}
                              onChange={(e) =>
                                setEntryDraftPrompt(e.target.value)
                              }
                              placeholder="Optional note (e.g. 'Secretive guild of chronomancers operating under the clocktower')..."
                              className="theme-focus-ring flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              disabled={isDraftingEntryContent}
                              onClick={handleDraftSelectedEntryWithAI}
                              style={{ borderColor: 'var(--theme-accent)' }}
                              className="theme-hover-outline flex items-center justify-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              {isDraftingEntryContent ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              <span>✨ AI Assist Draft</span>
                            </button>
                          </div>

                          {visionSupported && (
                            <div
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const f = e.dataTransfer.files?.[0];
                                if (f) void handleLoadLoreTempReferenceFile(f);
                              }}
                              className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70 text-[11px]"
                            >
                              {loreTempRefImageUrl ? (
                                <div className="flex items-center gap-2">
                                  <img
                                    src={loreTempRefImageUrl}
                                    alt="Entry Reference"
                                    className="h-5 w-5 rounded object-cover"
                                  />
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                                    {loreTempRefImageName || 'Reference Image'}
                                  </span>
                                  <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
                                    👁️ ~260 tok JPEG (Temp Ref)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLoreTempRefImageUrl(null);
                                      setLoreTempRefImageName('');
                                    }}
                                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => loreTempRefInputRef.current?.click()}
                                  className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                                >
                                  <ImageIcon
                                    className="h-3.5 w-3.5"
                                    style={{ color: 'var(--theme-accent)' }}
                                  />
                                  <span>
                                    👁️ Attach Temp Reference Image for Location / Item / Entity (~260 tok)
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {visionFallbackBanner && (
                          <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                              <span>{visionFallbackBanner}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setVisionFallbackBanner(null)}
                              className="text-amber-700 dark:text-amber-300 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <SmartEditor
                          label={`Entry Content · ${selectedEntry.comment || 'World Info'}`}
                          fieldKey="lorebook_entry_content"
                          value={selectedEntry.content}
                          onChange={(val) =>
                            handleUpdateSelectedEntry({ content: val })
                          }
                          tooltip="Worldbuilding facts, faction lore, or environmental rules injected into the prompt when triggered."
                          rows={7}
                          isPermanentTokenField={selectedEntry.constant}
                          extraContextSummary={`Lorebook: ${lorebook.name}\nEntry Title: ${selectedEntry.comment || ''}\nTrigger Keys: ${selectedEntry.keys.join(', ')}`}
                          additionalTags={selectedEntry.tags}
                          enablePortraitVision={false}
                        />
                      </>
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Select or create an entry to start drafting.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Trigger Keys & Discovery Rules */}
            {wizardStep === 3 && (
              <div
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                }}
                className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Trigger Keys &amp; Discovery Rules Across Entries
                    </h3>
                    <p className="text-xs text-slate-500">
                      Configure Primary <code className="font-mono">keys</code> and Selective <code className="font-mono">secondary_keys</code>, or click <strong>✨ AI Suggest Trigger Keys from Content</strong> on any entry.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                  }}
                  className="grid gap-4"
                >
                  {lorebook.entries.map((entry) => {
                    const isBusy =
                      isSuggestingKeys && suggestingEntryId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {entry.comment || 'Untitled Entry'}
                          </div>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleSuggestTriggerKeysForEntry(entry)
                            }
                            style={{ borderColor: 'var(--theme-accent)' }}
                            className="theme-hover-outline inline-flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                          >
                            {isBusy ? (
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
                            <span>✨ AI Suggest Trigger Keys from Content</span>
                          </button>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Primary Trigger Keys (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={entry.keys.join(', ')}
                            onChange={(e) =>
                              handleUpdateEntryById(entry.id, {
                                keys: e.target.value
                                  .split(',')
                                  .map((k) => k.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="e.g. Oakhaven, Hollow Bell, Warden"
                            className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Secondary Keys (Selective Mode)
                          </label>
                          <input
                            type="text"
                            value={entry.secondary_keys.join(', ')}
                            onChange={(e) =>
                              handleUpdateEntryById(entry.id, {
                                secondary_keys: e.target.value
                                  .split(',')
                                  .map((k) => k.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Optional secondary filter keys..."
                            className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4: Token Budget & Activation Mechanics */}
            {wizardStep === 4 && (
              <div className="space-y-6">
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Global Scanning &amp; Token Budget Mechanics
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tune how SillyTavern scans chat messages and budgets context tokens for this Lorebook.
                    </p>
                  </div>

                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                    }}
                    className="grid gap-5"
                  >
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Scan Depth
                        </span>
                        <span className="font-mono font-bold">
                          {lorebook.scan_depth} msgs
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        value={lorebook.scan_depth}
                        onChange={(e) =>
                          updateLorebookAndSync((prev) => ({
                            ...prev,
                            scan_depth: Number(e.target.value),
                          }))
                        }
                        style={{ accentColor: 'var(--theme-accent)' }}
                        className="w-full cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500">
                        How many recent chat messages SillyTavern scans for trigger keywords (2–6 recommended for fast response focus).
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Token Budget
                        </span>
                        <span className="font-mono font-bold">
                          {lorebook.token_budget} tkn
                        </span>
                      </div>
                      <input
                        type="range"
                        min={256}
                        max={8192}
                        step={128}
                        value={lorebook.token_budget}
                        onChange={(e) =>
                          updateLorebookAndSync((prev) => ({
                            ...prev,
                            token_budget: Number(e.target.value),
                          }))
                        }
                        style={{ accentColor: 'var(--theme-accent)' }}
                        className="w-full cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500">
                        Maximum tokens allocated to activated Lorebook entries per turn before lower-priority entries are trimmed.
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <span>Recursive Scanning</span>
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
                      </label>
                      <p className="text-[11px] text-slate-500">
                        When enabled, activated entries are themselves scanned for keywords that can chain-activate related lore entries.
                      </p>
                    </div>
                  </div>

                  {/* Per-Entry Position, Order & Constant/Selective Matrix */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Entry Activation Priority &amp; Placement
                    </h4>
                    <div className="space-y-2">
                      {lorebook.entries.map((entry) => (
                        <div
                          key={entry.id}
                          style={{
                            gridTemplateColumns:
                              'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                          }}
                          className="grid gap-3 items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 text-xs"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {entry.comment || 'Untitled Entry'}
                          </div>

                          <div>
                            <select
                              value={entry.position}
                              onChange={(e) =>
                                handleUpdateEntryById(entry.id, {
                                  position: e.target.value as LorebookPosition,
                                })
                              }
                              className="theme-focus-ring w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                            >
                              {LOREBOOK_POSITIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 whitespace-nowrap">
                              Order:
                            </span>
                            <input
                              type="number"
                              value={entry.insertion_order}
                              onChange={(e) =>
                                handleUpdateEntryById(entry.id, {
                                  insertion_order: Number(e.target.value),
                                })
                              }
                              className="font-mono w-20 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={entry.constant}
                                onChange={(e) =>
                                  handleUpdateEntryById(entry.id, {
                                    constant: e.target.checked,
                                  })
                                }
                                style={{ accentColor: 'var(--theme-accent)' }}
                                className="h-3.5 w-3.5 cursor-pointer"
                              />
                              <span>Constant</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={entry.selective}
                                onChange={(e) =>
                                  handleUpdateEntryById(entry.id, {
                                    selective: e.target.checked,
                                  })
                                }
                                style={{ accentColor: 'var(--theme-accent)' }}
                                className="h-3.5 w-3.5 cursor-pointer"
                              />
                              <span>Selective</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Review, Bind to Character & Export */}
            {wizardStep === 5 && (
              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                }}
                className="grid gap-6 items-start"
              >
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Lorebook Token &amp; Entry Readiness Summary
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Total Entries</span>
                      <span className="font-mono font-semibold">
                        {lorebook.entries.length} (
                        {lorebook.entries.filter((e) => e.enabled).length}{' '}
                        enabled)
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">
                        Constant Entries (Always Active)
                      </span>
                      <span className="font-mono font-semibold">
                        {
                          lorebook.entries.filter(
                            (e) => e.enabled && e.constant
                          ).length
                        }{' '}
                        entries · {activeLorebookTokens.constant} tkn
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">
                        Keyword-Triggered Entries
                      </span>
                      <span className="font-mono font-semibold">
                        {
                          lorebook.entries.filter(
                            (e) => e.enabled && !e.constant
                          ).length
                        }{' '}
                        entries · {activeLorebookTokens.triggered} tkn
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">
                        Total Lorebook Footprint / Budget
                      </span>
                      <span className="font-mono font-bold">
                        {activeLorebookTokens.total} / {lorebook.token_budget}{' '}
                        tkn
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => exportLorebookAsJson(lorebook)}
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Lorebook .JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ editorMode: 'sandbox' })}
                      className="theme-hover-outline rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Open in Full Sandbox
                    </button>
                  </div>
                </div>

                {/* 1-Click Bind to Any Character in Library */}
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      1-Click Bind to Character Card
                    </h3>
                    <p className="text-xs text-slate-500">
                      Embed this Lorebook directly into any Character&apos;s{' '}
                      <code className="font-mono">character_book</code> field.
                    </p>
                  </div>

                  {boundCharacterNotice && (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      {boundCharacterNotice}
                    </div>
                  )}

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {characters.map((charItem) => {
                      const isBound =
                        charItem.character_book?.id === lorebook.id ||
                        charItem.character_book?.name === lorebook.name;
                      return (
                        <div
                          key={charItem.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {charItem.name}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {charItem.character_book?.name
                                ? `Current Book: ${charItem.character_book.name}`
                                : 'No bound Lorebook'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleBindToAnyCharacter(
                                charItem.id!,
                                charItem.name
                              )
                            }
                            style={{ borderColor: 'var(--theme-accent)' }}
                            className="theme-hover-outline flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer shrink-0"
                          >
                            {isBound ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Bound</span>
                              </>
                            ) : (
                              <>
                                <Link2
                                  className="h-3.5 w-3.5"
                                  style={{ color: 'var(--theme-accent)' }}
                                />
                                <span>Bind</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Bottom Navigation Bar */}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
              <button
                type="button"
                disabled={wizardStep === 1}
                onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous Step</span>
              </button>
              <span className="font-mono text-xs text-slate-500">
                Step {wizardStep} of 5
              </span>
              {wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => Math.min(5, s + 1))}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <span>Next Step</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateSettings({ editorMode: 'sandbox' })}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Finish Wizard</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* MODE B: FULL SANDBOX LOREBOOK WORKBENCH (Fluid Auto-Reflowing Grid) */
          <div
            style={{
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            }}
            className="grid gap-6 items-start"
          >
            {/* Left Column: Entries List & Filter with Drag-and-Drop Reordering */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Entries ({filteredEntries.length} / {lorebook.entries.length})
                </h2>
                <button
                  type="button"
                  onClick={() => handleCreateEntry()}
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
                  {tags
                    .filter((t) => !settings.hideNsfwTags || !isTagNsfw(t))
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5">
                {filteredEntries.map((entry) => {
                  const isSelected = selectedEntry?.id === entry.id;
                  const isDragOver = dragOverEntryId === entry.id;
                  const entryTokens = estimateTokens(entry.content);
                  return (
                    <div
                      key={entry.id}
                      draggable
                      onDragStart={() => setDraggedEntryId(entry.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (
                          draggedEntryId !== null &&
                          draggedEntryId !== entry.id
                        ) {
                          setDragOverEntryId(entry.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverEntryId === entry.id) {
                          setDragOverEntryId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedEntryId !== null) {
                          handleDropReorderEntries(draggedEntryId, entry.id);
                        }
                        setDraggedEntryId(null);
                        setDragOverEntryId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedEntryId(null);
                        setDragOverEntryId(null);
                      }}
                      style={
                        isSelected
                          ? {
                              borderColor: 'var(--theme-accent)',
                              backgroundColor:
                                'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                            }
                          : isDragOver
                            ? { borderColor: 'var(--theme-accent)' }
                            : undefined
                      }
                      className={`rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? 'bg-slate-50 dark:bg-slate-800/70'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            title="Drag to reorder entry"
                            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
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

            {/* Right Column: Selected Entry Editor */}
            <div className="min-w-0">
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

                  {/* Trigger Keys & Secondary Keys with 1-Click AI Auto-Key Suggestion */}
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                    }}
                    className="grid gap-4"
                  >
                    {/* Primary Keys */}
                    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
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
                          onClick={() => handleSuggestTriggerKeysForEntry()}
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
                          <span>✨ AI Suggest Keys</span>
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
                            handleAddKeyChip(
                              'secondary_keys',
                              secondaryKeyInput
                            )
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
                    enablePortraitVision={false}
                  />

                  {/* Insertion Order, Position & Trigger Flags */}
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                    }}
                    className="grid gap-4 pt-1"
                  >
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
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <TagSelector
                      tags={tags}
                      selectedTagNames={selectedEntry.tags || []}
                      onToggleTag={toggleEntryTag}
                      onAddCustomTag={(tagName) => handleAddCustomEntryTag(tagName)}
                      label="Entry Semantic Tags (Injected into AI Assist)"
                      tooltip="Tags attached to this Lorebook entry automatically provide their AI Context Descriptions when generating or expanding this entry."
                    />
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
                    onClick={() => handleCreateEntry()}
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
        )}
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
