import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  User,
  Plus,
  Search,
  Trash2,
  Sparkles,
  Activity,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  FileJson,
  Zap,
  Upload,
  Download,
  Image as ImageIcon,
  Crop,
  GripVertical,
  RefreshCw,
  ShieldAlert,
  CornerDownRight,
  Smile,
  Link,
} from 'lucide-react';
import {
  ensureUniqueEntityName,
  isCharacterNsfw,
  useStore,
} from '../context/StoreContext';
import {
  CharacterCardData,
  ContextReferenceImage,
  ReactionImageItem,
  RosterSortOption,
  StatBlockConfig,
  StatItem,
  StatItemType,
  StatTemplatePresetId,
} from '../types';
import { SmartEditor } from './SmartEditor';
import { ContextImagesBar } from './ContextImagesBar';
import { Tooltip } from './Tooltip';
import { PortraitCropperModal } from './PortraitCropperModal';
import { isTagNsfw, TagSelector } from './TagSelector';
import { sortTagsByContextOrder } from '../utils/tagOrder';
import {
  buildStatTemplatePreset,
  calculateCardTokenBreakdown,
  compileStatBlockPrompt,
  countAllStatItems,
  estimateTokens,
  formatAsciiProgressBar,
  inferStatTemplatePreset,
  renderInitialStatBlockInstance,
} from '../utils/tokenCounter';
import {
  compressImageForReactionAsset,
  exportCharacterAsJson,
  exportCharacterAsPng,
  extractPngTextChunks,
  readImageDimensions,
  sanitizeFilename,
  triggerBrowserDownload,
} from '../utils/cardIO';
import {
  AIServiceError,
  doesBackendSupportVision,
  generateCompletionDetailed,
  parseAiJsonResponse,
} from '../services/aiService';

const REACTION_EXPRESSION_PRESETS: readonly string[] = [
  'neutral',
  'joy',
  'amusement',
  'love',
  'embarrassment',
  'desire',
  'anger',
  'sadness',
  'surprise',
  'fear',
  'excitement',
  'pride',
  'caring',
  'nervousness',
  'smug',
  'flustered',
  'teasing',
  'ahegao',
  'climax',
  'overstimulated',
  'battle_damaged',
];

const WIZARD_STEPS = [
  {
    step: 1,
    title: 'Identity & Tags',
    subtitle: 'Portrait, name, tags & AI starter generator',
  },
  {
    step: 2,
    title: 'Description & Personality',
    subtitle: 'Appearance, backstory, voice & quirks',
  },
  {
    step: 3,
    title: 'Scenario & Greetings',
    subtitle: 'Starting scene, first message & alternates',
  },
  {
    step: 4,
    title: 'Dialogue & Instructions',
    subtitle: 'Example chats & extra AI rules',
  },
  {
    step: 5,
    title: 'Stat Tracker & Review',
    subtitle: 'Optional RPG stats & final token check',
  },
];

export const CharacterEditor: React.FC = () => {
  const {
    characters,
    activeCharacterId,
    setActiveCharacterId,
    createNewCharacter,
    requestDeleteCharacter,
    character,
    setCharacter,
    updateCharacterField,
    lorebooks,
    statBlock,
    setStatBlock,
    tags,
    ensureTagRegistered,
    activeTheme,
    aiConfig,
    settings,
    updateSettings,
    tokenBreakdown,
    setActiveTab,
    importFromFiles,
    checkAndTriggerNameConflict,
    workspaceDraftCache,
    updateCharacterDraft,
  } = useStore();

  const charDraft = workspaceDraftCache.character;
  const rosterOpen = charDraft.rosterOpen;
  const setRosterOpen = (next: React.SetStateAction<boolean>) =>
    updateCharacterDraft({
      rosterOpen: typeof next === 'function' ? next(charDraft.rosterOpen) : next,
    });
  const rosterSearch = charDraft.rosterSearch;
  const setRosterSearch = (next: string) =>
    updateCharacterDraft({ rosterSearch: next });
  const rosterTagFilter = charDraft.rosterTagFilter;
  const setRosterTagFilter = (next: string) =>
    updateCharacterDraft({ rosterTagFilter: next });
  const rosterSort = charDraft.rosterSort;
  const setRosterSort = (next: RosterSortOption) =>
    updateCharacterDraft({ rosterSort: next });
  const newCustomTagInput = charDraft.newCustomTagInput;
  const setNewCustomTagInput = (next: string) =>
    updateCharacterDraft({ newCustomTagInput: next });
  const statBlockExpanded = charDraft.statBlockExpanded;
  const setStatBlockExpanded = (next: React.SetStateAction<boolean>) =>
    updateCharacterDraft({
      statBlockExpanded:
        typeof next === 'function' ? next(charDraft.statBlockExpanded) : next,
    });
  const reactionsExpanded = Boolean(charDraft.reactionsExpanded);
  const setReactionsExpanded = (next: React.SetStateAction<boolean>) =>
    updateCharacterDraft({
      reactionsExpanded:
        typeof next === 'function'
          ? next(Boolean(charDraft.reactionsExpanded))
          : next,
    });
  const wizardStep = charDraft.wizardStep;
  const setWizardStep = (next: React.SetStateAction<number>) =>
    updateCharacterDraft({
      wizardStep:
        typeof next === 'function' ? next(charDraft.wizardStep) : next,
    });
  const conceptPrompt = charDraft.conceptPrompt;
  const setConceptPrompt = (next: string) =>
    updateCharacterDraft({ conceptPrompt: next });
  const activeGreetingIdx = charDraft.activeGreetingIdx;
  const setActiveGreetingIdx = (next: React.SetStateAction<number>) =>
    updateCharacterDraft({
      activeGreetingIdx:
        typeof next === 'function' ? next(charDraft.activeGreetingIdx) : next,
    });
  const altGreetingTwist = charDraft.altGreetingTwist;
  const setAltGreetingTwist = (next: string) =>
    updateCharacterDraft({ altGreetingTwist: next });
  const extraContextImages = charDraft.extraContextImages || [];
  const handleAddExtraContextImages = (newImages: ContextReferenceImage[]) =>
    updateCharacterDraft({
      extraContextImages: [...extraContextImages, ...newImages],
    });
  const handleRemoveExtraContextImage = (imgId: string) =>
    updateCharacterDraft({
      extraContextImages: extraContextImages.filter((img) => img.id !== imgId),
    });
  const handleClearExtraContextImages = () =>
    updateCharacterDraft({ extraContextImages: [] });

  // Transient per-mount UI State (file drag, modals, active AI requests)
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importStatusBanner, setImportStatusBanner] = useState<string | null>(
    null
  );

  // Interactive 2:3 Portrait Cropper Modal State
  const [cropperState, setCropperState] = useState<{
    sourceUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    reason: 'aspect_mismatch' | 'manual_adjust';
  } | null>(null);
  const portraitInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-Drop Reordering State (StatBlock items & Alternate Greetings)
  const [draggedStatIdx, setDraggedStatIdx] = useState<number | null>(null);
  const [dragOverStatIdx, setDragOverStatIdx] = useState<number | null>(null);
  const [draggedAltGreetingIdx, setDraggedAltGreetingIdx] = useState<
    number | null
  >(null);
  const [dragOverAltGreetingIdx, setDragOverAltGreetingIdx] = useState<
    number | null
  >(null);

  // Stat-Block transient generation indicator
  const [generatingStatRuleId, setGeneratingStatRuleId] = useState<string | null>(
    null
  );

  // Character Reaction Images & Expressions Studio transient state
  const reactionFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingReactionFiles, setIsDraggingReactionFiles] = useState(false);
  const [isUploadingReactions, setIsUploadingReactions] = useState(false);
  const [reactionUrlName, setReactionUrlName] = useState('');
  const [reactionUrlInput, setReactionUrlInput] = useState('');
  const [generatingReactionId, setGeneratingReactionId] = useState<string | null>(
    null
  );
  const [reactionBanner, setReactionBanner] = useState<string | null>(null);

  // Wizard transient generation state
  const [isGeneratingConcept, setIsGeneratingConcept] = useState<boolean>(false);
  const [conceptError, setConceptError] = useState<{
    message: string;
    corsHint?: string;
  } | null>(null);

  // Greetings transient generation state
  const [isGeneratingGreeting, setIsGeneratingGreeting] = useState<boolean>(false);

  // StatBlock Compiler Notification State
  const [compiledBanner, setCompiledBanner] = useState<string | null>(null);

  // Multimodal Vision transient state
  const [visionFallbackBanner, setVisionFallbackBanner] = useState<
    string | null
  >(null);

  const visionSupported = useMemo(
    () => doesBackendSupportVision(aiConfig),
    [aiConfig]
  );
  const hasPortraitImage = Boolean(
    character.avatar && character.avatar.startsWith('data:image/')
  );

  const activeCharacterVisionUrls = useMemo(() => {
    if (!visionSupported) return [];
    const urls: string[] = [];
    if (hasPortraitImage && character.avatar) {
      urls.push(character.avatar);
    }
    for (const img of extraContextImages) {
      if (img.dataUrl) {
        urls.push(img.dataUrl);
      }
    }
    return Array.from(new Set(urls));
  }, [
    visionSupported,
    hasPortraitImage,
    character.avatar,
    extraContextImages,
  ]);

  const abortRef = useRef<AbortController | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<Set<number>>(new Set());

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  };

  // Portrait Upload & 2:3 Aspect-Ratio Check Handler
  const handlePortraitImageSelected = async (file: File) => {
    try {
      const info = await readImageDimensions(file);
      if (!info.isTwoThreeAspect) {
        // Image does not match SillyTavern 2:3 aspect ratio -> automatically open Interactive Cropper Modal
        setCropperState({
          sourceUrl: info.dataUrl,
          naturalWidth: info.width,
          naturalHeight: info.height,
          reason: 'aspect_mismatch',
        });
      } else {
        updateCharacterField('avatar', info.dataUrl);
        setImportStatusBanner(
          `Applied 2:3 portrait (${info.width}×${info.height} px) to ${character.name}.`
        );
        scheduleTimer(() => setImportStatusBanner(null), 3500);
      }
    } catch (err: unknown) {
      setConceptError({
        message:
          err instanceof Error
            ? err.message
            : 'Could not load selected portrait image.',
      });
    }
  };

  const handleOpenManualCropper = async () => {
    if (!character.avatar) {
      portraitInputRef.current?.click();
      return;
    }
    try {
      const info = await readImageDimensions(character.avatar);
      setCropperState({
        sourceUrl: info.dataUrl,
        naturalWidth: info.width,
        naturalHeight: info.height,
        reason: 'manual_adjust',
      });
    } catch {
      setCropperState({
        sourceUrl: character.avatar,
        naturalWidth: 512,
        naturalHeight: 768,
        reason: 'manual_adjust',
      });
    }
  };

  // Unified File Drop / Selection Handler (supports ST V2/V3 .png cards, .json cards/lorebooks, AND plain portrait images)
  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    // Check if single image file is a plain portrait image without SillyTavern tEXt chunks
    if (list.length === 1) {
      const single = list[0];
      const lower = single.name.toLowerCase();
      const isNonPngImage =
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        single.type === 'image/jpeg' ||
        single.type === 'image/webp';

      if (isNonPngImage) {
        await handlePortraitImageSelected(single);
        return;
      }

      if (lower.endsWith('.png') || single.type === 'image/png') {
        try {
          const buf = await single.arrayBuffer();
          const chunks = extractPngTextChunks(buf);
          if (!chunks['ccv3'] && !chunks['chara']) {
            // Plain PNG without ST metadata -> treat as character portrait upload with 2:3 aspect check!
            await handlePortraitImageSelected(single);
            return;
          }
        } catch {
          // Fall through to standard card importer
        }
      }
    }

    try {
      const res = await importFromFiles(list);
      setImportStatusBanner(res.summary);
      scheduleTimer(() => setImportStatusBanner(null), 4000);
    } catch (err: unknown) {
      setConceptError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to import card file.',
      });
    }
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current.clear();
    };
  }, []);

  // Ensure greeting index stays in bounds when switching characters
  useEffect(() => {
    const totalGreetings = 1 + (character.alternate_greetings?.length || 0);
    if (activeGreetingIdx >= totalGreetings) {
      setActiveGreetingIdx(0);
    }
  }, [character.id, character.alternate_greetings?.length, activeGreetingIdx]);

  // Compute token count for each character in the roster for sorting & display
  const characterWithMetrics = useMemo(() => {
    return characters.map((charItem) => {
      const charStatBlock = charItem.extensions?.statBlock || statBlock;
      const charLorebook = charItem.character_book;
      const breakdown = calculateCardTokenBreakdown(
        charItem,
        charLorebook,
        charStatBlock
      );
      return {
        char: charItem,
        totalTokens: breakdown.totalCardTokens,
      };
    });
  }, [characters, statBlock]);

  const filteredAndSortedRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    const filtered = characterWithMetrics.filter(({ char }) => {
      if (settings.hideNsfwTags && isCharacterNsfw(char, tags)) {
        return false;
      }
      const matchesTag =
        rosterTagFilter === 'all' || (char.tags || []).includes(rosterTagFilter);
      const matchesQuery =
        !q ||
        (char.name || '').toLowerCase().includes(q) ||
        (char.nickname || '').toLowerCase().includes(q) ||
        (char.description || '').toLowerCase().includes(q) ||
        (char.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (rosterSort === 'name_asc') {
        return (a.char.name || '').localeCompare(b.char.name || '');
      }
      if (rosterSort === 'name_desc') {
        return (b.char.name || '').localeCompare(a.char.name || '');
      }
      if (rosterSort === 'tokens_desc') {
        return b.totalTokens - a.totalTokens;
      }
      if (rosterSort === 'tokens_asc') {
        return a.totalTokens - b.totalTokens;
      }
      // Default: modified_desc
      return (b.char.modification_date || 0) - (a.char.modification_date || 0);
    });
  }, [
    characterWithMetrics,
    rosterSearch,
    rosterTagFilter,
    rosterSort,
    settings.hideNsfwTags,
    tags,
  ]);

  const toggleCharacterTag = (tagName: string) => {
    const registered = ensureTagRegistered(tagName);
    const canonicalName = registered ? registered.name : tagName.trim();
    const exists = character.tags.some(
      (t) => t.trim().toLowerCase() === canonicalName.toLowerCase()
    );
    const nextRaw = exists
      ? character.tags.filter(
          (t) => t.trim().toLowerCase() !== canonicalName.toLowerCase()
        )
      : [...character.tags, canonicalName];
    updateCharacterField(
      'tags',
      sortTagsByContextOrder(
        nextRaw,
        registered ? [registered, ...tags] : tags
      )
    );
  };

  const handleAddCustomCharacterTag = (directTagName?: string) => {
    const clean = (directTagName ?? newCustomTagInput).trim();
    if (!clean) return;
    const registered = ensureTagRegistered(clean);
    const tagName = registered ? registered.name : clean;
    if (
      !character.tags.some(
        (t) => t.trim().toLowerCase() === tagName.toLowerCase()
      )
    ) {
      updateCharacterField(
        'tags',
        sortTagsByContextOrder(
          [...character.tags, tagName],
          registered ? [registered, ...tags] : tags
        )
      );
    }
    setNewCustomTagInput('');
  };

  // Greeting Carousel Handlers
  const totalGreetingsCount = 1 + (character.alternate_greetings?.length || 0);

  const currentGreetingValue =
    activeGreetingIdx === 0
      ? character.first_mes
      : character.alternate_greetings[activeGreetingIdx - 1] || '';

  const handleUpdateGreetingValue = (newVal: string) => {
    if (activeGreetingIdx === 0) {
      updateCharacterField('first_mes', newVal);
    } else {
      const nextAlts = [...(character.alternate_greetings || [])];
      nextAlts[activeGreetingIdx - 1] = newVal;
      updateCharacterField('alternate_greetings', nextAlts);
    }
  };

  const handleAddBlankAlternateGreeting = () => {
    const nextAlts = [...(character.alternate_greetings || []), ''];
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(nextAlts.length);
  };

  const handleDuplicateCurrentGreeting = () => {
    const nextAlts = [
      ...(character.alternate_greetings || []),
      currentGreetingValue,
    ];
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(nextAlts.length);
  };

  const handleDeleteCurrentAlternateGreeting = () => {
    if (activeGreetingIdx === 0) return;
    const targetAltIndex = activeGreetingIdx - 1;
    const nextAlts = (character.alternate_greetings || []).filter(
      (_, idx) => idx !== targetAltIndex
    );
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(Math.max(0, activeGreetingIdx - 1));
  };

  // Drag-and-Drop Reordering for Alternate Greetings (indices 0..N-1 in character.alternate_greetings)
  const handleDropReorderAltGreeting = (fromAltIdx: number, toAltIdx: number) => {
    if (fromAltIdx === toAltIdx) return;
    const currentAlts = [...(character.alternate_greetings || [])];
    if (
      fromAltIdx < 0 ||
      toAltIdx < 0 ||
      fromAltIdx >= currentAlts.length ||
      toAltIdx >= currentAlts.length
    ) {
      return;
    }
    const [moved] = currentAlts.splice(fromAltIdx, 1);
    currentAlts.splice(toAltIdx, 0, moved);
    updateCharacterField('alternate_greetings', currentAlts);
    setActiveGreetingIdx(toAltIdx + 1);
  };

  // 1-Click AI Alternate Greeting Generator
  const handleGenerateAIGreeting = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingGreeting(true);
    setConceptError(null);

    const cardContext = [
      `Active Context Theme: ${activeTheme.name}`,
      `Character Name: ${character.name || '{{char}}'}`,
      character.nickname ? `Nickname: ${character.nickname}` : '',
      character.description ? `Description:\n${character.description}` : '',
      character.personality ? `Personality:\n${character.personality}` : '',
      character.scenario ? `Scenario:\n${character.scenario}` : '',
      character.mes_example
        ? `Example Dialogue:\n${character.mes_example}`
        : '',
      character.system_prompt
        ? `System Prompt:\n${character.system_prompt}`
        : '',
      character.post_history_instructions
        ? `Post-History Instructions:\n${character.post_history_instructions}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const twistDirective = altGreetingTwist.trim()
      ? `Scene / Mood Twist: "${altGreetingTwist.trim()}"`
      : "Create a distinct, atmospheric opening scene that showcases {{char}}'s voice and invites {{user}} into immediate interaction.";

    const prompt = [
      `Write an engaging SillyTavern opening greeting for ${character.name || '{{char}}'} addressing {{user}}.`,
      twistDirective,
      'Format actions in *italics* and spoken dialogue in "quotes". Output ONLY the greeting text.',
    ].join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        cardContext,
        aiConfig,
        controller.signal,
        {
          maxTokens: Math.max(4096, aiConfig.maxTokens || 4096),
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrls:
            activeCharacterVisionUrls.length > 0
              ? activeCharacterVisionUrls
              : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const nextAlts = [
          ...(character.alternate_greetings || []),
          detailed.content.trim(),
        ];
        updateCharacterField('alternate_greetings', nextAlts);
        setActiveGreetingIdx(nextAlts.length);
        setAltGreetingTwist('');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message: 'Failed to generate greeting. Check AI connection settings.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingGreeting(false);
      }
    }
  };

  // Wizard Step 1: "Generate Full Character from Concept"
  const handleGenerateFullCharacterFromConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    const usePortraitNow = visionSupported && hasPortraitImage;
    const hasAnyVisualContext = activeCharacterVisionUrls.length > 0;
    if (!conceptPrompt.trim() && !hasAnyVisualContext) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingConcept(true);
    setConceptError(null);
    setVisionFallbackBanner(null);

    const visualContextPromptNote =
      activeCharacterVisionUrls.length > 0
        ? [
            usePortraitNow
              ? `The Character Portrait image is attached (~260 tokens).`
              : '',
            extraContextImages.length > 0
              ? `${extraContextImages.length} additional Context-Only Reference Image(s) are attached (~260 tokens each).`
              : '',
            `Inspect ALL attached visual image(s) carefully and ensure the character's physical appearance, attire, mood, accessories, personality cues, and scenario reflect them accurately.`,
          ]
            .filter(Boolean)
            .join(' ')
        : '';

    const prompt = [
      conceptPrompt.trim()
        ? `Generate a complete SillyTavern Character Card based on this concept: "${conceptPrompt.trim()}"`
        : `Generate a complete SillyTavern Character Card inspired directly by the attached visual reference image(s).`,
      visualContextPromptNote,
      character.name && character.name !== 'New Character'
        ? `Preferred Character Name: ${character.name}`
        : '',
      `Return a valid JSON object with these exact keys:`,
      `{`,
      `  "name": "Character Name",`,
      `  "nickname": "Short title or moniker",`,
      `  "description": "Multi-paragraph physical appearance, attire, and backstory using {{char}}",`,
      `  "personality": "Detailed temperament, quirks, speech style, and psychological motivations",`,
      `  "scenario": "Immediate setting and inciting situation involving {{char}} and {{user}}",`,
      `  "first_mes": "Rich multi-paragraph opening greeting with *actions* and \\"dialogue\\"",`,
      `  "mes_example": "<START>\\n{{user}}: \\"...\\"\\n{{char}}: *...* \\"...\\"",`,
      `  "system_prompt": "Narrative POV and roleplay directives for {{char}}"`,
      `}`,
      `Output ONLY valid JSON without markdown codeblocks or extra commentary.`,
    ]
      .filter(Boolean)
      .join('\n');

    const existingCardContext = [
      `Active Context Theme: ${activeTheme.name}`,
      character.name ? `Current Name: ${character.name}` : '',
      character.nickname ? `Current Nickname: ${character.nickname}` : '',
      character.description
        ? `Existing Description Draft:\n${character.description}`
        : '',
      character.personality
        ? `Existing Personality Draft:\n${character.personality}`
        : '',
      character.scenario ? `Existing Scenario Draft:\n${character.scenario}` : '',
      character.first_mes
        ? `Existing Greeting Draft:\n${character.first_mes}`
        : '',
      character.mes_example
        ? `Existing Example Dialogue:\n${character.mes_example}`
        : '',
      character.system_prompt
        ? `Existing System Prompt:\n${character.system_prompt}`
        : '',
      character.post_history_instructions
        ? `Existing Post-History Instructions:\n${character.post_history_instructions}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        existingCardContext,
        aiConfig,
        controller.signal,
        {
          maxTokens: Math.max(4096, aiConfig.maxTokens || 4096),
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrls:
            activeCharacterVisionUrls.length > 0
              ? activeCharacterVisionUrls
              : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const parsed = parseAiJsonResponse<Partial<CharacterCardData>>(
          detailed.content
        );

        setCharacter((prev) => {
          const otherNames = characters
            .filter((c) => c.id !== prev.id)
            .map((c) => c.name || 'Untitled');
          const safeName = parsed.name?.trim()
            ? ensureUniqueEntityName(
                parsed.name.trim(),
                otherNames,
                prev.name || 'New Character'
              )
            : prev.name;

          return {
            ...prev,
            name: safeName,
            nickname: parsed.nickname ?? prev.nickname,
            description: parsed.description ?? prev.description,
            personality: parsed.personality ?? prev.personality,
            scenario: parsed.scenario ?? prev.scenario,
            first_mes: parsed.first_mes ?? prev.first_mes,
            mes_example: parsed.mes_example ?? prev.mes_example,
            system_prompt: parsed.system_prompt ?? prev.system_prompt,
          };
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message:
            err instanceof Error
              ? `Could not parse AI response: ${err.message}`
              : 'Failed to generate full character from concept.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingConcept(false);
      }
    }
  };

  // Recursive Stat & Sub-Stat Helpers + Live Template Synchronization
  const findStatPathEntry = (
    items: StatItem[],
    targetId: string,
    parentPath = ''
  ): { stat: StatItem; path: string; parentLabel?: string } | null => {
    for (const item of items) {
      const cleanLabel = (item.label || '').trim() || 'Stat';
      const path = parentPath ? `${parentPath}.${cleanLabel}` : cleanLabel;
      if (item.id === targetId) {
        return {
          stat: item,
          path,
          parentLabel: parentPath || undefined,
        };
      }
      if (Array.isArray(item.subStats) && item.subStats.length > 0) {
        const nested = findStatPathEntry(item.subStats, targetId, path);
        if (nested) return nested;
      }
    }
    return null;
  };

  const mapStatTreeById = (
    items: StatItem[],
    targetId: string,
    updater: (item: StatItem) => StatItem
  ): StatItem[] => {
    return items.map((item) => {
      const updated = item.id === targetId ? updater(item) : item;
      if (Array.isArray(updated.subStats) && updated.subStats.length > 0) {
        return {
          ...updated,
          subStats: mapStatTreeById(updated.subStats, targetId, updater),
        };
      }
      return updated;
    });
  };

  const deleteStatTreeById = (items: StatItem[], targetId: string): StatItem[] => {
    return items
      .filter((item) => item.id !== targetId)
      .map((item) =>
        Array.isArray(item.subStats) && item.subStats.length > 0
          ? { ...item, subStats: deleteStatTreeById(item.subStats, targetId) }
          : item
      );
  };

  const syncStatBlockTemplate = (
    prevBlock: StatBlockConfig,
    nextStats: StatItem[],
    renameHint?: { oldPath: string; newPath: string }
  ): Pick<
    StatBlockConfig,
    'formatTemplate' | 'templatePreset' | 'isCustomTemplate'
  > => {
    const activePreset = inferStatTemplatePreset(
      prevBlock.formatTemplate,
      prevBlock.templatePreset
    );
    if (!prevBlock.isCustomTemplate) {
      return {
        formatTemplate: buildStatTemplatePreset(activePreset, nextStats),
        templatePreset: activePreset,
        isCustomTemplate: false,
      };
    }
    let nextTemplate = prevBlock.formatTemplate;
    if (
      renameHint &&
      renameHint.oldPath &&
      renameHint.newPath &&
      renameHint.oldPath !== renameHint.newPath
    ) {
      const escapedOld = renameHint.oldPath.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
      nextTemplate = nextTemplate.replace(
        new RegExp(`\\{\\{stat:${escapedOld}\\}\\}`, 'gi'),
        `{{stat:${renameHint.newPath}}}`
      );
    }
    return {
      formatTemplate: nextTemplate,
      templatePreset: activePreset,
      isCustomTemplate: true,
    };
  };

  // Modular DM/GM StatBlock Builder Handlers
  const handleAddStatItem = () => {
    setStatBlockExpanded(true);
    setStatBlock((prev) => {
      const newItem: StatItem = {
        id: `stat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        label: `Stat ${prev.stats.length + 1}`,
        type: 'bar',
        defaultValue: '50',
        min: 0,
        max: 100,
        unit: '%',
        changeRules: 'Adjusts based on scene actions and dialogue choices.',
        subStats: [],
      };
      const nextStats = [...prev.stats, newItem];
      const synced = syncStatBlockTemplate(prev, nextStats);
      return {
        ...prev,
        enableDMTracker: true,
        stats: nextStats,
        ...synced,
      };
    });
  };

  const handleAddSubStatItem = (parentId: string) => {
    setStatBlockExpanded(true);
    setStatBlock((prev) => {
      const parentFound = findStatPathEntry(prev.stats, parentId);
      const existingSubCount = parentFound?.stat.subStats?.length || 0;
      const newSub: StatItem = {
        id: `substat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        label: `Sub-Stat ${existingSubCount + 1}`,
        type: 'bar',
        defaultValue: '50',
        min: 0,
        max: 100,
        unit: '%',
        changeRules: 'Adjusts dynamically based on scene actions.',
      };
      const nextStats = mapStatTreeById(prev.stats, parentId, (parent) => ({
        ...parent,
        subStats: [...(parent.subStats || []), newSub],
      }));
      const synced = syncStatBlockTemplate(prev, nextStats);
      return {
        ...prev,
        enableDMTracker: true,
        stats: nextStats,
        ...synced,
      };
    });
  };

  const handleUpdateStatItem = (id: string, patch: Partial<StatItem>) => {
    setStatBlock((prev) => {
      const oldEntry = findStatPathEntry(prev.stats, id);
      const nextStats = mapStatTreeById(prev.stats, id, (item) => {
        const merged: StatItem = { ...item, ...patch };
        if (
          patch.type &&
          patch.type !== item.type &&
          (patch.type === 'bar' || patch.type === 'number')
        ) {
          if (merged.min === undefined) merged.min = 0;
          if (merged.max === undefined) merged.max = 100;
          if (Number.isNaN(parseFloat(merged.defaultValue))) {
            merged.defaultValue = '50';
          }
          if (patch.type === 'bar' && merged.unit === undefined) {
            merged.unit = '%';
          }
        }
        return merged;
      });
      const newEntry = findStatPathEntry(nextStats, id);
      const renameHint =
        oldEntry && newEntry && oldEntry.path !== newEntry.path
          ? { oldPath: oldEntry.path, newPath: newEntry.path }
          : undefined;
      const synced = syncStatBlockTemplate(prev, nextStats, renameHint);
      return {
        ...prev,
        stats: nextStats,
        ...synced,
      };
    });
  };

  const handleMoveStatItem = (index: number, direction: -1 | 1) => {
    setStatBlock((prev) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= prev.stats.length) return prev;
      const nextStats = [...prev.stats];
      const [moved] = nextStats.splice(index, 1);
      nextStats.splice(targetIdx, 0, moved);
      const synced = syncStatBlockTemplate(prev, nextStats);
      return { ...prev, stats: nextStats, ...synced };
    });
  };

  const handleMoveSubStatItem = (
    parentId: string,
    subIndex: number,
    direction: -1 | 1
  ) => {
    setStatBlock((prev) => {
      const nextStats = mapStatTreeById(prev.stats, parentId, (parent) => {
        const currentSubs = [...(parent.subStats || [])];
        const targetIdx = subIndex + direction;
        if (targetIdx < 0 || targetIdx >= currentSubs.length) return parent;
        const [moved] = currentSubs.splice(subIndex, 1);
        currentSubs.splice(targetIdx, 0, moved);
        return { ...parent, subStats: currentSubs };
      });
      const synced = syncStatBlockTemplate(prev, nextStats);
      return { ...prev, stats: nextStats, ...synced };
    });
  };

  const handleDropReorderStatItem = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setStatBlock((prev) => {
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= prev.stats.length ||
        toIdx >= prev.stats.length
      ) {
        return prev;
      }
      const nextStats = [...prev.stats];
      const [moved] = nextStats.splice(fromIdx, 1);
      nextStats.splice(toIdx, 0, moved);
      const synced = syncStatBlockTemplate(prev, nextStats);
      return { ...prev, stats: nextStats, ...synced };
    });
  };

  const handleDeleteStatItem = (id: string) => {
    setStatBlock((prev) => {
      const nextStats = deleteStatTreeById(prev.stats, id);
      const synced = syncStatBlockTemplate(prev, nextStats);
      return {
        ...prev,
        stats: nextStats,
        ...synced,
      };
    });
  };

  const handleApplyStatTemplatePreset = (preset: StatTemplatePresetId) => {
    setStatBlock((prev) => ({
      ...prev,
      templatePreset: preset,
      isCustomTemplate: false,
      formatTemplate: buildStatTemplatePreset(preset, prev.stats),
    }));
  };

  // Per-Stat / Sub-Stat "AI Generate" Progression Rule Generator
  const handleGenerateStatRuleWithAI = async (
    stat: StatItem,
    parentLabel?: string
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingStatRuleId(stat.id);
    setConceptError(null);

    const rangeInfo =
      stat.type === 'bar' || stat.type === 'number'
        ? `Range: ${stat.min ?? 0} to ${stat.max ?? 100}${stat.unit || ''}, Initial Value: ${stat.defaultValue}`
        : `Type: ${stat.type}, Initial Value: ${stat.defaultValue}`;

    const flattenSummary = (items: StatItem[], prefix = ''): string[] => {
      const lines: string[] = [];
      for (const s of items) {
        if (s.id !== stat.id) {
          lines.push(
            `- ${prefix}${s.label} (${s.type}): ${s.changeRules || 'no rule yet'}`
          );
        }
        if (Array.isArray(s.subStats) && s.subStats.length > 0) {
          lines.push(...flattenSummary(s.subStats, `${prefix}${s.label} > `));
        }
      }
      return lines;
    };
    const otherStatsSummary = flattenSummary(statBlock.stats).join('\n');

    const characterFullContext = [
      `Character Name: ${character.name || '{{char}}'}`,
      character.nickname ? `Nickname: ${character.nickname}` : '',
      character.description ? `Description:\n${character.description}` : '',
      character.personality ? `Personality:\n${character.personality}` : '',
      character.scenario ? `Scenario:\n${character.scenario}` : '',
      character.first_mes ? `First Message:\n${character.first_mes}` : '',
      character.system_prompt
        ? `System Prompt:\n${character.system_prompt}`
        : '',
      character.post_history_instructions
        ? `Post-History Instructions:\n${character.post_history_instructions}`
        : '',
      otherStatsSummary ? `Other Tracked Stats:\n${otherStatsSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const prompt = [
      `Write a concise, actionable 1-sentence DM/GM progression and update rule for a tracked roleplay stat.`,
      parentLabel
        ? `Parent Stat / Category: "${parentLabel}"\nSub-Stat Name: "${stat.label}" (${rangeInfo})`
        : `Stat Name: "${stat.label}" (${rangeInfo})`,
      stat.changeRules.trim()
        ? `Current Draft / Hint: "${stat.changeRules.trim()}"`
        : '',
      activeCharacterVisionUrls.length > 0
        ? `Attached images (${activeCharacterVisionUrls.length}) are included in context if character appearance/items inform this stat.`
        : '',
      `Specify exact triggers (e.g., +2 to +10 on trust/help, -5 to -15 on betrayal/aggression, or how status/inventory shifts) so the AI knows when and how to update this stat every turn. Output ONLY the 1-sentence rule without quotes.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        characterFullContext,
        aiConfig,
        controller.signal,
        {
          maxTokens: Math.max(4096, aiConfig.maxTokens || 4096),
          temperature: 0.65,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrls:
            activeCharacterVisionUrls.length > 0
              ? activeCharacterVisionUrls
              : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        handleUpdateStatItem(stat.id, {
          changeRules: detailed.content.trim().replace(/^["']|["']$/g, ''),
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message: 'Failed to generate stat progression rule with AI.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setGeneratingStatRuleId(null);
      }
    }
  };

  // 1-Click Compiler: Compiles stat tracking instructions into `post_history_instructions` AND injects initial stat block into `first_mes`
  const handleCompileStatBlockToCard = () => {
    const enabledStatBlock = { ...statBlock, enableDMTracker: true };
    setStatBlock(enabledStatBlock);

    const compiledInstructions = compileStatBlockPrompt(enabledStatBlock);
    const initialRenderedBlock = renderInitialStatBlockInstance(enabledStatBlock);

    // Strip any previously compiled [System Directive: Dynamic DM/GM Stat Tracker] block cleanly without touching other directives
    const cleanPostHistory = (character.post_history_instructions || '')
      .replace(
        /\n*\[System Directive: Dynamic DM\/GM Stat Tracker\][\s\S]*?(?=\n*\[System Directive:|$)/i,
        ''
      )
      .trim();

    const updatedPostHistory = [cleanPostHistory, compiledInstructions]
      .filter(Boolean)
      .join('\n\n');

    // Append initial stat block to first_mes if not already present
    const currentFirstMes = (character.first_mes || '').trim();
    const updatedFirstMes =
      initialRenderedBlock && !currentFirstMes.includes(initialRenderedBlock.trim())
        ? `${currentFirstMes}\n\n${initialRenderedBlock.trim()}`.trim()
        : currentFirstMes;

    setCharacter((prev) => ({
      ...prev,
      post_history_instructions: updatedPostHistory,
      first_mes: updatedFirstMes,
      extensions: {
        ...prev.extensions,
        statBlock: enabledStatBlock,
      },
    }));

    setCompiledBanner(
      'Added your Stat Tracker rules to Post-History Instructions and your starting stats to the First Message.'
    );
    scheduleTimer(() => setCompiledBanner(null), 4000);
  };

  const statItemCounts = useMemo(
    () => countAllStatItems(statBlock.stats),
    [statBlock.stats]
  );

  const activeStatTemplatePreset = useMemo(
    () =>
      inferStatTemplatePreset(
        statBlock.formatTemplate,
        statBlock.templatePreset
      ),
    [statBlock.formatTemplate, statBlock.templatePreset]
  );

  const liveRenderedStatPreview = useMemo(
    () => renderInitialStatBlockInstance(statBlock),
    [statBlock]
  );

  // Character Reaction Images & Expressions Studio Handlers
  const reactionImages = useMemo<ReactionImageItem[]>(
    () => (Array.isArray(character.reactionImages) ? character.reactionImages : []),
    [character.reactionImages]
  );

  const handleUploadReactionFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter((file) => {
      const lower = file.name.toLowerCase();
      return (
        file.type === 'image/png' ||
        file.type === 'image/jpeg' ||
        file.type === 'image/webp' ||
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp')
      );
    });

    if (validFiles.length === 0) {
      setConceptError({
        message: 'Please select valid .png, .jpg, or .webp reaction images.',
      });
      return;
    }

    setIsUploadingReactions(true);
    setReactionsExpanded(true);
    setConceptError(null);

    try {
      const addedItems: ReactionImageItem[] = [];
      for (let i = 0; i < validFiles.length; i++) {
        const compressed = await compressImageForReactionAsset(validFiles[i], 640);
        addedItems.push({
          id: `react-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: compressed.nameStem,
          uri: compressed.dataUrl,
          ext: compressed.ext,
          triggerRule: '',
        });
      }

      if (addedItems.length > 0) {
        setCharacter((prev) => ({
          ...prev,
          reactionImages: [...(prev.reactionImages || []), ...addedItems],
        }));
        setReactionBanner(
          `Added ${addedItems.length} reaction sprite${addedItems.length === 1 ? '' : 's'} (compressed to ≤640px WebP/PNG for V3 embedding).`
        );
        scheduleTimer(() => setReactionBanner(null), 4000);
      }
    } catch (err: unknown) {
      setConceptError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to process reaction image(s).',
      });
    } finally {
      setIsUploadingReactions(false);
    }
  };

  const handleAddReactionUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = reactionUrlInput.trim();
    if (!cleanUrl) return;
    if (!/^(https?:\/\/|data:image\/)/i.test(cleanUrl)) {
      setConceptError({
        message: 'Reaction image URL must start with https://, http://, or data:image/.',
      });
      return;
    }

    const cleanName =
      reactionUrlName.trim().replace(/\s+/g, '_').toLowerCase() || 'neutral';
    const pathMatch = cleanUrl.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
    const ext = pathMatch && pathMatch[1] ? pathMatch[1].toLowerCase() : 'png';

    const newItem: ReactionImageItem = {
      id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      uri: cleanUrl,
      ext,
      triggerRule: '',
    };

    setReactionsExpanded(true);
    setCharacter((prev) => ({
      ...prev,
      reactionImages: [...(prev.reactionImages || []), newItem],
    }));
    setReactionUrlName('');
    setReactionUrlInput('');
    setReactionBanner(`Added "${cleanName}" reaction image URL.`);
    scheduleTimer(() => setReactionBanner(null), 3500);
  };

  const handleUpdateReactionItem = (
    id: string,
    patch: Partial<ReactionImageItem>
  ) => {
    setCharacter((prev) => ({
      ...prev,
      reactionImages: (prev.reactionImages || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleDeleteReactionItem = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      reactionImages: (prev.reactionImages || []).filter(
        (item) => item.id !== id
      ),
    }));
  };

  const handleDownloadReactionSprite = async (item: ReactionImageItem) => {
    const filename = `${sanitizeFilename(character.name || 'character')}_${sanitizeFilename(item.name || 'reaction')}.${item.ext || 'webp'}`;
    try {
      const response = await fetch(item.uri);
      const blob = await response.blob();
      triggerBrowserDownload(blob, filename);
    } catch {
      const anchor = document.createElement('a');
      anchor.href = item.uri;
      anchor.download = filename;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const handleGenerateReactionRuleWithAI = async (item: ReactionImageItem) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingReactionId(item.id);
    setConceptError(null);

    const otherReactionsSummary = reactionImages
      .filter((r) => r.id !== item.id)
      .map(
        (r) =>
          `- ${r.name || 'neutral'}: ${r.triggerRule || 'no trigger defined yet'}`
      )
      .join('\n');

    const characterFullContext = [
      `Character Name: ${character.name || '{{char}}'}`,
      character.nickname ? `Nickname: ${character.nickname}` : '',
      character.tags.length > 0
        ? `Character Tags: ${character.tags.join(', ')}`
        : '',
      character.description ? `Description:\n${character.description}` : '',
      character.personality ? `Personality:\n${character.personality}` : '',
      character.scenario ? `Scenario:\n${character.scenario}` : '',
      otherReactionsSummary
        ? `Other Configured Reactions:\n${otherReactionsSummary}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const visionImagesForCall = visionSupported
      ? Array.from(
          new Set([
            ...activeCharacterVisionUrls,
            ...(item.uri.startsWith('data:image/') ? [item.uri] : []),
          ])
        )
      : undefined;

    const prompt = [
      `Write a concise, vivid 1-sentence trigger condition specifying when ${character.name || '{{char}}'} should display the "${item.name || 'neutral'}" reaction/expression image during roleplay.`,
      item.triggerRule.trim()
        ? `Current Draft / Hint: "${item.triggerRule.trim()}"`
        : '',
      `Base it directly on {{char}}'s personality, emotional quirks, and attached tags. Output ONLY the 1-sentence trigger rule without quotes.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        characterFullContext,
        aiConfig,
        controller.signal,
        {
          maxTokens: Math.max(4096, aiConfig.maxTokens || 4096),
          temperature: 0.65,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrls:
            visionImagesForCall && visionImagesForCall.length > 0
              ? visionImagesForCall
              : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        handleUpdateReactionItem(item.id, {
          triggerRule: detailed.content.trim().replace(/^["']|["']$/g, ''),
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message: 'Failed to generate reaction trigger rule with AI.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setGeneratingReactionId(null);
      }
    }
  };

  const handleCompileReactionRulesToCard = () => {
    const cleanPostHistory = (character.post_history_instructions || '')
      .replace(
        /\n*\[System Directive: Character Reaction & Expression Triggers\][\s\S]*?(?=\n*\[System Directive:|$)/i,
        ''
      )
      .trim();

    if (reactionImages.length === 0) {
      updateCharacterField('post_history_instructions', cleanPostHistory);
      setReactionBanner(
        'Cleared previous Reaction & Expression Triggers block from Post-History Instructions.'
      );
      scheduleTimer(() => setReactionBanner(null), 3500);
      return;
    }

    const ruleLines = reactionImages.map((item) => {
      const cleanName = (item.name || 'neutral').trim() || 'neutral';
      const cleanRule =
        (item.triggerRule || '').trim() ||
        `Shows when ${character.name || '{{char}}'} expresses ${cleanName}.`;
      const isExternalUrl = /^https?:\/\//i.test(item.uri);
      if (isExternalUrl) {
        return `- ${cleanName} | Trigger: ${cleanRule} | Cue: ![${cleanName}](${item.uri})`;
      }
      return `- Expression Asset: "${cleanName}" | Trigger: ${cleanRule} | Cue: [Expression: ${cleanName}]`;
    });

    const compiledBlock = [
      '[System Directive: Character Reaction & Expression Triggers]',
      'Match {{char}}\'s emotional state to the closest reaction below and include its expression cue when the trigger condition occurs:',
      ...ruleLines,
    ].join('\n');

    const updatedPostHistory = [cleanPostHistory, compiledBlock]
      .filter(Boolean)
      .join('\n\n');

    updateCharacterField('post_history_instructions', updatedPostHistory);
    setReactionBanner(
      `Compiled ${reactionImages.length} reaction trigger rule${reactionImages.length === 1 ? '' : 's'} into Post-History Instructions (Stat Tracker preserved).`
    );
    scheduleTimer(() => setReactionBanner(null), 4000);
  };

  // Reusable SillyTavern 2:3 Portrait Slot Component
  const renderPortraitUploaderSlot = () => {
    const initials = (character.name || 'TS')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div className="w-full sm:w-44 shrink-0 space-y-2">
        <div
          onClick={() => portraitInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              void handlePortraitImageSelected(e.dataTransfer.files[0]);
            }
          }}
          style={{
            borderColor: 'var(--theme-accent)',
          }}
          className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl border-2 bg-slate-950 shadow-md cursor-pointer"
          title="Click or drop an image to upload Character Portrait (2:3 SillyTavern aspect ratio)"
        >
          {character.avatar ? (
            <img
              src={character.avatar}
              alt={character.name}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-3 text-center">
              <div
                style={{
                  color: 'var(--theme-accent)',
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full border bg-slate-900/90 text-xl font-bold tracking-tight"
              >
                {initials}
              </div>
              <span className="mt-2.5 text-xs font-semibold text-slate-200 line-clamp-1">
                {character.name || 'Untitled'}
              </span>
              <span className="mt-1 font-mono text-[10px] text-slate-400">
                2:3 Portrait (512×768)
              </span>
              <span
                style={{ color: 'var(--theme-accent)' }}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
              >
                <Upload className="h-3 w-3" />
                <span>Upload / Drop</span>
              </span>
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 p-2 text-center">
            <ImageIcon className="h-5 w-5 text-white" />
            <span className="text-[11px] font-semibold text-white">
              {character.avatar ? 'Replace Portrait' : 'Upload Portrait'}
            </span>
            <span className="font-mono text-[10px] text-slate-300">
              Auto-checks 2:3 ratio
            </span>
          </div>
        </div>

        {/* Portrait Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => portraitInputRef.current?.click()}
            className="theme-hover-outline flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Upload className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
            <span>Upload</span>
          </button>

          {character.avatar && (
            <>
              <button
                type="button"
                onClick={() => void handleOpenManualCropper()}
                title="Adjust or crop portrait to 2:3 SillyTavern resolution"
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-900 dark:text-white cursor-pointer"
              >
                <Crop
                  className="h-3 w-3"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Crop 2:3</span>
              </button>

              <button
                type="button"
                onClick={() => updateCharacterField('avatar', undefined)}
                title="Remove custom portrait"
                className="rounded-lg border border-rose-200 dark:border-rose-900/40 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Full-Width, Overhauled Expandable DM / GM Stat-Block Builder Section (Collapsed by Default; Supports Nested Sub-Stats)
  const renderStatBlockBuilderPanel = () => (
    <section
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      }}
      className="w-full rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-2xs"
    >
      {/* Expandable Section Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${
          statBlockExpanded
            ? 'border-b border-slate-200 dark:border-slate-800 pb-3.5'
            : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setStatBlockExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <Activity
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white group-hover:underline">
              Character Stat Tracker
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {statBlockExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>
                    Expand ({statItemCounts.topLevel} Stat
                    {statItemCounts.topLevel === 1 ? '' : 's'}
                    {statItemCounts.subStats > 0
                      ? ` · ${statItemCounts.subStats} Sub`
                      : ''}
                    )
                  </span>
                </>
              )}
            </span>
          </button>
          <Tooltip
            title="Live Chat Stat Tracker"
            content="Track numbers, progress bars [████░░], mood text, inventory lists, or nested sub-stats during roleplay. Collapsed by default to keep your workspace clean."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={statBlock.enableDMTracker}
              onChange={(e) =>
                setStatBlock((prev) => ({
                  ...prev,
                  enableDMTracker: e.target.checked,
                }))
              }
              style={{ accentColor: 'var(--theme-accent)' }}
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Enable Stat Tracker
            </span>
          </label>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            ({tokenBreakdown.stat_block} tkn)
          </span>
          <button
            type="button"
            onClick={handleAddStatItem}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1 rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Stat</span>
          </button>
        </div>
      </div>

      {compiledBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{compiledBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setCompiledBanner(null)}
            className="text-emerald-600 dark:text-emerald-300 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {statBlockExpanded && (
        <div
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          }}
          className="grid gap-6 items-start"
        >
          {/* LEFT COLUMN: Hierarchical Stat & Sub-Stat Manager */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Tracked Stats ({statItemCounts.topLevel}
                {statItemCounts.subStats > 0
                  ? ` + ${statItemCounts.subStats} sub`
                  : ''}
                )
              </span>
              <span className="text-[11px] text-slate-500">
                Drag to reorder · Add nested sub-stats inside any stat
              </span>
            </div>

            <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
              {statBlock.stats.map((stat, idx) => {
                const isGeneratingThisRule = generatingStatRuleId === stat.id;
                const isDragOver = dragOverStatIdx === idx;
                const subStats = stat.subStats || [];
                return (
                  <div
                    key={stat.id}
                    draggable
                    onDragStart={() => setDraggedStatIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedStatIdx !== null && draggedStatIdx !== idx) {
                        setDragOverStatIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverStatIdx === idx) {
                        setDragOverStatIdx(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedStatIdx !== null) {
                        handleDropReorderStatItem(draggedStatIdx, idx);
                      }
                      setDraggedStatIdx(null);
                      setDragOverStatIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggedStatIdx(null);
                      setDragOverStatIdx(null);
                    }}
                    style={{
                      borderColor: isDragOver
                        ? 'var(--theme-accent)'
                        : 'color-mix(in srgb, var(--theme-accent) 28%, transparent)',
                    }}
                    className={`rounded-xl border bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-3 transition-all ${
                      isDragOver ? 'ring-2 ring-amber-500/40' : ''
                    }`}
                  >
                    {/* Row 1: Drag Handle, Stat Label, Type Selector, + Sub-Stat, Reorder & Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        title="Drag to reorder stat"
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 pt-4 shrink-0"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <div className="flex-1 min-w-[145px]">
                        <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-0.5">
                          Stat Name
                        </label>
                        <input
                          type="text"
                          value={stat.label}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              label: e.target.value,
                            })
                          }
                          placeholder="Stat Label (e.g., Combat, Affection, Sanity)"
                          className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="min-w-[135px]">
                        <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-0.5">
                          Stat Type
                        </label>
                        <select
                          value={stat.type}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              type: e.target.value as StatItemType,
                            })
                          }
                          className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          <option value="bar">Bar [████░░]</option>
                          <option value="number">Number</option>
                          <option value="text">Text / Status</option>
                          <option value="list">Inventory List</option>
                          <option value="group">Group Header</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 pt-4 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddSubStatItem(stat.id)}
                          title="Add a sub-stat nested inside this stat"
                          style={{ borderColor: 'var(--theme-accent)' }}
                          className="theme-hover-outline flex items-center gap-1 rounded border bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          <Plus
                            className="h-3 w-3"
                            style={{ color: 'var(--theme-accent)' }}
                          />
                          <span>Sub-Stat</span>
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveStatItem(idx, -1)}
                          title="Move stat up"
                          className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === statBlock.stats.length - 1}
                          onClick={() => handleMoveStatItem(idx, 1)}
                          title="Move stat down"
                          className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStatItem(stat.id)}
                          title="Delete stat"
                          className="rounded border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Initial Value, Min/Max, Unit (omitted for pure Group Headers) */}
                    {stat.type !== 'group' ? (
                      <>
                        <div
                          style={{
                            gridTemplateColumns:
                              'repeat(auto-fit, minmax(min(100%, 105px), 1fr))',
                          }}
                          className="grid gap-2.5"
                        >
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Initial Value
                            </label>
                            <input
                              type="text"
                              value={stat.defaultValue}
                              onChange={(e) =>
                                handleUpdateStatItem(stat.id, {
                                  defaultValue: e.target.value,
                                })
                              }
                              className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          {(stat.type === 'bar' || stat.type === 'number') && (
                            <>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                                  Min Value
                                </label>
                                <input
                                  type="number"
                                  value={stat.min ?? 0}
                                  onChange={(e) =>
                                    handleUpdateStatItem(stat.id, {
                                      min: Number(e.target.value),
                                    })
                                  }
                                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                                  Max Value
                                </label>
                                <input
                                  type="number"
                                  value={stat.max ?? 100}
                                  onChange={(e) =>
                                    handleUpdateStatItem(stat.id, {
                                      max: Number(e.target.value),
                                    })
                                  }
                                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                                  Unit (e.g. %, HP)
                                </label>
                                <input
                                  type="text"
                                  value={stat.unit ?? ''}
                                  onChange={(e) =>
                                    handleUpdateStatItem(stat.id, {
                                      unit: e.target.value,
                                    })
                                  }
                                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {stat.type === 'bar' && (
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            Preview:{' '}
                            <span className="text-slate-800 dark:text-slate-200">
                              {formatAsciiProgressBar(
                                stat.defaultValue,
                                stat.min ?? 0,
                                stat.max ?? 100,
                                stat.unit ?? ''
                              )}
                            </span>
                          </div>
                        )}

                        {/* Row 3: AI Update / Progression Rule + AI Generate Button */}
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              When Should This Stat Change?
                            </label>
                            <button
                              type="button"
                              disabled={isGeneratingThisRule}
                              onClick={() => handleGenerateStatRuleWithAI(stat)}
                              style={{ borderColor: 'var(--theme-accent)' }}
                              className="theme-hover-outline inline-flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                            >
                              {isGeneratingThisRule ? (
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
                              <span>AI Generate</span>
                            </button>
                          </div>
                          <input
                            type="text"
                            value={stat.changeRules}
                            onChange={(e) =>
                              handleUpdateStatItem(stat.id, {
                                changeRules: e.target.value,
                              })
                            }
                            placeholder="When and how should the AI modify this stat every turn?"
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
                        <span>
                          Group header container ({subStats.length} sub-stat
                          {subStats.length === 1 ? '' : 's'})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddSubStatItem(stat.id)}
                          className="font-semibold hover:underline cursor-pointer"
                          style={{ color: 'var(--theme-accent)' }}
                        >
                          + Add Sub-Stat
                        </button>
                      </div>
                    )}

                    {/* Nested Sub-Stats Container */}
                    {subStats.length > 0 && (
                      <div
                        style={{ borderColor: 'var(--theme-accent)' }}
                        className="mt-2 ml-3 border-l-2 pl-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CornerDownRight
                              className="h-3 w-3"
                              style={{ color: 'var(--theme-accent)' }}
                            />
                            <span>
                              Sub-Stats inside {stat.label || 'Stat'} (
                              {subStats.length})
                            </span>
                          </span>
                        </div>

                        {subStats.map((sub, subIdx) => {
                          const isGeneratingSubRule =
                            generatingStatRuleId === sub.id;
                          return (
                            <div
                              key={sub.id}
                              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex-1 min-w-[130px]">
                                  <label className="block text-[9px] font-medium uppercase tracking-wider text-slate-400 mb-0.5">
                                    Sub-Stat Name
                                  </label>
                                  <input
                                    type="text"
                                    value={sub.label}
                                    onChange={(e) =>
                                      handleUpdateStatItem(sub.id, {
                                        label: e.target.value,
                                      })
                                    }
                                    placeholder="e.g., Trust, HP, Stamina"
                                    className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                                  />
                                </div>

                                <div className="min-w-[125px]">
                                  <label className="block text-[9px] font-medium uppercase tracking-wider text-slate-400 mb-0.5">
                                    Type
                                  </label>
                                  <select
                                    value={sub.type}
                                    onChange={(e) =>
                                      handleUpdateStatItem(sub.id, {
                                        type: e.target.value as StatItemType,
                                      })
                                    }
                                    className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                                  >
                                    <option value="bar">Bar [████░░]</option>
                                    <option value="number">Number</option>
                                    <option value="text">Text / Status</option>
                                    <option value="list">Inventory List</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-1 pt-3.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={subIdx === 0}
                                    onClick={() =>
                                      handleMoveSubStatItem(
                                        stat.id,
                                        subIdx,
                                        -1
                                      )
                                    }
                                    title="Move sub-stat up"
                                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={subIdx === subStats.length - 1}
                                    onClick={() =>
                                      handleMoveSubStatItem(stat.id, subIdx, 1)
                                    }
                                    title="Move sub-stat down"
                                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStatItem(sub.id)}
                                    title="Delete sub-stat"
                                    className="rounded border border-rose-200 dark:border-rose-900/40 bg-slate-50 dark:bg-slate-950 p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>

                              <div
                                style={{
                                  gridTemplateColumns:
                                    'repeat(auto-fit, minmax(min(100%, 88px), 1fr))',
                                }}
                                className="grid gap-2"
                              >
                                <div>
                                  <label className="block text-[9px] font-medium text-slate-500 mb-0.5">
                                    Initial Value
                                  </label>
                                  <input
                                    type="text"
                                    value={sub.defaultValue}
                                    onChange={(e) =>
                                      handleUpdateStatItem(sub.id, {
                                        defaultValue: e.target.value,
                                      })
                                    }
                                    className="theme-focus-ring font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-white"
                                  />
                                </div>

                                {(sub.type === 'bar' ||
                                  sub.type === 'number') && (
                                  <>
                                    <div>
                                      <label className="block text-[9px] font-medium text-slate-500 mb-0.5">
                                        Min
                                      </label>
                                      <input
                                        type="number"
                                        value={sub.min ?? 0}
                                        onChange={(e) =>
                                          handleUpdateStatItem(sub.id, {
                                            min: Number(e.target.value),
                                          })
                                        }
                                        className="theme-focus-ring font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-white tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-medium text-slate-500 mb-0.5">
                                        Max
                                      </label>
                                      <input
                                        type="number"
                                        value={sub.max ?? 100}
                                        onChange={(e) =>
                                          handleUpdateStatItem(sub.id, {
                                            max: Number(e.target.value),
                                          })
                                        }
                                        className="theme-focus-ring font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-white tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-medium text-slate-500 mb-0.5">
                                        Unit
                                      </label>
                                      <input
                                        type="text"
                                        value={sub.unit ?? ''}
                                        onChange={(e) =>
                                          handleUpdateStatItem(sub.id, {
                                            unit: e.target.value,
                                          })
                                        }
                                        className="theme-focus-ring font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-white"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                    Update Rule
                                  </label>
                                  <button
                                    type="button"
                                    disabled={isGeneratingSubRule}
                                    onClick={() =>
                                      handleGenerateStatRuleWithAI(
                                        sub,
                                        stat.label
                                      )
                                    }
                                    style={{ borderColor: 'var(--theme-accent)' }}
                                    className="theme-hover-outline inline-flex items-center gap-1 rounded border bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                                  >
                                    {isGeneratingSubRule ? (
                                      <Loader2
                                        className="h-2.5 w-2.5 animate-spin"
                                        style={{ color: 'var(--theme-accent)' }}
                                      />
                                    ) : (
                                      <Sparkles
                                        className="h-2.5 w-2.5"
                                        style={{ color: 'var(--theme-accent)' }}
                                      />
                                    )}
                                    <span>AI Generate</span>
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={sub.changeRules}
                                  onChange={(e) =>
                                    handleUpdateStatItem(sub.id, {
                                      changeRules: e.target.value,
                                    })
                                  }
                                  placeholder="When should this sub-stat change?"
                                  className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-200"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {statBlock.stats.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
                  No stats added yet. Click &ldquo;+ Add Stat&rdquo; above to add RPG bars, relationship meters, inventory lists, or grouped sub-stats.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Template & Live Auto-Synced Preview */}
          <div className="space-y-4 min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Stat Block Layout &amp; Preview
                </h3>
                <p className="text-[11px] text-slate-500">
                  Shows at the end of each reply using placeholders like{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-300">
                    {'{{stat:Name}}'}
                  </code>{' '}
                  or{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-300">
                    {'{{stat:Parent.Sub}}'}
                  </code>
                  .
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'compact_rpg_bar', label: 'Compact RPG Bar' },
                    { id: 'markdown_table', label: 'Table' },
                    { id: 'collapsible_block', label: 'Collapsible' },
                  ] as const
                ).map((presetOpt) => {
                  const isActivePreset =
                    !statBlock.isCustomTemplate &&
                    activeStatTemplatePreset === presetOpt.id;
                  return (
                    <button
                      key={presetOpt.id}
                      type="button"
                      onClick={() =>
                        handleApplyStatTemplatePreset(presetOpt.id)
                      }
                      style={
                        isActivePreset
                          ? {
                              borderColor: 'var(--theme-accent)',
                              backgroundColor:
                                'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                            }
                          : undefined
                      }
                      className={`theme-hover-outline rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                        isActivePreset
                          ? 'text-slate-900 dark:text-white font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {presetOpt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Template Format
                </span>
                {statBlock.isCustomTemplate ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyStatTemplatePreset(activeStatTemplatePreset)
                    }
                    className="inline-flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                    style={{ color: 'var(--theme-accent)' }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Re-sync Layout to Stats</span>
                  </button>
                ) : (
                  <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    Auto-Synced with Stats
                  </span>
                )}
              </div>

              <textarea
                rows={6}
                value={statBlock.formatTemplate}
                onChange={(e) =>
                  setStatBlock((prev) => ({
                    ...prev,
                    formatTemplate: e.target.value,
                    isCustomTemplate: true,
                  }))
                }
                className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Live Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                <span>Starting Stat Preview (added to First Message)</span>
                <span className="font-mono tabular-nums">
                  {estimateTokens(liveRenderedStatPreview)} tkn
                </span>
              </div>
              <pre className="font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 rounded-lg p-3.5 overflow-x-auto border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
                {liveRenderedStatPreview || 'No template set yet'}
              </pre>
            </div>

            {/* Apply Stat Tracker CTA */}
            <button
              type="button"
              onClick={handleCompileStatBlockToCard}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline w-full flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              <Zap
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Apply Stat Tracker to Character</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );

  // Full-Width Collapsible SillyTavern V3 Character Reaction Images & Expressions Studio (Collapsed by Default)
  const renderReactionImagesPanel = () => (
    <section
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      }}
      className="w-full rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-2xs"
    >
      <input
        ref={reactionFileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          void handleUploadReactionFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Expandable Section Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${
          reactionsExpanded
            ? 'border-b border-slate-200 dark:border-slate-800 pb-3.5'
            : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setReactionsExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <Smile
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white group-hover:underline">
              Character Reaction Images
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {reactionsExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>
                    Expand ({reactionImages.length} Reaction
                    {reactionImages.length === 1 ? '' : 's'})
                  </span>
                </>
              )}
            </span>
          </button>
          <Tooltip
            title="SillyTavern V3 Reaction Assets"
            content="Embed expression sprites into V3 .PNG (ccv3) & .JSON data.assets, or link hosted reaction URLs, and compile AI trigger rules into Post-History Instructions."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => reactionFileInputRef.current?.click()}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            {isUploadingReactions ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span>Upload / Drop Reaction Images</span>
          </button>
        </div>
      </div>

      {reactionBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{reactionBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setReactionBanner(null)}
            className="text-emerald-600 dark:text-emerald-300 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {reactionsExpanded && (
        <div className="space-y-4">
          {/* 1. Add Reactions Toolbar: Primary Embedded V3 Upload/Dropzone + Secondary External URL Form */}
          <div className="space-y-2.5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingReactionFiles(true);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                setIsDraggingReactionFiles(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingReactionFiles(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleUploadReactionFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => reactionFileInputRef.current?.click()}
              style={{
                borderColor: isDraggingReactionFiles
                  ? 'var(--theme-accent)'
                  : 'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer ${
                isDraggingReactionFiles
                  ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                  : 'bg-slate-50/80 dark:bg-slate-950/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/70'
              }`}
            >
              <Upload
                className="h-5 w-5 mb-1.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Upload / Drop Embedded V3 Reaction Images (.png, .jpg, .webp)
                </span>
                <span
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
                    color: 'var(--theme-accent)',
                  }}
                  className="rounded border bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                >
                  Embedded in V3 data.assets
                </span>
              </div>
              <span className="mt-1 text-[11px] text-slate-500">
                Primary method · Multi-select supported · Auto-named from filename &amp; compressed to ≤640px WebP inside the exported card
              </span>
            </div>

            <form
              onSubmit={handleAddReactionUrl}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                <Link className="h-3 w-3" />
                <span>Or link external URL:</span>
              </div>
              <input
                type="text"
                value={reactionUrlName}
                onChange={(e) => setReactionUrlName(e.target.value)}
                placeholder="Name (e.g., blush)"
                className="theme-focus-ring sm:w-32 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="url"
                value={reactionUrlInput}
                onChange={(e) => setReactionUrlInput(e.target.value)}
                placeholder="https://example.com/sprites/blush.webp"
                className="theme-focus-ring flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!reactionUrlInput.trim()}
                className="theme-hover-outline rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                Add URL
              </button>
            </form>
          </div>

          {/* 2. Reaction Cards Grid */}
          {reactionImages.length > 0 ? (
            <div
              style={{
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              }}
              className="grid gap-4"
            >
              {reactionImages.map((item) => {
                const isGeneratingThis = generatingReactionId === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      borderColor:
                        'color-mix(in srgb, var(--theme-accent) 28%, transparent)',
                    }}
                    className="rounded-xl border bg-slate-50/70 dark:bg-slate-950/70 p-3 space-y-3 flex flex-col"
                  >
                    {/* Thumbnail Preview */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900/90 flex items-center justify-center">
                      <img
                        src={item.uri}
                        alt={item.name || 'reaction'}
                        className="h-full w-full object-contain"
                      />
                      <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-200">
                        .{item.ext || 'webp'}
                      </span>
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDownloadReactionSprite(item)}
                          title="Download reaction sprite"
                          className="rounded-md bg-black/70 p-1.5 text-slate-200 hover:text-white cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReactionItem(item.id)}
                          title="Delete reaction sprite"
                          className="rounded-md bg-black/70 p-1.5 text-rose-300 hover:text-rose-200 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Reaction / Emotion Name + Preset Dropdown */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Reaction / Emotion Name
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            handleUpdateReactionItem(item.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="e.g., blush, smug, desire"
                          className="theme-focus-ring flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-900 dark:text-white"
                        />
                        <select
                          value={
                            REACTION_EXPRESSION_PRESETS.includes(item.name)
                              ? item.name
                              : ''
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              handleUpdateReactionItem(item.id, {
                                name: e.target.value,
                              });
                            }
                          }}
                          title="Quick-select SillyTavern expression preset"
                          className="theme-focus-ring w-28 shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <option value="">Presets...</option>
                          {REACTION_EXPRESSION_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Trigger Rule + AI Generate */}
                    <div className="space-y-1.5 mt-auto">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          When Should This Reaction Show?
                        </label>
                        <button
                          type="button"
                          disabled={isGeneratingThis}
                          onClick={() =>
                            void handleGenerateReactionRuleWithAI(item)
                          }
                          style={{ borderColor: 'var(--theme-accent)' }}
                          className="theme-hover-outline inline-flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {isGeneratingThis ? (
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
                          <span>✨ AI Generate</span>
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={item.triggerRule}
                        onChange={(e) =>
                          handleUpdateReactionItem(item.id, {
                            triggerRule: e.target.value,
                          })
                        }
                        placeholder="Describe when {{char}} shows this reaction..."
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-y"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
              No reaction sprites added yet. Upload/drop expression images above or paste an image URL to embed V3 <code className="font-mono">data.assets</code> and compile AI reaction triggers.
            </div>
          )}

          {/* 3. Compiler CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-slate-500">
              Compiles triggers into <code className="font-mono">post_history_instructions</code> without overwriting your Stat Tracker block.
            </span>
            <button
              type="button"
              onClick={handleCompileReactionRulesToCard}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              <Zap
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Apply Reaction Rules to Character</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );

  // Reusable Greetings Carousel Section with Drag-and-Drop Alternate Greeting Reordering
  const renderGreetingsCarousel = () => (
    <div
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
      }}
      className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            First Message &amp; Alternate Greetings ({totalGreetingsCount})
          </span>
          <Tooltip content="Your opening message plus extra greetings users can swipe through in SillyTavern. Drag Alt tabs to reorder them." />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={activeGreetingIdx === 0}
            onClick={() => setActiveGreetingIdx((i) => Math.max(0, i - 1))}
            className="rounded border border-slate-200 dark:border-slate-800 p-1 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
            title="Previous Greeting"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Greeting Tabs (Alt tabs support drag-and-drop reordering) */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-xs sm:max-w-md">
            {Array.from({ length: totalGreetingsCount }).map((_, idx) => {
              const isSelected = idx === activeGreetingIdx;
              const isAlt = idx > 0;
              const altIdx = idx - 1;
              const isDragOver = isAlt && dragOverAltGreetingIdx === altIdx;

              return (
                <button
                  key={idx}
                  type="button"
                  draggable={isAlt}
                  onDragStart={() => {
                    if (isAlt) setDraggedAltGreetingIdx(altIdx);
                  }}
                  onDragOver={(e) => {
                    if (!isAlt) return;
                    e.preventDefault();
                    if (
                      draggedAltGreetingIdx !== null &&
                      draggedAltGreetingIdx !== altIdx
                    ) {
                      setDragOverAltGreetingIdx(altIdx);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverAltGreetingIdx === altIdx) {
                      setDragOverAltGreetingIdx(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!isAlt) return;
                    e.preventDefault();
                    if (draggedAltGreetingIdx !== null) {
                      handleDropReorderAltGreeting(
                        draggedAltGreetingIdx,
                        altIdx
                      );
                    }
                    setDraggedAltGreetingIdx(null);
                    setDragOverAltGreetingIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedAltGreetingIdx(null);
                    setDragOverAltGreetingIdx(null);
                  }}
                  onClick={() => setActiveGreetingIdx(idx)}
                  title={
                    isAlt
                      ? `Alternate Greeting #${altIdx + 1} (Drag tab to reorder)`
                      : 'Primary First Message (first_mes)'
                  }
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                        }
                      : isDragOver
                        ? { borderColor: 'var(--theme-accent)' }
                        : undefined
                  }
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAlt && (
                    <GripVertical className="h-2.5 w-2.5 opacity-60" />
                  )}
                  <span>
                    {idx === 0 ? '1 · first_mes' : `${idx + 1} · Alt #${idx}`}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={activeGreetingIdx >= totalGreetingsCount - 1}
            onClick={() =>
              setActiveGreetingIdx((i) =>
                Math.min(totalGreetingsCount - 1, i + 1)
              )
            }
            className="rounded border border-slate-200 dark:border-slate-800 p-1 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
            title="Next Greeting"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleAddBlankAlternateGreeting}
            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>New Alt</span>
          </button>

          <button
            type="button"
            onClick={handleDuplicateCurrentGreeting}
            title="Duplicate current greeting as an Alternate Greeting"
            className="rounded-md border border-slate-200 dark:border-slate-800 p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          {activeGreetingIdx > 0 && (
            <button
              type="button"
              onClick={handleDeleteCurrentAlternateGreeting}
              title="Delete this Alternate Greeting"
              className="rounded-md border border-rose-200 dark:border-rose-900/50 p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* AI Alternate Greeting Generator Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5">
        <input
          type="text"
          value={altGreetingTwist}
          onChange={(e) => setAltGreetingTwist(e.target.value)}
          placeholder="Optional scene idea for a new greeting (e.g., 'During a tavern brawl', 'Rainy night in the workshop')..."
          className="theme-focus-ring flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          disabled={isGeneratingGreeting}
          onClick={handleGenerateAIGreeting}
          style={{ borderColor: 'var(--theme-accent)' }}
          className="theme-hover-outline flex items-center justify-center gap-1.5 rounded-md border bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          {isGeneratingGreeting ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              style={{ color: 'var(--theme-accent)' }}
            />
          ) : (
            <MessageSquarePlus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
          )}
          <span>✨ Generate Alt Greeting</span>
        </button>
      </div>

      <SmartEditor
        label={
          activeGreetingIdx === 0
            ? 'First Message'
            : `Alternate Greeting #${activeGreetingIdx}`
        }
        fieldKey={
          activeGreetingIdx === 0
            ? 'first_mes'
            : `alternate_greeting_${activeGreetingIdx}`
        }
        value={currentGreetingValue}
        onChange={handleUpdateGreetingValue}
        tooltip="The opening message {{char}} sends when a new chat begins. Use *italics* for actions and quotes for spoken dialogue."
        rows={7}
        isPermanentTokenField={false}
        extraContextImages={extraContextImages}
      />
    </div>
  );

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
          void handleFilesSelected(e.dataTransfer.files);
        }
      }}
      className="relative flex flex-col lg:flex-row gap-6 items-start min-w-0 w-full"
    >
      {/* Hidden Portrait Uploader Input */}
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            void handlePortraitImageSelected(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />

      {/* Interactive 2:3 Portrait Cropper Modal */}
      {cropperState && (
        <PortraitCropperModal
          imageSrc={cropperState.sourceUrl}
          originalWidth={cropperState.naturalWidth}
          originalHeight={cropperState.naturalHeight}
          characterName={character.name}
          reason={cropperState.reason}
          onCancel={() => setCropperState(null)}
          onApplyCrop={(croppedPngDataUrl, outW, outH) => {
            updateCharacterField('avatar', croppedPngDataUrl);
            setCropperState(null);
            setImportStatusBanner(
              `Cropped and applied 2:3 SillyTavern portrait (${outW}×${outH} px) to ${character.name}.`
            );
            scheduleTimer(() => setImportStatusBanner(null), 3500);
          }}
        />
      )}

      {/* Collapsible Character Library Roster Sidebar */}
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
              <User
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Character Roster ({characters.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRosterOpen(false)}
              title="Collapse Character Roster"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* + New Character, Import Card & Rescan Save Folder Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => createNewCharacter()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-slate-900 dark:bg-white px-2.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Card</span>
            </button>

            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-white dark:bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
            >
              <Upload
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Import PNG/JSON</span>
            </button>
          </div>

          <input
            ref={importFileInputRef}
            type="file"
            accept=".png,.json,image/png,application/json,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Drag & Drop Steganography PNG / JSON Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              void handleFilesSelected(e.dataTransfer.files);
            }}
            onClick={() => importFileInputRef.current?.click()}
            style={
              isDraggingFile ? { borderColor: 'var(--theme-accent)' } : undefined
            }
            className={`rounded-lg border border-dashed p-2.5 text-center text-[11px] transition-colors cursor-pointer ${
              isDraggingFile
                ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            Drop SillyTavern <strong>.PNG</strong>, <strong>.JSON</strong>, or Portrait Image here
          </div>

          {importStatusBanner && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
              {importStatusBanner}
            </div>
          )}

          {/* Search & Sort Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search characters..."
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                aria-label="Sort Characters"
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
                aria-label="Filter Characters by Tag"
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

          {/* Character Cards List with Miniature 2:3 Portrait Thumbnails */}
          <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-0.5">
            {filteredAndSortedRoster.map(({ char, totalTokens }) => {
              const isSelected = char.id === activeCharacterId;
              const charInitials = (char.name || 'TS')
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={char.id}
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                        }
                      : undefined
                  }
                  className={`group rounded-lg border p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {/* Miniature 2:3 Portrait Avatar Thumbnail */}
                    <button
                      type="button"
                      onClick={() => setActiveCharacterId(char.id!)}
                      className="flex items-start gap-2.5 flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div
                        style={{
                          borderColor:
                            'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
                        }}
                        className="h-12 w-8 shrink-0 overflow-hidden rounded border bg-slate-900 flex items-center justify-center"
                      >
                        {char.avatar ? (
                          <img
                            src={char.avatar}
                            alt={char.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            style={{ color: 'var(--theme-accent)' }}
                            className="font-mono text-[10px] font-bold"
                          >
                            {charInitials}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {char.name || 'Untitled Character'}
                          </div>
                          {isCharacterNsfw(char, tags) && (
                            <span className="shrink-0 rounded bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 font-mono text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">
                              NSFW
                            </span>
                          )}
                        </div>
                        {char.nickname && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {char.nickname}
                          </div>
                        )}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">
                            {totalTokens.toLocaleString()} tkn
                          </span>
                          <span className="truncate max-w-24">
                            {(char.tags || []).slice(0, 2).join(' · ') ||
                              'No tags'}
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => char.id && requestDeleteCharacter(char.id)}
                      title="Permanently Delete Character"
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredAndSortedRoster.length === 0 && (
              <div className="py-6 px-3 text-center text-xs text-slate-400 space-y-1.5">
                {characters.length === 0 ? (
                  <>
                    <div className="font-medium text-slate-500 dark:text-slate-300">
                      No Characters Yet
                    </div>
                    <div>
                      Click <strong>+ New Card</strong> above or drop a SillyTavern <code>.PNG</code> / <code>.JSON</code> card here to begin.
                    </div>
                  </>
                ) : (
                  <div>No characters match your search or tag filter.</div>
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
          <span>Roster ({characters.length})</span>
        </button>
      )}

      {/* Main Character Workbench Area */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        {/* Top Workbench Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {character.name || 'Untitled Character'}
              </h1>
              {isCharacterNsfw(character, tags) && (
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
                  setCharacter((prev) => ({
                    ...prev,
                    isNsfw: !prev.isNsfw,
                    extensions: {
                      ...prev.extensions,
                      isNsfw: !prev.isNsfw,
                    },
                  }))
                }
                title="Toggle explicit manual NSFW flag on this character (characters with NSFW tags are also auto-flagged NSFW)"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-colors ${
                  character.isNsfw
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {character.isNsfw ? 'Manual NSFW: ON' : 'Flag NSFW'}
              </button>
              <span className="text-xs text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                v{character.character_version || '1.0.0'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Active Theme:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {activeTheme.name}
              </strong>{' '}
              · Permanent: {tokenBreakdown.permanentTokens} tkn · Initial:{' '}
              {tokenBreakdown.temporaryTokens} tkn
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportCharacterAsPng(
                  character,
                  character.character_book,
                  activeTheme.color
                )
              }
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
              title="Export SillyTavern PNG Card with embedded V2 chara & V3 ccv3 tEXt chunks"
            >
              <ImageIcon
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export .PNG</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportCharacterAsJson(
                  character,
                  settings.cardSpecVersion,
                  character.character_book
                )
              }
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Export SillyTavern JSON Card"
            >
              <Download
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export .JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('json_inspector')}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <FileJson
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Raw JSON</span>
            </button>
          </div>
        </div>

        {/* Error Banner if AI Concept/Greeting generation failed */}
        {conceptError && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{conceptError.message}</div>
                {conceptError.corsHint && (
                  <div className="text-[11px] opacity-90 mt-0.5">
                    {conceptError.corsHint}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConceptError(null)}
              className="text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Helpful Vision Adapter Fallback Toast (when local GGUF lacks mmproj projector) */}
        {visionFallbackBanner && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Vision (mmproj) Notice: </span>
                <span>{visionFallbackBanner}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVisionFallbackBanner(null)}
              className="text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Context-Only Extra Reference Images (shared across Wizard & Full Editor modes; never saved to card) */}
        <ContextImagesBar
          images={extraContextImages}
          onAddImages={handleAddExtraContextImages}
          onRemoveImage={handleRemoveExtraContextImage}
          onClearAll={handleClearExtraContextImages}
          entityLabel="Character"
          visionSupported={visionSupported}
        />

        {/* MODE A: GUIDED 5-STEP WIZARD MODE */}
        {settings.editorMode === 'wizard' ? (
          <div className="space-y-6">
            {/* Stepper Progress Header */}
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
                {WIZARD_STEPS.map((item) => {
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

            {/* Step 1: Concept & Core Identity + 2:3 Portrait Slot + "Generate Full Character from Concept" */}
            {wizardStep === 1 && (
              <div className="space-y-6">
                <form
                  onSubmit={handleGenerateFullCharacterFromConcept}
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
                        Generate Full Character from Concept
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500">
                      Uses Active Theme ({activeTheme.name}) &amp; Selected Tags
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Describe a character idea in 1–3 sentences (attached Portrait &amp; Context Images are included automatically when your selected model supports images) and let the AI draft the Name, Description, Personality, Scenario, First Message, and Example Dialogue.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={conceptPrompt}
                      onChange={(e) => setConceptPrompt(e.target.value)}
                      placeholder="e.g., An exiled clockwork alchemist running a midnight apothecary in a flooded gothic city..."
                      className="theme-focus-ring flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={
                        isGeneratingConcept ||
                        (!conceptPrompt.trim() &&
                          activeCharacterVisionUrls.length === 0)
                      }
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {isGeneratingConcept ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Drafting Full Card...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Generate Full Character</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Active Visual Context Status Pill (Auto-included if selected model supports images) */}
                  {activeCharacterVisionUrls.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
                        <span>
                          👁️ Auto-including Images:
                          {hasPortraitImage ? ' Portrait' : ''}
                          {hasPortraitImage && extraContextImages.length > 0
                            ? ' +'
                            : ''}
                          {extraContextImages.length > 0
                            ? ` ${extraContextImages.length} Extra Reference Image${extraContextImages.length > 1 ? 's' : ''}`
                            : ''}
                        </span>
                      </span>
                    </div>
                  ) : (
                    !visionSupported &&
                    (hasPortraitImage || extraContextImages.length > 0) && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300">
                          Selected model doesn&apos;t support images — generating from text &amp; tags only
                        </span>
                      </div>
                    )
                  )}
                </form>

                {/* Core Identity Fields + Portrait Slot */}
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Identity, Portrait &amp; Tags
                  </h3>

                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    {renderPortraitUploaderSlot()}

                    <div className="flex-1 min-w-0 w-full space-y-4">
                      <div
                        style={{
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
                        }}
                        className="grid gap-4"
                      >
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Character Name
                          </label>
                          <input
                            type="text"
                            value={character.name}
                            onChange={(e) =>
                              updateCharacterField('name', e.target.value)
                            }
                            onBlur={(e) => {
                              if (character.id) {
                                checkAndTriggerNameConflict(
                                  'character',
                                  character.id,
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
                            Nickname (V3)
                          </label>
                          <input
                            type="text"
                            value={character.nickname || ''}
                            onChange={(e) =>
                              updateCharacterField('nickname', e.target.value)
                            }
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Creator
                          </label>
                          <input
                            type="text"
                            value={character.creator}
                            onChange={(e) =>
                              updateCharacterField('creator', e.target.value)
                            }
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Version
                          </label>
                          <input
                            type="text"
                            value={character.character_version}
                            onChange={(e) =>
                              updateCharacterField(
                                'character_version',
                                e.target.value
                              )
                            }
                            className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <TagSelector
                        tags={tags}
                        selectedTagNames={character.tags}
                        onToggleTag={toggleCharacterTag}
                        onAddCustomTag={(tagName) => handleAddCustomCharacterTag(tagName)}
                        label="Character Tags"
                        subtitle="Tags help guide the AI when generating your character"
                        tooltip="Click tags below to shape how the AI writes this character. Any 18+ tag automatically flags the card as NSFW."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Description & Personality */}
            {wizardStep === 2 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Description"
                  fieldKey="description"
                  value={character.description}
                  onChange={(val) => updateCharacterField('description', val)}
                  tooltip="How {{char}} looks, what they wear, their background, and key traits."
                  rows={7}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
                <SmartEditor
                  label="Personality"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="How {{char}} acts, speaks, and reacts to others."
                  rows={5}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
              </div>
            )}

            {/* Step 3: Scenario & Greetings Carousel */}
            {wizardStep === 3 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Scenario"
                  fieldKey="scenario"
                  value={character.scenario}
                  onChange={(val) => updateCharacterField('scenario', val)}
                  tooltip="Where the story starts and the situation between {{char}} and {{user}}."
                  rows={4}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
                {renderGreetingsCarousel()}
              </div>
            )}

            {/* Step 4: Example Dialogue & System Prompts */}
            {wizardStep === 4 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Example Dialogue"
                  fieldKey="mes_example"
                  value={character.mes_example}
                  onChange={(val) => updateCharacterField('mes_example', val)}
                  tooltip="Sample back-and-forth lines using <START>, {{user}}, and {{char}} to show the AI how {{char}} talks."
                  rows={6}
                  isPermanentTokenField={false}
                  extraContextImages={extraContextImages}
                />
                <SmartEditor
                  label="System Prompt"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Optional custom rules for how the AI should roleplay this character."
                  rows={4}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
                <SmartEditor
                  label="Post-History Instructions"
                  fieldKey="post_history_instructions"
                  value={character.post_history_instructions}
                  onChange={(val) =>
                    updateCharacterField('post_history_instructions', val)
                  }
                  tooltip="High-priority reminders placed near the bottom of the chat right before the AI replies."
                  rows={4}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
                <SmartEditor
                  label="Creator Notes"
                  fieldKey="creator_notes"
                  value={character.creator_notes}
                  onChange={(val) => updateCharacterField('creator_notes', val)}
                  tooltip="Notes for other players (not sent to the AI during chat)."
                  rows={3}
                  isPermanentTokenField={false}
                  extraContextImages={extraContextImages}
                />
              </div>
            )}

            {/* Step 5: Full-Width Stat Tracker, Reaction Images & Final Review */}
            {wizardStep === 5 && (
              <div className="space-y-6">
                {renderStatBlockBuilderPanel()}
                {renderReactionImagesPanel()}

                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Card Summary
                  </h3>
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                    }}
                    className="grid gap-3 text-xs"
                  >
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Permanent Tokens</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.permanentTokens} tkn
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Greeting + Examples</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.temporaryTokens} tkn
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Alternate Greetings</span>
                      <span className="font-mono font-semibold">
                        {character.alternate_greetings.length}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Total Tokens</span>
                      <span className="font-mono font-bold">
                        {tokenBreakdown.totalCardTokens} tkn
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateSettings({ editorMode: 'sandbox' })}
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      Open in Full Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('json_inspector')}
                      className="theme-hover-outline rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Open Raw JSON &amp; Export
                    </button>
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
          /* MODE B: FULL SANDBOX WORKBENCH */
          <div className="space-y-6">
            {/* Identity, Portrait & Tags Card */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Identity, Portrait &amp; Tags
                  </h2>
                  <Tooltip content="Upload or drop a portrait image (automatically cropped to 2:3 if needed), edit card info, and pick tags for your character." />
                </div>

                {/* Linked Lorebook Selector */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Linked Lorebook:</span>
                  <select
                    value={character.character_book?.id || ''}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        updateCharacterField('character_book', undefined);
                        return;
                      }
                      const found = lorebooks.find(
                        (l) => l.id === e.target.value
                      );
                      if (found) {
                        updateCharacterField('character_book', found);
                      }
                    }}
                    className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="">None (Unlinked)</option>
                    {character.character_book &&
                      !lorebooks.some(
                        (lb) => lb.id === character.character_book?.id
                      ) && (
                        <option
                          value={character.character_book.id || '__embedded__'}
                        >
                          {character.character_book.name ||
                            'Embedded Lorebook'}{' '}
                          ({character.character_book.entries?.length ?? 0}{' '}
                          entries)
                        </option>
                      )}
                    {lorebooks.map((lb) => (
                      <option key={lb.id} value={lb.id}>
                        {lb.name} ({lb.entries.length} entries)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* Left: Prominent 2:3 Character Portrait Uploader & Cropper Slot */}
                {renderPortraitUploaderSlot()}

                {/* Right: Character Details & Tags */}
                <div className="flex-1 min-w-0 w-full space-y-4">
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
                    }}
                    className="grid gap-4"
                  >
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Character Name</span>
                        <Tooltip content="Fills in {{char}} across your descriptions, scenario, and greetings." />
                      </label>
                      <input
                        type="text"
                        value={character.name}
                        onChange={(e) =>
                          updateCharacterField('name', e.target.value)
                        }
                        onBlur={(e) => {
                          if (character.id) {
                            checkAndTriggerNameConflict(
                              'character',
                              character.id,
                              e.target.value,
                              'rename'
                            );
                          }
                        }}
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Nickname (V3)</span>
                        <Tooltip content="Optional nickname or title used by SillyTavern V3 cards." />
                      </label>
                      <input
                        type="text"
                        value={character.nickname || ''}
                        onChange={(e) =>
                          updateCharacterField('nickname', e.target.value)
                        }
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Creator</span>
                        <Tooltip content="Your name or handle saved inside the card." />
                      </label>
                      <input
                        type="text"
                        value={character.creator}
                        onChange={(e) =>
                          updateCharacterField('creator', e.target.value)
                        }
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Version</span>
                        <Tooltip content="Version number to keep track of your card edits (e.g. 1.0.0)." />
                      </label>
                      <input
                        type="text"
                        value={character.character_version}
                        onChange={(e) =>
                          updateCharacterField(
                            'character_version',
                            e.target.value
                          )
                        }
                        className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Character Tags */}
                  <div className="pt-1">
                    <TagSelector
                      tags={tags}
                      selectedTagNames={character.tags}
                      onToggleTag={toggleCharacterTag}
                      onAddCustomTag={(tagName) => handleAddCustomCharacterTag(tagName)}
                      label="Character Tags"
                      subtitle="Tags help guide the AI when generating your character"
                      tooltip="Click tags below to shape how the AI writes this character. Any 18+ tag automatically flags the card as NSFW."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width Character Stat Tracker Section */}
            {renderStatBlockBuilderPanel()}

            {/* Full-Width Character Reaction Images & Expressions Studio */}
            {renderReactionImagesPanel()}

            {/* Full-Width Character Definition Editors */}
            <div className="space-y-5">
              <SmartEditor
                label="Description"
                fieldKey="description"
                value={character.description}
                onChange={(val) => updateCharacterField('description', val)}
                tooltip="How {{char}} looks, what they wear, their backstory, and key traits. Always included in chat."
                rows={6}
                isPermanentTokenField={true}
                extraContextImages={extraContextImages}
              />

              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                }}
                className="grid gap-5 items-start"
              >
                <SmartEditor
                  label="Personality"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="How {{char}} acts, speaks, thinks, and reacts to others."
                  rows={5}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />

                <SmartEditor
                  label="Scenario"
                  fieldKey="scenario"
                  value={character.scenario}
                  onChange={(val) => updateCharacterField('scenario', val)}
                  tooltip="Where the story starts and the situation between {{char}} and {{user}}."
                  rows={5}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
              </div>

              {/* First Message & Alternate Greetings Carousel */}
              {renderGreetingsCarousel()}

              <SmartEditor
                label="Example Dialogue"
                fieldKey="mes_example"
                value={character.mes_example}
                onChange={(val) => updateCharacterField('mes_example', val)}
                tooltip="Sample chats using <START>, {{user}}, and {{char}} to teach the AI how {{char}} speaks and formats replies."
                rows={5}
                isPermanentTokenField={false}
                extraContextImages={extraContextImages}
              />

              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                }}
                className="grid gap-5 items-start"
              >
                <SmartEditor
                  label="System Prompt"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Optional custom rules that override or add to SillyTavern's main prompt for this character."
                  rows={4}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />

                <SmartEditor
                  label="Post-History Instructions"
                  fieldKey="post_history_instructions"
                  value={character.post_history_instructions}
                  onChange={(val) =>
                    updateCharacterField('post_history_instructions', val)
                  }
                  tooltip="High-priority reminders added near the end of chat history right before the AI replies. Stat Tracker rules also go here."
                  rows={4}
                  isPermanentTokenField={true}
                  extraContextImages={extraContextImages}
                />
              </div>

              <SmartEditor
                label="Creator Notes"
                fieldKey="creator_notes"
                value={character.creator_notes}
                onChange={(val) => updateCharacterField('creator_notes', val)}
                tooltip="Tips and notes for users downloading your card (never sent to the AI or counted as chat tokens)."
                rows={3}
                isPermanentTokenField={false}
                extraContextImages={extraContextImages}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
