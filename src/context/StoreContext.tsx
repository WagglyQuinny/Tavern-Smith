import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  AppSettings,
  AIBackendConfig,
  CharacterCardData,
  ContextTheme,
  Lorebook,
  SavedFileEntry,
  SaveLogEntry,
  StatBlockConfig,
  TagDefinition,
  TavernSmithMetaPayload,
  TokenBreakdown,
  WorkspaceTab,
} from '../types';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';
import {
  importCardFromFile,
  parseImportedJsonString,
  sanitizeFilename,
  serializeCharacterCard,
  triggerBrowserDownload,
} from '../utils/cardIO';
import {
  clearDirectoryHandleFromIndexedDB,
  loadDirectoryHandleFromIndexedDB,
  queryDirectoryHandlePermission,
  requestDirectoryHandlePermission,
  saveDirectoryHandleToIndexedDB,
  StoredDirectoryRecord,
} from '../utils/folderDb';

const STORAGE_KEY = 'tavernsmith_ide_state_v2';
export const META_FILENAME = '_tavernsmith_meta.json';
export const UNIFIED_INTERNAL_ROOT = '/TavernSmith_Saves/';

const AUTO_TAG_PALETTE = [
  '#a855f7',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#3b82f6',
  '#eab308',
  '#14b8a6',
];

export const DEFAULT_CONTEXT_THEMES: ContextTheme[] = [
  {
    id: 'theme-dark-fantasy',
    name: 'Dark Fantasy',
    color: '#d97706',
    aiContextPrompt:
      'Write in an atmospheric, grounded grimdark fantasy register. Emphasize sensory worldbuilding—weathered stone, iron, candlelight, ancient curses, and moral ambiguity. Avoid modern slang; dialogue should reflect social station, archaic oaths, and guarded intent.',
    associatedTags: ['Grimdark', 'Low Magic', 'Gothic', 'Medieval'],
    isBuiltIn: true,
  },
  {
    id: 'theme-scifi-cyberpunk',
    name: 'Sci-Fi Cyberpunk',
    color: '#06b6d4',
    aiContextPrompt:
      'Maintain a high-tech, low-life speculative fiction aesthetic. Weave corporate espionage, neural augmentations, synthetic rain, orbital megastructures, and street-level survival into character voice and environmental cues. Keep pacing taut and observant.',
    associatedTags: ['Cyberpunk', 'Hard Sci-Fi', 'Dystopian', 'Netrunner'],
    isBuiltIn: true,
  },
  {
    id: 'theme-slice-of-life',
    name: 'Slice of Life',
    color: '#10b981',
    aiContextPrompt:
      'Focus on naturalistic interpersonal dynamics, subtle emotional subtext, everyday routines, and warm character chemistry. Ground scenes in tactile modern environments—coffee shops, rain on apartment windows, university corridors, and unhurried conversation.',
    associatedTags: ['Contemporary', 'Slow Burn', 'Cozy', 'Character Driven'],
    isBuiltIn: true,
  },
];

export const DEFAULT_TAG_LIBRARY: TagDefinition[] = [
  {
    id: 'tag-grimdark',
    name: 'Grimdark',
    color: '#d97706',
    category: 'tone',
    aiContextDescription:
      'Consequences are permanent and survival requires hard choices; magic and power always exact a toll.',
  },
  {
    id: 'tag-low-magic',
    name: 'Low Magic',
    color: '#b45309',
    category: 'world',
    aiContextDescription:
      'Arcane phenomena are rare, feared, and mysterious rather than commonplace utility.',
  },
  {
    id: 'tag-gothic',
    name: 'Gothic',
    color: '#9333ea',
    category: 'genre',
    aiContextDescription:
      'Ancestral decay, brooding architecture, psychological tension, and haunted lineage.',
  },
  {
    id: 'tag-medieval',
    name: 'Medieval',
    color: '#78716c',
    category: 'world',
    aiContextDescription:
      'Feudal obligations, guild politics, steel weaponry, and pre-industrial travel constraints.',
  },
  {
    id: 'tag-cyberpunk',
    name: 'Cyberpunk',
    color: '#06b6d4',
    category: 'genre',
    aiContextDescription:
      'Hyper-corporatized urban sprawl, cyberware integration, and underground data syndicates.',
  },
  {
    id: 'tag-hard-scifi',
    name: 'Hard Sci-Fi',
    color: '#3b82f6',
    category: 'world',
    aiContextDescription:
      'Respect orbital mechanics, signal latency, thermodynamic limits, and plausible engineering.',
  },
  {
    id: 'tag-dystopian',
    name: 'Dystopian',
    color: '#ef4444',
    category: 'tone',
    aiContextDescription:
      'Pervasive surveillance, stratified resource access, and systemic institutional pressure.',
  },
  {
    id: 'tag-netrunner',
    name: 'Netrunner',
    color: '#22d3ee',
    category: 'archetype',
    aiContextDescription:
      'Fluent in intrusion countermeasures, neural jack interfaces, and black-market ICE protocols.',
  },
  {
    id: 'tag-contemporary',
    name: 'Contemporary',
    color: '#10b981',
    category: 'world',
    aiContextDescription:
      'Modern-day setting with natural vernacular, smartphones, transit, and realistic pacing.',
  },
  {
    id: 'tag-slow-burn',
    name: 'Slow Burn',
    color: '#f43f5e',
    category: 'mechanic',
    aiContextDescription:
      'Trust and intimacy develop incrementally through earned moments rather than instant devotion.',
  },
  {
    id: 'tag-cozy',
    name: 'Cozy',
    color: '#84cc16',
    category: 'tone',
    aiContextDescription:
      'Low-stakes comfort, sensory warmth, restorative environments, and gentle humor.',
  },
  {
    id: 'tag-character-driven',
    name: 'Character Driven',
    color: '#8b5cf6',
    category: 'mechanic',
    aiContextDescription:
      'Prioritize internal motivation, subtext, and behavioral consistency over external spectacle.',
  },
];

export const DEFAULT_STAT_BLOCK: StatBlockConfig = {
  enableDMTracker: true,
  injectionPosition: 'post_history_instructions',
  stats: [
    {
      id: 'stat-resolve',
      label: 'Resolve',
      type: 'bar',
      defaultValue: '85',
      min: 0,
      max: 100,
      unit: '%',
      changeRules:
        'Decreases under supernatural dread or betrayal; recovers during camp rest.',
    },
    {
      id: 'stat-trust',
      label: 'Trust',
      type: 'number',
      defaultValue: '15',
      min: -100,
      max: 100,
      changeRules:
        'Shifts by -5 to +5 per exchange based on honesty and kept promises.',
    },
    {
      id: 'stat-condition',
      label: 'Condition',
      type: 'text',
      defaultValue: 'Vigilant, nursing a bandaged left shoulder',
      changeRules:
        'Update whenever physical injuries, exhaustion, or attire change.',
    },
    {
      id: 'stat-inventory',
      label: 'Inventory',
      type: 'list',
      defaultValue: 'Silvered Lantern, Warden Signet, Vial of Nightshade',
      changeRules:
        'Add or remove carried items explicitly exchanged or expended in scene.',
    },
  ],
  formatTemplate: `<details><summary>Status & Telemetry</summary>\n\`\`\`yaml\nResolve: {{stat:Resolve}}\nTrust: {{stat:Trust}}\nCondition: {{stat:Condition}}\nInventory: {{stat:Inventory}}\n\`\`\`\n</details>`,
};

export const DEFAULT_LOREBOOK: Lorebook = {
  id: 'lorebook-oakhaven',
  name: 'Chronicles of Oakhaven & The Ashen Reach',
  description: 'Primary grimdark world lorebook bound to Seraphina Vance.',
  scan_depth: 4,
  token_budget: 1024,
  recursive_scanning: true,
  tags: ['Grimdark', 'Low Magic', 'Gothic'],
  modification_date: Math.floor(Date.now() / 1000) - 3600,
  entries: [
    {
      id: 'entry-1',
      comment: 'The Ashen Reach & Hollow Bell',
      keys: ['Ashen Reach', 'Hollow Bell', 'Oakhaven'],
      secondary_keys: ['warden', 'mist'],
      content:
        'The Ashen Reach is a quarantined borderland north of Oakhaven where the Hollow Bell tolls without a bell-ringer whenever a blood oath is broken. Silver tarnishes within an hour of crossing the boundary stones.',
      enabled: true,
      insertion_order: 100,
      case_sensitive: false,
      constant: true,
      selective: false,
      position: 'before_char',
      priority: 10,
      depth: 4,
      probability: 100,
      tags: ['Grimdark', 'Low Magic'],
    },
    {
      id: 'entry-2',
      comment: 'Order of the Lantern Bearers',
      keys: ['Lantern Bearer', 'Warden Signet', 'Vesper'],
      secondary_keys: ['lantern'],
      content:
        'Sworn archivists and boundary wardens who carry cold-forged iron lanterns fueled by distilled wyrm-tallow. Their signet grants passage across quarantine gates but marks them as outcasts among superstitious villagers.',
      enabled: true,
      insertion_order: 90,
      case_sensitive: false,
      constant: false,
      selective: false,
      position: 'after_char',
      priority: 20,
      depth: 4,
      probability: 100,
      tags: ['Gothic', 'Medieval'],
    },
  ],
};

export const SECOND_LOREBOOK: Lorebook = {
  id: 'lorebook-neoveridia',
  name: 'Neo-Veridia Orbital Sub-Net Protocols',
  description: 'Cyberpunk syndicate factions, Black ICE nodes, and orbital elevator lore.',
  scan_depth: 6,
  token_budget: 1536,
  recursive_scanning: true,
  tags: ['Cyberpunk', 'Hard Sci-Fi', 'Netrunner'],
  modification_date: Math.floor(Date.now() / 1000) - 7200,
  entries: [
    {
      id: 'entry-nv-1',
      comment: 'Aegis-9 Black ICE Countermeasures',
      keys: ['Aegis-9', 'Black ICE', 'Sub-Net'],
      secondary_keys: ['neural', 'deck'],
      content:
        'Aegis-9 is an autonomous neural intrusion countermeasure deployed by HelixZaibatsu across Low-Orbit Spire relays. Unshielded netrunners experience thermal feedback spikes within 4.2 seconds of handshake failure.',
      enabled: true,
      insertion_order: 100,
      case_sensitive: false,
      constant: true,
      selective: false,
      position: 'before_char',
      priority: 10,
      depth: 4,
      probability: 100,
      tags: ['Cyberpunk', 'Netrunner'],
    },
  ],
};

export const DEFAULT_CHARACTER: CharacterCardData = {
  id: 'char-seraphina-vance',
  name: 'Seraphina Vance',
  nickname: 'The Lantern Warden',
  description:
    '{{char}} is a 29-year-old boundary warden of the Order of the Lantern Bearers stationed along the quarantine perimeter of the Ashen Reach. Tall, lean, and weather-worn, she wears a wax-treated charcoal greatcoat over brigandine armor and carries a cold-forged silvered lantern at her hip. Her voice is measured, husky from woodsmoke, and economical with praise.',
  personality:
    'Observant, unsentimental, fiercely accountable, dryly sardonic when exhausted. {{char}} evaluates strangers by their boots, their hands, and whether they waste light. Beneath her austere discipline lies a quiet guilt over the sister she lost beyond the boundary stones.',
  scenario:
    'A freezing autumn downpour lashes the ruined tollhouse at the edge of the Ashen Reach. {{user}} has arrived after curfew seeking passage past the quarantine gate, carrying a sealed charter with a tampered wax crest.',
  first_mes:
    '*Rain sluices off the slate eaves of the tollhouse, hissing against the hot brass cowl of {{char}}\'s lantern as she raises it to eye level. The pale alchemical flame catches the wet wool of your cloak and the cracked crimson wax of the charter in your hand.*\n\n"Curfew rang three bells ago," *she says, her voice low and unhurried over the drumming downpour. Her gloved thumb rests near the latch of her lantern—not a weapon drawn, yet unmistakably a warning.* "And the Chancellor\'s seal hasn\'t used vermilion wax since the winter plague. Step under the lintel where I can see your hands, {{user}}, and tell me who actually gave you this pass."',
  mes_example:
    '<START>\n{{user}}: "I paid good coin for that pass in Oakhaven. Let me through."\n{{char}}: *{{char}} tilts the parchment toward the lantern glass, watching the wax bubble faintly without melting.* "Then you paid three crowns for tallow and brick-dust. Keep your voice down—sound carries across the fen, and the things listening aren\'t customs officers."',
  creator_notes:
    'Designed for SillyTavern V2/V3. Works best with low-to-medium temperature (0.75–0.85). Includes optional DM Stat Tracker in extensions.',
  system_prompt:
    'Write {{char}}\'s responses in third-person limited perspective, maintaining grounded sensory detail and respecting {{user}}\'s agency. Never speak or act on behalf of {{user}}.',
  post_history_instructions:
    'Maintain atmospheric tension and adhere to the active Context Theme directives.',
  alternate_greetings: [
    '*Inside the cramped watch-post, {{char}} is kneeling beside the hearth, binding a fresh linen compress around her left forearm while a kettle of bitter willow-bark tea begins to whistle.* "Shut the door behind you before the draft kills the embers, {{user}}. You\'re bleeding on the flagstones."',
  ],
  tags: ['Grimdark', 'Low Magic', 'Gothic', 'Slow Burn'],
  creator: 'TavernSmith Studio',
  character_version: '1.0.0',
  creation_date: Math.floor(Date.now() / 1000) - 86400,
  modification_date: Math.floor(Date.now() / 1000) - 1800,
  character_book: DEFAULT_LOREBOOK,
  extensions: {
    talkativeness: '0.6',
    fav: true,
    world: 'Chronicles of Oakhaven & The Ashen Reach',
    statBlock: DEFAULT_STAT_BLOCK,
  },
};

export const SECOND_CHARACTER: CharacterCardData = {
  id: 'char-kaelen-vex',
  name: 'Kaelen Vex',
  nickname: 'Zero-Day Broker',
  description:
    '{{char}} is a former orbital telemetry engineer turned black-market netrunner operating out of Sector 9 in Neo-Veridia. Chrome ocular optics glow with a muted cyan diagnostic ring beneath dark windbreaker fabric.',
  personality:
    'Calculating, deadpan, hyper-alert to surveillance patterns, fiercely protective of encrypted archives. Speaks in clipped technical metaphors.',
  scenario:
    'Inside a soundproofed server noodle-bar sub-basement during a rolling blackout. {{user}} has brought an encrypted HelixZaibatsu memory shard that is actively broadcasting a homing ping.',
  first_mes:
    '*{{char}} slams a Faraday mesh pouch over the memory shard on the stainless-steel counter, cutting the high-frequency whine on his oscilloscope to a flat line.*\n\n"You walked six blocks with an active telemetry beacon in your coat pocket, {{user}}," *he mutters, unplugging his fiber-optic lead with a sharp click.* "Give me ninety seconds to scrub the header before Helix drones lock onto this transformer."',
  mes_example:
    '<START>\n{{user}}: "Can you crack the partition or not?"\n{{char}}: "I built the firmware it\'s running on. Sit down, drink the synthetic broth, and don\'t touch the optical rig."',
  creator_notes: 'Sci-Fi Cyberpunk netrunner archetype paired with Neo-Veridia Lorebook.',
  system_prompt:
    'Write {{char}} with sharp cyberpunk atmosphere, grounded technical plausibility, and taut pacing. Never act or speak for {{user}}.',
  post_history_instructions: 'Keep dialogue crisp and observant.',
  alternate_greetings: [],
  tags: ['Cyberpunk', 'Hard Sci-Fi', 'Dystopian', 'Netrunner'],
  creator: 'TavernSmith Studio',
  character_version: '1.0.0',
  creation_date: Math.floor(Date.now() / 1000) - 96400,
  modification_date: Math.floor(Date.now() / 1000) - 5400,
  character_book: SECOND_LOREBOOK,
  extensions: {
    talkativeness: '0.5',
    fav: false,
    world: 'Neo-Veridia Orbital Sub-Net Protocols',
    statBlock: {
      enableDMTracker: false,
      injectionPosition: 'post_history_instructions',
      stats: [
        {
          id: 'stat-trace',
          label: 'Grid Trace',
          type: 'bar',
          defaultValue: '20',
          min: 0,
          max: 100,
          unit: '%',
          changeRules: 'Increases by +15% whenever unmasked wireless transmissions occur.',
        },
      ],
      formatTemplate: '```text\n[TRACE] {{stat:Grid Trace}}\n```',
    },
  },
};

export const DEFAULT_AI_CONFIG: AIBackendConfig = {
  preset: 'lmstudio',
  url: 'http://localhost:1234/v1',
  apiKey: '',
  modelName: 'llama-3.3-70b-instruct',
  compatibilityFormat: 'auto',
  temperature: 0.78,
  maxTokens: 512,
  ghostTextEnabled: true,
  debounceMs: 650,
  availableModels: [],
};

export const DEFAULT_SAVE_FOLDERS = [UNIFIED_INTERNAL_ROOT];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'dark',
  editorMode: 'sandbox',
  autoSaveEnabled: true,
  autoSaveIntervalSec: 15,
  activeThemeId: 'theme-dark-fantasy',
  cardSpecVersion: 'v3',
  activeSaveFolder: UNIFIED_INTERNAL_ROOT,
  availableSaveFolders: DEFAULT_SAVE_FOLDERS,
  mainSidebarOpen: true,
};

/**
 * Safely formats any ISO string, Unix timestamp, or legacy time string into a clean
 * human-readable timestamp (e.g., "Today, 03:15 PM") and NEVER returns "Invalid Date".
 */
export function formatSafeTimestamp(
  raw: string | number | undefined | null
): string {
  if (raw === undefined || raw === null || raw === '') {
    return (
      'Today, ' +
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }

  if (typeof raw === 'number') {
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const isToday = d.toDateString() === new Date().toDateString();
      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return isToday
        ? `Today, ${timeStr}`
        : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
    }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      const isToday = parsedDate.toDateString() === new Date().toDateString();
      const timeStr = parsedDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return isToday
        ? `Today, ${timeStr}`
        : `${parsedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
    }
    if (/^\d{1,2}:\d{2}/.test(trimmed) || trimmed.startsWith('Today')) {
      return trimmed.startsWith('Today') ? trimmed : `Today, ${trimmed}`;
    }
  }

  return (
    'Today, ' +
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

/**
 * Builds the complete unified file tree (`Characters/`, `Lorebooks/`, and root `_tavernsmith_meta.json`)
 * from the active workspace state so the Storage Manager never shows "0 saved files".
 */
export function buildUnifiedSavedFiles(
  characters: CharacterCardData[],
  lorebooks: Lorebook[],
  themes: ContextTheme[],
  tags: TagDefinition[],
  activeThemeId: string,
  spec: 'v2' | 'v3' = 'v3',
  timestampIso?: string
): SavedFileEntry[] {
  const nowIso = timestampIso || new Date().toISOString();
  const entries: SavedFileEntry[] = [];

  // 1. Characters/ subfolder
  for (const char of characters) {
    const fileName = `${sanitizeFilename(char.name)}.json`;
    const charJson = JSON.stringify(
      serializeCharacterCard(char, spec, char.character_book),
      null,
      2
    );
    const updatedIso = char.modification_date
      ? new Date(
          char.modification_date < 10_000_000_000
            ? char.modification_date * 1000
            : char.modification_date
        ).toISOString()
      : nowIso;
    entries.push({
      id: `Characters/${fileName}`,
      folderPath: 'Characters/',
      fileName,
      kind: 'character',
      sizeBytes: new Blob([charJson]).size,
      updatedAt: updatedIso,
      content: charJson,
    });
  }

  // 2. Lorebooks/ subfolder
  for (const lb of lorebooks) {
    const fileName = `${sanitizeFilename(lb.name)}.json`;
    const loreJson = JSON.stringify(
      {
        name: lb.name,
        description: lb.description,
        scan_depth: lb.scan_depth,
        token_budget: lb.token_budget,
        recursive_scanning: lb.recursive_scanning,
        entries: lb.entries,
        tags: lb.tags || [],
      },
      null,
      2
    );
    const updatedIso = lb.modification_date
      ? new Date(
          lb.modification_date < 10_000_000_000
            ? lb.modification_date * 1000
            : lb.modification_date
        ).toISOString()
      : nowIso;
    entries.push({
      id: `Lorebooks/${fileName}`,
      folderPath: 'Lorebooks/',
      fileName,
      kind: 'lorebook',
      sizeBytes: new Blob([loreJson]).size,
      updatedAt: updatedIso,
      content: loreJson,
    });
  }

  // 3. Root _tavernsmith_meta.json
  const metaPayload: TavernSmithMetaPayload = {
    schema: 'tavernsmith_meta_v1',
    updatedAt: nowIso,
    activeThemeId,
    contextThemes: themes,
    tags,
  };
  const metaJson = JSON.stringify(metaPayload, null, 2);
  entries.push({
    id: `/${META_FILENAME}`,
    folderPath: '/',
    fileName: META_FILENAME,
    kind: 'meta',
    sizeBytes: new Blob([metaJson]).size,
    updatedAt: nowIso,
    content: metaJson,
  });

  return entries;
}

interface PersistedWorkspaceState {
  characters: CharacterCardData[];
  activeCharacterId: string;
  lorebooks: Lorebook[];
  activeLorebookId: string;
  themes: ContextTheme[];
  tags: TagDefinition[];
  aiConfig: AIBackendConfig;
  settings: AppSettings;
  savedFiles: SavedFileEntry[];
  saveLogs: SaveLogEntry[];
  lastSavedAt: string | null;
}

interface StoreContextValue {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  // Main Navigation Sidebar Collapse State
  isMainSidebarOpen: boolean;
  setMainSidebarOpen: (open: boolean) => void;
  toggleMainSidebar: () => void;
  // Multi-Character Library Roster
  characters: CharacterCardData[];
  activeCharacterId: string;
  setActiveCharacterId: (id: string) => void;
  createNewCharacter: (partial?: Partial<CharacterCardData>) => string;
  deleteCharacter: (id: string) => void;
  bindLorebookToCharacter: (characterId: string, lorebookToBind: Lorebook) => void;
  // Active Character Accessors
  character: CharacterCardData;
  setCharacter: React.Dispatch<React.SetStateAction<CharacterCardData>>;
  updateCharacterField: <K extends keyof CharacterCardData>(
    field: K,
    value: CharacterCardData[K]
  ) => void;
  // Multi-Lorebook Library Roster
  lorebooks: Lorebook[];
  activeLorebookId: string;
  setActiveLorebookId: (id: string) => void;
  createNewLorebook: (partial?: Partial<Lorebook>) => string;
  deleteLorebook: (id: string) => void;
  // Active Lorebook Accessors
  lorebook: Lorebook;
  setLorebook: React.Dispatch<React.SetStateAction<Lorebook>>;
  // Active Character StatBlock Accessors
  statBlock: StatBlockConfig;
  setStatBlock: React.Dispatch<React.SetStateAction<StatBlockConfig>>;
  // Themes & Tags
  themes: ContextTheme[];
  setThemes: React.Dispatch<React.SetStateAction<ContextTheme[]>>;
  activeTheme: ContextTheme;
  setActiveThemeId: (id: string) => void;
  tags: TagDefinition[];
  setTags: React.Dispatch<React.SetStateAction<TagDefinition[]>>;
  ensureTagRegistered: (
    tagName: string,
    category?: TagDefinition['category']
  ) => TagDefinition | null;
  // AI Config & Settings
  aiConfig: AIBackendConfig;
  setAiConfig: React.Dispatch<React.SetStateAction<AIBackendConfig>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  tokenBreakdown: TokenBreakdown;
  lastSavedAt: string | null;
  isDirty: boolean;
  saveNow: (mode?: 'manual' | 'autosave') => void;
  resetWorkspaceToDefaults: () => void;
  // Unified Save Folder, Two-Way Live Sync & Storage Management
  savedFiles: SavedFileEntry[];
  saveLogs: SaveLogEntry[];
  nativeDirectoryName: string | null;
  pendingReconnectFolderName: string | null;
  isSyncingFolder: boolean;
  selectNativeSaveFolder: () => Promise<{ ok: boolean; message: string }>;
  reconnectNativeSaveFolder: () => Promise<{ ok: boolean; message: string }>;
  scanAndLoadSaveFolder: (options?: {
    dirHandleOverride?: any;
    folderPathOverride?: string;
    silent?: boolean;
  }) => Promise<{ ok: boolean; summary: string }>;
  loadSavedFileIntoWorkspace: (file: SavedFileEntry) => {
    ok: boolean;
    message: string;
  };
  createSaveFolder: (folderPath: string) => void;
  setActiveSaveFolder: (folderPath: string) => void;
  deleteSavedFile: (fileId: string) => void;
  exportSaveFolderBundle: (folderPath?: string) => void;
  storageBytesUsed: number;
  // Unified PNG & JSON Card Importer
  importFromFiles: (
    files: FileList | File[]
  ) => Promise<{ count: number; summary: string }>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function createBlankCharacter(
  partial?: Partial<CharacterCardData>
): CharacterCardData {
  const nowSec = Math.floor(Date.now() / 1000);
  const newId = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const blankStatBlock: StatBlockConfig = {
    enableDMTracker: false,
    injectionPosition: 'post_history_instructions',
    stats: [
      {
        id: `stat-${Date.now()}-1`,
        label: 'Affection',
        type: 'bar',
        defaultValue: '50',
        min: 0,
        max: 100,
        unit: '%',
        changeRules: 'Increases with kindness and shared trust; decreases with hostility.',
      },
      {
        id: `stat-${Date.now()}-2`,
        label: 'Current Mood',
        type: 'text',
        defaultValue: 'Curious and attentive',
        changeRules: 'Reflects immediate emotional state at the end of the turn.',
      },
    ],
    formatTemplate: `<details><summary>Status & Telemetry</summary>\n\`\`\`yaml\nAffection: {{stat:Affection}}\nCurrent Mood: {{stat:Current Mood}}\n\`\`\`\n</details>`,
  };

  return {
    id: newId,
    name: 'New Character',
    nickname: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: [],
    creator: 'TavernSmith Creator',
    character_version: '1.0.0',
    creation_date: nowSec,
    modification_date: nowSec,
    extensions: {
      talkativeness: '0.5',
      fav: false,
      statBlock: blankStatBlock,
    },
    ...partial,
  };
}

export function createBlankLorebook(partial?: Partial<Lorebook>): Lorebook {
  const nowSec = Math.floor(Date.now() / 1000);
  const newId = `lorebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: newId,
    name: 'New World Lorebook',
    description: 'Standalone or attachable SillyTavern World Info lorebook.',
    scan_depth: 4,
    token_budget: 1024,
    recursive_scanning: true,
    tags: [],
    modification_date: nowSec,
    entries: [],
    ...partial,
  };
}

function loadInitialState(): PersistedWorkspaceState {
  const nowIso = new Date().toISOString();
  const nowDisplay = formatSafeTimestamp(nowIso);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
      const characters =
        Array.isArray(parsed.characters) && parsed.characters.length > 0
          ? parsed.characters
          : [DEFAULT_CHARACTER, SECOND_CHARACTER];
      const lorebooks =
        Array.isArray(parsed.lorebooks) && parsed.lorebooks.length > 0
          ? parsed.lorebooks
          : [DEFAULT_LOREBOOK, SECOND_LOREBOOK];
      const themes =
        Array.isArray(parsed.themes) && parsed.themes.length > 0
          ? parsed.themes
          : DEFAULT_CONTEXT_THEMES;
      const tags =
        Array.isArray(parsed.tags) && parsed.tags.length > 0
          ? parsed.tags
          : DEFAULT_TAG_LIBRARY;

      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
        activeSaveFolder: UNIFIED_INTERNAL_ROOT,
        availableSaveFolders: [UNIFIED_INTERNAL_ROOT],
        mainSidebarOpen:
          parsed.settings?.mainSidebarOpen !== undefined
            ? parsed.settings.mainSidebarOpen
            : true,
      };
      if (!themes.some((t) => t.id === settings.activeThemeId)) {
        settings.activeThemeId = themes[0].id;
      }

      const activeCharacterId =
        parsed.activeCharacterId &&
        characters.some((c) => c.id === parsed.activeCharacterId)
          ? parsed.activeCharacterId
          : characters[0].id || 'char-seraphina-vance';

      const activeLorebookId =
        parsed.activeLorebookId &&
        lorebooks.some((l) => l.id === parsed.activeLorebookId)
          ? parsed.activeLorebookId
          : lorebooks[0].id || 'lorebook-oakhaven';

      // Always build unified savedFiles from the workspace characters, lorebooks, themes, and tags
      // so the Storage Manager always reflects every active file under Characters/, Lorebooks/, and root _tavernsmith_meta.json
      const unifiedFiles = buildUnifiedSavedFiles(
        characters,
        lorebooks,
        themes,
        tags,
        settings.activeThemeId,
        settings.cardSpecVersion,
        nowIso
      );

      return {
        characters,
        activeCharacterId,
        lorebooks,
        activeLorebookId,
        themes,
        tags,
        aiConfig: { ...DEFAULT_AI_CONFIG, ...(parsed.aiConfig || {}) },
        settings,
        savedFiles: unifiedFiles,
        saveLogs: Array.isArray(parsed.saveLogs) ? parsed.saveLogs : [],
        lastSavedAt: parsed.lastSavedAt || nowDisplay,
      };
    }
  } catch {
    // Fallback to clean defaults
  }

  const initialFiles = buildUnifiedSavedFiles(
    [DEFAULT_CHARACTER, SECOND_CHARACTER],
    [DEFAULT_LOREBOOK, SECOND_LOREBOOK],
    DEFAULT_CONTEXT_THEMES,
    DEFAULT_TAG_LIBRARY,
    DEFAULT_SETTINGS.activeThemeId,
    DEFAULT_SETTINGS.cardSpecVersion,
    nowIso
  );

  return {
    characters: [DEFAULT_CHARACTER, SECOND_CHARACTER],
    activeCharacterId: DEFAULT_CHARACTER.id!,
    lorebooks: [DEFAULT_LOREBOOK, SECOND_LOREBOOK],
    activeLorebookId: DEFAULT_LOREBOOK.id!,
    themes: DEFAULT_CONTEXT_THEMES,
    tags: DEFAULT_TAG_LIBRARY,
    aiConfig: DEFAULT_AI_CONFIG,
    settings: DEFAULT_SETTINGS,
    savedFiles: initialFiles,
    saveLogs: [
      {
        id: 'log-init',
        timestamp: nowDisplay,
        mode: 'autosave',
        folderPath: UNIFIED_INTERNAL_ROOT,
        filesWritten: [
          'Characters/Seraphina_Vance.json',
          'Characters/Kaelen_Vex.json',
          'Lorebooks/Chronicles_of_Oakhaven_The_Ashen_Reach.json',
          'Lorebooks/Neo-Veridia_Orbital_Sub-Net_Protocols.json',
          META_FILENAME,
        ],
        nativeSynced: false,
      },
    ],
    lastSavedAt: nowDisplay,
  };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const initial = useMemo(() => loadInitialState(), []);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('character');
  const [characters, setCharacters] = useState<CharacterCardData[]>(
    initial.characters
  );
  const [activeCharacterId, setActiveCharacterId] = useState<string>(
    initial.activeCharacterId
  );
  const [lorebooks, setLorebooks] = useState<Lorebook[]>(initial.lorebooks);
  const [activeLorebookId, setActiveLorebookId] = useState<string>(
    initial.activeLorebookId
  );
  const [themes, setThemes] = useState<ContextTheme[]>(initial.themes);
  const [tags, setTags] = useState<TagDefinition[]>(initial.tags);
  const [aiConfig, setAiConfig] = useState<AIBackendConfig>(initial.aiConfig);
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const [saveLogs, setSaveLogs] = useState<SaveLogEntry[]>(initial.saveLogs);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initial.lastSavedAt
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Native FileSystemDirectoryHandle & IndexedDB Two-Way Sync State
  const nativeDirHandleRef = useRef<any>(null);
  const pendingReconnectRecordRef = useRef<StoredDirectoryRecord | null>(null);
  const [nativeDirectoryName, setNativeDirectoryName] = useState<string | null>(
    null
  );
  const [pendingReconnectFolderName, setPendingReconnectFolderName] = useState<
    string | null
  >(null);
  const [isSyncingFolder, setIsSyncingFolder] = useState<boolean>(false);

  // Always derive the unified savedFiles tree (`Characters/`, `Lorebooks/`, and `_tavernsmith_meta.json`)
  // so the Storage Manager never displays "0 saved files" and always stays in lockstep with the workspace.
  const savedFiles = useMemo<SavedFileEntry[]>(
    () =>
      buildUnifiedSavedFiles(
        characters,
        lorebooks,
        themes,
        tags,
        settings.activeThemeId,
        settings.cardSpecVersion
      ),
    [
      characters,
      lorebooks,
      themes,
      tags,
      settings.activeThemeId,
      settings.cardSpecVersion,
    ]
  );

  const savedFilesRef = useRef<SavedFileEntry[]>(savedFiles);
  useEffect(() => {
    savedFilesRef.current = savedFiles;
  }, [savedFiles]);

  const character = useMemo(() => {
    return (
      characters.find((c) => c.id === activeCharacterId) ||
      characters[0] ||
      DEFAULT_CHARACTER
    );
  }, [characters, activeCharacterId]);

  const lorebook = useMemo(() => {
    return (
      lorebooks.find((l) => l.id === activeLorebookId) ||
      lorebooks[0] ||
      DEFAULT_LOREBOOK
    );
  }, [lorebooks, activeLorebookId]);

  const statBlock = useMemo<StatBlockConfig>(() => {
    return character.extensions?.statBlock || DEFAULT_STAT_BLOCK;
  }, [character]);

  const activeTheme = useMemo(() => {
    return (
      themes.find((t) => t.id === settings.activeThemeId) ||
      themes[0] ||
      DEFAULT_CONTEXT_THEMES[0]
    );
  }, [themes, settings.activeThemeId]);

  // Lock in Dual-Layer Theme System on <html> and <body>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.appearance === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [settings.appearance]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-accent', activeTheme.color);
  }, [activeTheme.color]);

  useEffect(() => {
    setIsDirty(true);
  }, [
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    themes,
    tags,
    aiConfig,
    settings,
  ]);

  // Automatically register any new tag attached to a Character, Lorebook, LorebookEntry, or ContextTheme
  // into the Global Tag Library so custom tags are always persisted.
  useEffect(() => {
    const referencedTagNames = new Set<string>();
    for (const c of characters) {
      for (const t of c.tags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
    }
    for (const lb of lorebooks) {
      for (const t of lb.tags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
      for (const entry of lb.entries || []) {
        for (const t of entry.tags || []) {
          if (t && t.trim()) referencedTagNames.add(t.trim());
        }
      }
    }
    for (const theme of themes) {
      for (const t of theme.associatedTags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
    }

    setTags((prevTags) => {
      const existingLower = new Set(
        prevTags.map((t) => t.name.trim().toLowerCase())
      );
      const newlyDiscovered: TagDefinition[] = [];
      let idx = prevTags.length;

      referencedTagNames.forEach((rawName) => {
        const lower = rawName.toLowerCase();
        if (!existingLower.has(lower)) {
          existingLower.add(lower);
          const color = AUTO_TAG_PALETTE[idx % AUTO_TAG_PALETTE.length];
          idx++;
          newlyDiscovered.push({
            id: `tag-auto-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            name: rawName,
            color,
            category: 'custom',
            aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${rawName}".`,
          });
        }
      });

      return newlyDiscovered.length > 0
        ? [...prevTags, ...newlyDiscovered]
        : prevTags;
    });
  }, [characters, lorebooks, themes]);

  const ensureTagRegistered = useCallback(
    (
      rawTagName: string,
      category: TagDefinition['category'] = 'custom'
    ): TagDefinition | null => {
      const clean = rawTagName.trim();
      if (!clean) return null;

      const found = tags.find(
        (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (found) return found;

      const color =
        AUTO_TAG_PALETTE[tags.length % AUTO_TAG_PALETTE.length] || '#a855f7';
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        color,
        category,
        aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
      };
      setTags((prev) => {
        if (
          prev.some((t) => t.name.trim().toLowerCase() === clean.toLowerCase())
        ) {
          return prev;
        }
        return [...prev, newTag];
      });
      return newTag;
    },
    [tags]
  );

  const setCharacter: React.Dispatch<React.SetStateAction<CharacterCardData>> =
    useCallback(
      (updater) => {
        setCharacters((prev) =>
          prev.map((c) => {
            if (c.id !== character.id) return c;
            const next = typeof updater === 'function' ? updater(c) : updater;
            return {
              ...next,
              id: c.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
          })
        );
      },
      [character.id]
    );

  const updateCharacterField = useCallback(
    <K extends keyof CharacterCardData>(
      field: K,
      value: CharacterCardData[K]
    ) => {
      setCharacter((prev) => ({
        ...prev,
        [field]: value,
        modification_date: Math.floor(Date.now() / 1000),
      }));
    },
    [setCharacter]
  );

  const setStatBlock: React.Dispatch<React.SetStateAction<StatBlockConfig>> =
    useCallback(
      (updater) => {
        setCharacter((prev) => {
          const currentStat = prev.extensions?.statBlock || DEFAULT_STAT_BLOCK;
          const nextStat =
            typeof updater === 'function' ? updater(currentStat) : updater;
          return {
            ...prev,
            modification_date: Math.floor(Date.now() / 1000),
            extensions: {
              ...prev.extensions,
              statBlock: nextStat,
            },
          };
        });
      },
      [setCharacter]
    );

  const setLorebook: React.Dispatch<React.SetStateAction<Lorebook>> =
    useCallback(
      (updater) => {
        setLorebooks((prev) =>
          prev.map((l) => {
            if (l.id !== lorebook.id) return l;
            const next = typeof updater === 'function' ? updater(l) : updater;
            return {
              ...next,
              id: l.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
          })
        );
      },
      [lorebook.id]
    );

  const createNewCharacter = useCallback(
    (partial?: Partial<CharacterCardData>) => {
      const fresh = createBlankCharacter(partial);
      setCharacters((prev) => [fresh, ...prev]);
      setActiveCharacterId(fresh.id!);
      return fresh.id!;
    },
    []
  );

  const deleteCharacter = useCallback(
    (id: string) => {
      setCharacters((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const fallback = createBlankCharacter();
          setActiveCharacterId(fallback.id!);
          return [fallback];
        }
        if (activeCharacterId === id) {
          setActiveCharacterId(remaining[0].id!);
        }
        return remaining;
      });
    },
    [activeCharacterId]
  );

  const createNewLorebook = useCallback((partial?: Partial<Lorebook>) => {
    const fresh = createBlankLorebook(partial);
    setLorebooks((prev) => [fresh, ...prev]);
    setActiveLorebookId(fresh.id!);
    return fresh.id!;
  }, []);

  const deleteLorebook = useCallback(
    (id: string) => {
      setLorebooks((prev) => {
        const remaining = prev.filter((l) => l.id !== id);
        if (remaining.length === 0) {
          const fallback = createBlankLorebook();
          setActiveLorebookId(fallback.id!);
          return [fallback];
        }
        if (activeLorebookId === id) {
          setActiveLorebookId(remaining[0].id!);
        }
        return remaining;
      });
    },
    [activeLorebookId]
  );

  /**
   * Helper to scan a single `FileSystemDirectoryHandle` (root, `Characters/`, or `Lorebooks/`)
   * and collect any Character Cards, Lorebooks, or `_tavernsmith_meta.json`.
   */
  const scanNativeDirectoryHandle = async (
    dirHandle: any,
    subfolderPrefix: '' | 'Characters/' | 'Lorebooks/',
    loadedCharacters: CharacterCardData[],
    loadedLorebooks: Lorebook[],
    syncedFileNames: string[],
    onMetaLoaded: (meta: TavernSmithMetaPayload) => void
  ) => {
    if (!dirHandle || typeof dirHandle.entries !== 'function') return;

    for await (const [entryName, entryHandle] of dirHandle.entries()) {
      if (!entryHandle || entryHandle.kind !== 'file') continue;
      const lowerName = String(entryName).toLowerCase();
      if (!lowerName.endsWith('.json') && !lowerName.endsWith('.png')) {
        continue;
      }
      if (lowerName.endsWith('_backupbundle.json')) {
        continue;
      }

      try {
        const file: File = await entryHandle.getFile();
        const updatedIso = new Date(
          file.lastModified || Date.now()
        ).toISOString();

        if (entryName === META_FILENAME) {
          const text = await file.text();
          const parsedMeta = JSON.parse(text) as Partial<TavernSmithMetaPayload>;
          if (
            parsedMeta &&
            (Array.isArray(parsedMeta.tags) ||
              Array.isArray(parsedMeta.contextThemes))
          ) {
            onMetaLoaded({
              schema: 'tavernsmith_meta_v1',
              updatedAt: parsedMeta.updatedAt || updatedIso,
              activeThemeId:
                parsedMeta.activeThemeId || DEFAULT_SETTINGS.activeThemeId,
              contextThemes: Array.isArray(parsedMeta.contextThemes)
                ? parsedMeta.contextThemes
                : [],
              tags: Array.isArray(parsedMeta.tags) ? parsedMeta.tags : [],
            });
            syncedFileNames.push(`${subfolderPrefix}${META_FILENAME}`);
          }
          continue;
        }

        const parsedAsset = await importCardFromFile(file);
        if (parsedAsset.kind === 'character') {
          loadedCharacters.push(parsedAsset.character);
          if (parsedAsset.embeddedLorebook) {
            loadedLorebooks.push(parsedAsset.embeddedLorebook);
          }
          syncedFileNames.push(`${subfolderPrefix}${entryName}`);
        } else if (parsedAsset.kind === 'lorebook') {
          loadedLorebooks.push(parsedAsset.lorebook);
          syncedFileNames.push(`${subfolderPrefix}${entryName}`);
        }
      } catch {
        // Ignore non-card PNGs or unrelated JSON files
      }
    }
  };

  /**
   * Scans the unified Root Save Folder (`Characters/`, `Lorebooks/`, and root `_tavernsmith_meta.json`):
   * - When linked to a Local PC folder, automatically ensures `Characters/` and `Lorebooks/` subdirectories
   *   exist on disk and scans root + `Characters/` + `Lorebooks/`.
   * - When in Browser Internal Storage mode, scans all saved files in internal storage.
   */
  const scanAndLoadSaveFolder = useCallback(
    async (options?: {
      dirHandleOverride?: any;
      folderPathOverride?: string;
      silent?: boolean;
    }): Promise<{ ok: boolean; summary: string }> => {
      const rootHandle = options?.dirHandleOverride ?? nativeDirHandleRef.current;
      const folderDisplay = rootHandle
        ? `/${rootHandle.name || 'SaveFolder'}/`
        : UNIFIED_INTERNAL_ROOT;

      setIsSyncingFolder(true);

      const loadedCharacters: CharacterCardData[] = [];
      const loadedLorebooks: Lorebook[] = [];
      let loadedMeta: TavernSmithMetaPayload | null = null;
      const syncedFileNames: string[] = [];

      try {
        if (rootHandle && typeof rootHandle.entries === 'function') {
          const perm = await queryDirectoryHandlePermission(rootHandle, 'read');
          if (perm === 'granted') {
            // Ensure real Characters/ and Lorebooks/ subdirectories exist on the user's hard drive
            let charsDirHandle: any = null;
            let loreDirHandle: any = null;
            try {
              charsDirHandle = await rootHandle.getDirectoryHandle(
                'Characters',
                { create: true }
              );
              loreDirHandle = await rootHandle.getDirectoryHandle(
                'Lorebooks',
                { create: true }
              );
            } catch {
              // If read-only permission, try without create: true
              try {
                charsDirHandle =
                  await rootHandle.getDirectoryHandle('Characters');
              } catch {
                // Ignore if not yet created
              }
              try {
                loreDirHandle =
                  await rootHandle.getDirectoryHandle('Lorebooks');
              } catch {
                // Ignore if not yet created
              }
            }

            // 1. Scan root folder (for _tavernsmith_meta.json and any top-level cards)
            await scanNativeDirectoryHandle(
              rootHandle,
              '',
              loadedCharacters,
              loadedLorebooks,
              syncedFileNames,
              (meta) => {
                loadedMeta = meta;
              }
            );

            // 2. Scan Characters/ subfolder
            if (charsDirHandle) {
              await scanNativeDirectoryHandle(
                charsDirHandle,
                'Characters/',
                loadedCharacters,
                loadedLorebooks,
                syncedFileNames,
                (meta) => {
                  loadedMeta = meta;
                }
              );
            }

            // 3. Scan Lorebooks/ subfolder
            if (loreDirHandle) {
              await scanNativeDirectoryHandle(
                loreDirHandle,
                'Lorebooks/',
                loadedCharacters,
                loadedLorebooks,
                syncedFileNames,
                (meta) => {
                  loadedMeta = meta;
                }
              );
            }
          }
        } else {
          // Browser Internal Storage Scan
          for (const entry of savedFilesRef.current) {
            try {
              if (
                entry.fileName === META_FILENAME ||
                entry.kind === 'meta'
              ) {
                const parsedMeta = JSON.parse(
                  entry.content
                ) as Partial<TavernSmithMetaPayload>;
                if (
                  parsedMeta &&
                  (Array.isArray(parsedMeta.tags) ||
                    Array.isArray(parsedMeta.contextThemes))
                ) {
                  loadedMeta = {
                    schema: 'tavernsmith_meta_v1',
                    updatedAt: parsedMeta.updatedAt || entry.updatedAt,
                    activeThemeId:
                      parsedMeta.activeThemeId ||
                      DEFAULT_SETTINGS.activeThemeId,
                    contextThemes: Array.isArray(parsedMeta.contextThemes)
                      ? parsedMeta.contextThemes
                      : [],
                    tags: Array.isArray(parsedMeta.tags) ? parsedMeta.tags : [],
                  };
                  syncedFileNames.push(entry.fileName);
                }
                continue;
              }

              const parsedAsset = parseImportedJsonString(
                entry.content,
                undefined,
                entry.fileName
              );
              if (parsedAsset.kind === 'character') {
                loadedCharacters.push(parsedAsset.character);
                if (parsedAsset.embeddedLorebook) {
                  loadedLorebooks.push(parsedAsset.embeddedLorebook);
                }
                syncedFileNames.push(`Characters/${entry.fileName}`);
              } else if (parsedAsset.kind === 'lorebook') {
                loadedLorebooks.push(parsedAsset.lorebook);
                syncedFileNames.push(`Lorebooks/${entry.fileName}`);
              }
            } catch {
              // Ignore unparseable entry
            }
          }
        }

        // Apply loaded _tavernsmith_meta.json (Context Themes & Tags)
        if (loadedMeta) {
          const metaSnapshot: TavernSmithMetaPayload = loadedMeta;
          if (metaSnapshot.contextThemes.length > 0) {
            setThemes((prevThemes) => {
              const mapByName = new Map<string, ContextTheme>();
              for (const t of prevThemes) {
                mapByName.set(t.name.trim().toLowerCase(), t);
              }
              for (const incoming of metaSnapshot.contextThemes) {
                if (incoming && incoming.name) {
                  const key = incoming.name.trim().toLowerCase();
                  const existing = mapByName.get(key);
                  mapByName.set(key, {
                    ...existing,
                    ...incoming,
                    id: existing?.id || incoming.id || `theme-${Date.now()}`,
                  });
                }
              }
              return Array.from(mapByName.values());
            });
          }

          if (metaSnapshot.tags.length > 0) {
            setTags((prevTags) => {
              const mapByName = new Map<string, TagDefinition>();
              for (const t of prevTags) {
                mapByName.set(t.name.trim().toLowerCase(), t);
              }
              for (const incoming of metaSnapshot.tags) {
                if (incoming && incoming.name) {
                  const key = incoming.name.trim().toLowerCase();
                  const existing = mapByName.get(key);
                  mapByName.set(key, {
                    ...existing,
                    ...incoming,
                    id: existing?.id || incoming.id || `tag-${Date.now()}`,
                  });
                }
              }
              return Array.from(mapByName.values());
            });
          }
        }

        // Merge loaded Characters into Character Roster
        if (loadedCharacters.length > 0) {
          setCharacters((prevChars) => {
            const nextList = [...prevChars];
            for (const incoming of loadedCharacters) {
              const idx = nextList.findIndex(
                (c) =>
                  c.name.trim().toLowerCase() ===
                  incoming.name.trim().toLowerCase()
              );
              if (idx !== -1) {
                nextList[idx] = {
                  ...nextList[idx],
                  ...incoming,
                  id: nextList[idx].id,
                  avatar: incoming.avatar || nextList[idx].avatar,
                };
              } else {
                nextList.unshift(incoming);
              }
            }
            return nextList;
          });
        }

        // Merge loaded Lorebooks into Lorebook Roster
        if (loadedLorebooks.length > 0) {
          setLorebooks((prevBooks) => {
            const nextList = [...prevBooks];
            for (const incoming of loadedLorebooks) {
              const idx = nextList.findIndex(
                (b) =>
                  b.name.trim().toLowerCase() ===
                  incoming.name.trim().toLowerCase()
              );
              if (idx !== -1) {
                nextList[idx] = {
                  ...nextList[idx],
                  ...incoming,
                  id: nextList[idx].id,
                };
              } else {
                nextList.unshift(incoming);
              }
            }
            return nextList;
          });
        }

        if (!options?.silent && syncedFileNames.length > 0) {
          const nowDisplay = formatSafeTimestamp(new Date().toISOString());
          const syncLog: SaveLogEntry = {
            id: `sync-${Date.now()}`,
            timestamp: nowDisplay,
            mode: 'sync',
            folderPath: folderDisplay,
            filesWritten: syncedFileNames,
            nativeSynced: Boolean(rootHandle),
          };
          setSaveLogs((prev) => [syncLog, ...prev.slice(0, 19)]);
        }

        const summaryParts: string[] = [];
        if (loadedCharacters.length > 0) {
          summaryParts.push(
            `${loadedCharacters.length} character${loadedCharacters.length === 1 ? '' : 's'} (Characters/)`
          );
        }
        if (loadedLorebooks.length > 0) {
          summaryParts.push(
            `${loadedLorebooks.length} lorebook${loadedLorebooks.length === 1 ? '' : 's'} (Lorebooks/)`
          );
        }
        if (loadedMeta) {
          const m: TavernSmithMetaPayload = loadedMeta;
          summaryParts.push(
            `${m.tags.length} tags & ${m.contextThemes.length} themes (${META_FILENAME})`
          );
        }

        return {
          ok: true,
          summary:
            summaryParts.length > 0
              ? `Synced ${summaryParts.join(', ')} from ${folderDisplay}`
              : `Scanned ${folderDisplay} (all subfolders up to date).`,
        };
      } finally {
        setIsSyncingFolder(false);
      }
    },
    []
  );

  // On App Launch: Check IndexedDB for persisted Local PC FileSystemDirectoryHandle and run Two-Way Sync
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedRecord = await loadDirectoryHandleFromIndexedDB();
      if (cancelled) return;

      if (storedRecord && storedRecord.handle) {
        const perm = await queryDirectoryHandlePermission(
          storedRecord.handle,
          'readwrite'
        );
        if (cancelled) return;

        if (perm === 'granted') {
          nativeDirHandleRef.current = storedRecord.handle;
          const folderPath = `/${storedRecord.folderName}/`;
          setNativeDirectoryName(storedRecord.folderName);
          setPendingReconnectFolderName(null);
          setSettings((prev) => ({
            ...prev,
            activeSaveFolder: folderPath,
            availableSaveFolders: [folderPath],
          }));
          await scanAndLoadSaveFolder({
            dirHandleOverride: storedRecord.handle,
            folderPathOverride: folderPath,
            silent: true,
          });
          return;
        } else {
          pendingReconnectRecordRef.current = storedRecord;
          setPendingReconnectFolderName(storedRecord.folderName);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scanAndLoadSaveFolder]);

  // 1-Click Reconnect Save Folder handler (grants read/write permission on stored IndexedDB handle)
  const reconnectNativeSaveFolder = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const record = pendingReconnectRecordRef.current;
    if (!record || !record.handle) {
      return {
        ok: false,
        message: 'No stored local directory handle found. Please select a folder.',
      };
    }

    const perm = await requestDirectoryHandlePermission(
      record.handle,
      'readwrite'
    );
    if (perm !== 'granted') {
      return {
        ok: false,
        message: `Permission to access "${record.folderName}" was not granted.`,
      };
    }

    nativeDirHandleRef.current = record.handle;
    const folderPath = `/${record.folderName}/`;
    setNativeDirectoryName(record.folderName);
    setPendingReconnectFolderName(null);
    pendingReconnectRecordRef.current = null;

    setSettings((prev) => ({
      ...prev,
      activeSaveFolder: folderPath,
      availableSaveFolders: [folderPath],
    }));

    const syncRes = await scanAndLoadSaveFolder({
      dirHandleOverride: record.handle,
      folderPathOverride: folderPath,
      silent: false,
    });

    return {
      ok: true,
      message: `Reconnected Local PC Hard Drive Folder "${record.folderName}/". ${syncRes.summary}`,
    };
  }, [scanAndLoadSaveFolder]);

  // Select Native Save Folder via File System Access API (`window.showDirectoryPicker`)
  // Automatically creates `Characters/` and `Lorebooks/` subdirectories on the user's hard drive!
  const selectNativeSaveFolder = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<any>;
    };

    if (typeof win.showDirectoryPicker !== 'function') {
      return {
        ok: false,
        message:
          'Native OS directory picker is not supported in this browser or preview iframe. Open TavernSmith in a standalone browser tab to link a Local PC Hard Drive folder.',
      };
    }

    try {
      const rootHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      nativeDirHandleRef.current = rootHandle;
      const folderName = rootHandle.name || 'TavernSmith_Saves';
      const folderPath = `/${folderName}/`;
      setNativeDirectoryName(folderName);
      setPendingReconnectFolderName(null);
      pendingReconnectRecordRef.current = null;

      // Create real Characters/ and Lorebooks/ subdirectories on the user's hard drive immediately
      await rootHandle.getDirectoryHandle('Characters', { create: true });
      await rootHandle.getDirectoryHandle('Lorebooks', { create: true });

      await saveDirectoryHandleToIndexedDB(rootHandle, folderPath);

      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: folderPath,
        availableSaveFolders: [folderPath],
      }));

      const syncRes = await scanAndLoadSaveFolder({
        dirHandleOverride: rootHandle,
        folderPathOverride: folderPath,
        silent: false,
      });

      return {
        ok: true,
        message: `Linked Local PC Hard Drive Folder "${folderName}/" with automatic Characters/ and Lorebooks/ subfolders. ${syncRes.summary}`,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, message: 'Folder selection cancelled.' };
      }
      return {
        ok: false,
        message:
          'Browser preview iframe restricted the native OS folder picker. Open TavernSmith in a new standalone tab to link a Local PC Hard Drive folder (currently using Browser Internal Storage).',
      };
    }
  }, [scanAndLoadSaveFolder]);

  const createSaveFolder = useCallback((rawPath: string) => {
    const clean = rawPath.trim();
    if (!clean) return;
    setSettings((prev) => ({
      ...prev,
      activeSaveFolder: clean.startsWith('/') ? clean : `/${clean}/`,
    }));
  }, []);

  const setActiveSaveFolder = useCallback(
    (folderPath: string) => {
      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: folderPath,
      }));
      void scanAndLoadSaveFolder({
        folderPathOverride: folderPath,
        silent: false,
      });
    },
    [scanAndLoadSaveFolder]
  );

  // Load any saved file from the Storage Manager directly into the active Character/Lorebook workbench
  const loadSavedFileIntoWorkspace = useCallback(
    (file: SavedFileEntry): { ok: boolean; message: string } => {
      try {
        if (file.kind === 'meta' || file.fileName === META_FILENAME) {
          const parsedMeta = JSON.parse(
            file.content
          ) as Partial<TavernSmithMetaPayload>;
          if (Array.isArray(parsedMeta.tags) && parsedMeta.tags.length > 0) {
            setTags(parsedMeta.tags);
          }
          if (
            Array.isArray(parsedMeta.contextThemes) &&
            parsedMeta.contextThemes.length > 0
          ) {
            setThemes(parsedMeta.contextThemes);
          }
          return {
            ok: true,
            message: `Restored Tags & Context Themes from ${META_FILENAME}.`,
          };
        }

        const parsed = parseImportedJsonString(
          file.content,
          undefined,
          file.fileName
        );
        if (parsed.kind === 'character') {
          const match = characters.find(
            (c) =>
              c.name.trim().toLowerCase() ===
              parsed.character.name.trim().toLowerCase()
          );
          if (match && match.id) {
            setActiveCharacterId(match.id);
          } else {
            setCharacters((prev) => [parsed.character, ...prev]);
            setActiveCharacterId(parsed.character.id!);
          }
          setActiveTab('character');
          return {
            ok: true,
            message: `Loaded character "${parsed.character.name}" into Character Workbench.`,
          };
        } else if (parsed.kind === 'lorebook') {
          const match = lorebooks.find(
            (l) =>
              l.name.trim().toLowerCase() ===
              parsed.lorebook.name.trim().toLowerCase()
          );
          if (match && match.id) {
            setActiveLorebookId(match.id);
          } else {
            setLorebooks((prev) => [parsed.lorebook, ...prev]);
            setActiveLorebookId(parsed.lorebook.id!);
          }
          setActiveTab('lorebook');
          return {
            ok: true,
            message: `Loaded lorebook "${parsed.lorebook.name}" into Lorebook Workbench.`,
          };
        }
        return { ok: false, message: 'Unrecognized file format.' };
      } catch {
        return { ok: false, message: `Could not parse ${file.fileName}.` };
      }
    },
    [characters, lorebooks]
  );

  const deleteSavedFile = useCallback(
    (fileId: string) => {
      const target = savedFiles.find((f) => f.id === fileId);
      if (!target) return;

      if (target.kind === 'character') {
        const match = characters.find(
          (c) => `${sanitizeFilename(c.name)}.json` === target.fileName
        );
        if (match && match.id) {
          deleteCharacter(match.id);
        }
        if (nativeDirHandleRef.current) {
          const rootHandle = nativeDirHandleRef.current;
          (async () => {
            try {
              const charsDir = await rootHandle.getDirectoryHandle('Characters');
              await charsDir.removeEntry(target.fileName);
            } catch {
              // Ignore if not present on disk
            }
          })();
        }
      } else if (target.kind === 'lorebook') {
        const match = lorebooks.find(
          (l) => `${sanitizeFilename(l.name)}.json` === target.fileName
        );
        if (match && match.id) {
          deleteLorebook(match.id);
        }
        if (nativeDirHandleRef.current) {
          const rootHandle = nativeDirHandleRef.current;
          (async () => {
            try {
              const loreDir = await rootHandle.getDirectoryHandle('Lorebooks');
              await loreDir.removeEntry(target.fileName);
            } catch {
              // Ignore if not present on disk
            }
          })();
        }
      }
    },
    [savedFiles, characters, lorebooks, deleteCharacter, deleteLorebook]
  );

  const exportSaveFolderBundle = useCallback(() => {
    const rootLabel = nativeDirectoryName
      ? `/${nativeDirectoryName}/`
      : UNIFIED_INTERNAL_ROOT;
    const bundle = {
      bundleVersion: '1.0.1',
      exportedAt: new Date().toISOString(),
      saveFolderRoot: rootLabel,
      structure: {
        charactersSubfolder: 'Characters/',
        lorebooksSubfolder: 'Lorebooks/',
        metaFile: META_FILENAME,
      },
      fileCount: savedFiles.length,
      files: savedFiles.map((f) => ({
        path: `${f.folderPath === '/' ? '' : f.folderPath}${f.fileName}`,
        fileName: f.fileName,
        subfolder: f.folderPath,
        kind: f.kind,
        updatedAt: f.updatedAt,
        data: JSON.parse(f.content),
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const folderSlug = sanitizeFilename(nativeDirectoryName || 'TavernSmith_Saves');
    triggerBrowserDownload(
      blob,
      `TavernSmith_${folderSlug}_BackupBundle.json`
    );
  }, [savedFiles, nativeDirectoryName]);

  const bindLorebookToCharacter = useCallback(
    (characterId: string, lorebookToBind: Lorebook) => {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            character_book: lorebookToBind,
            modification_date: Math.floor(Date.now() / 1000),
          };
        })
      );
    },
    []
  );

  // Unified Manual Save & Auto-Save Target:
  // Saves ALL Characters into `Characters/[Name].json`, ALL Lorebooks into `Lorebooks/[Title].json`,
  // and `_tavernsmith_meta.json` into the Root Save Folder!
  const saveNow = useCallback(
    (mode: 'manual' | 'autosave' = 'manual') => {
      const nowIso = new Date().toISOString();
      const displayTime = formatSafeTimestamp(nowIso);
      const rootFolderDisplay = nativeDirectoryName
        ? `/${nativeDirectoryName}/`
        : UNIFIED_INTERNAL_ROOT;

      const filesWrittenList: string[] = [];
      for (const c of characters) {
        filesWrittenList.push(`Characters/${sanitizeFilename(c.name)}.json`);
      }
      for (const l of lorebooks) {
        filesWrittenList.push(`Lorebooks/${sanitizeFilename(l.name)}.json`);
      }
      filesWrittenList.push(META_FILENAME);

      const newLog: SaveLogEntry = {
        id: `savelog-${Date.now()}`,
        timestamp: displayTime,
        mode,
        folderPath: rootFolderDisplay,
        filesWritten: filesWrittenList,
        nativeSynced: Boolean(nativeDirHandleRef.current),
      };

      setSaveLogs((prev) => [newLog, ...prev.slice(0, 19)]);

      // If linked to a Local PC Hard Drive folder, create `Characters/` and `Lorebooks/` subdirectories
      // and write all Character files, Lorebook files, and root `_tavernsmith_meta.json` directly to disk!
      if (nativeDirHandleRef.current) {
        const rootHandle = nativeDirHandleRef.current;
        (async () => {
          try {
            const charsDirHandle = await rootHandle.getDirectoryHandle(
              'Characters',
              { create: true }
            );
            const loreDirHandle = await rootHandle.getDirectoryHandle(
              'Lorebooks',
              { create: true }
            );

            for (const c of characters) {
              const cFileName = `${sanitizeFilename(c.name)}.json`;
              const cContent = JSON.stringify(
                serializeCharacterCard(
                  c,
                  settings.cardSpecVersion,
                  c.character_book || lorebook
                ),
                null,
                2
              );
              const cHandle = await charsDirHandle.getFileHandle(cFileName, {
                create: true,
              });
              const cWritable = await cHandle.createWritable();
              await cWritable.write(cContent);
              await cWritable.close();
            }

            for (const lb of lorebooks) {
              const lFileName = `${sanitizeFilename(lb.name)}.json`;
              const lContent = JSON.stringify(
                {
                  name: lb.name,
                  description: lb.description,
                  scan_depth: lb.scan_depth,
                  token_budget: lb.token_budget,
                  recursive_scanning: lb.recursive_scanning,
                  entries: lb.entries,
                  tags: lb.tags || [],
                },
                null,
                2
              );
              const lHandle = await loreDirHandle.getFileHandle(lFileName, {
                create: true,
              });
              const lWritable = await lHandle.createWritable();
              await lWritable.write(lContent);
              await lWritable.close();
            }

            const metaPayload: TavernSmithMetaPayload = {
              schema: 'tavernsmith_meta_v1',
              updatedAt: nowIso,
              activeThemeId: settings.activeThemeId,
              contextThemes: themes,
              tags,
            };
            const metaSerialized = JSON.stringify(metaPayload, null, 2);
            const mHandle = await rootHandle.getFileHandle(META_FILENAME, {
              create: true,
            });
            const mWritable = await mHandle.createWritable();
            await mWritable.write(metaSerialized);
            await mWritable.close();
          } catch {
            // Ignore transient native permission loss
          }
        })();
      }

      setLastSavedAt(displayTime);
      setIsDirty(false);
    },
    [
      characters,
      lorebooks,
      lorebook,
      themes,
      tags,
      nativeDirectoryName,
      settings.activeThemeId,
      settings.cardSpecVersion,
    ]
  );

  // Sync full state snapshot to localStorage whenever state updates
  useEffect(() => {
    const payload: PersistedWorkspaceState = {
      characters,
      activeCharacterId,
      lorebooks,
      activeLorebookId,
      themes,
      tags,
      aiConfig,
      settings,
      savedFiles,
      saveLogs,
      lastSavedAt,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota fallback ignored
    }
  }, [
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    themes,
    tags,
    aiConfig,
    settings,
    savedFiles,
    saveLogs,
    lastSavedAt,
  ]);

  // Automatic Save Interval Loop writing to the unified Root Save Folder (`Characters/`, `Lorebooks/`, `_tavernsmith_meta.json`)
  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = Math.max(5, settings.autoSaveIntervalSec) * 1000;

    const timerId = window.setInterval(() => {
      saveNow('autosave');
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [settings.autoSaveEnabled, settings.autoSaveIntervalSec, saveNow]);

  const importFromFiles = useCallback(
    async (
      files: FileList | File[]
    ): Promise<{ count: number; summary: string }> => {
      const list = Array.from(files);
      let importedChars = 0;
      let importedBooks = 0;
      let lastCharId: string | null = null;
      let lastBookId: string | null = null;

      for (const file of list) {
        if (file.name === META_FILENAME) {
          try {
            const text = await file.text();
            const parsedMeta = JSON.parse(text) as Partial<TavernSmithMetaPayload>;
            if (Array.isArray(parsedMeta.tags) && parsedMeta.tags.length > 0) {
              setTags((prev) => {
                const byName = new Map(
                  prev.map((t) => [t.name.toLowerCase(), t])
                );
                for (const incoming of parsedMeta.tags!) {
                  if (incoming?.name) {
                    byName.set(incoming.name.toLowerCase(), incoming);
                  }
                }
                return Array.from(byName.values());
              });
            }
            if (
              Array.isArray(parsedMeta.contextThemes) &&
              parsedMeta.contextThemes.length > 0
            ) {
              setThemes((prev) => {
                const byName = new Map(
                  prev.map((t) => [t.name.toLowerCase(), t])
                );
                for (const incoming of parsedMeta.contextThemes!) {
                  if (incoming?.name) {
                    byName.set(incoming.name.toLowerCase(), incoming);
                  }
                }
                return Array.from(byName.values());
              });
            }
          } catch {
            // Ignore malformed meta file
          }
          continue;
        }

        const result = await importCardFromFile(file);
        if (result.kind === 'character') {
          setCharacters((prev) => [result.character, ...prev]);
          lastCharId = result.character.id!;
          importedChars++;
          if (result.embeddedLorebook) {
            const book = result.embeddedLorebook;
            setLorebooks((prev) => [book, ...prev]);
            lastBookId = book.id!;
            importedBooks++;
          }
        } else if (result.kind === 'lorebook') {
          setLorebooks((prev) => [result.lorebook, ...prev]);
          lastBookId = result.lorebook.id!;
          importedBooks++;
        }
      }

      if (lastCharId) {
        setActiveCharacterId(lastCharId);
      } else if (lastBookId) {
        setActiveLorebookId(lastBookId);
      }

      const parts: string[] = [];
      if (importedChars > 0) {
        parts.push(
          `${importedChars} character${importedChars === 1 ? '' : 's'} (saved to Characters/)`
        );
      }
      if (importedBooks > 0) {
        parts.push(
          `${importedBooks} lorebook${importedBooks === 1 ? '' : 's'} (saved to Lorebooks/)`
        );
      }

      return {
        count: importedChars + importedBooks,
        summary:
          parts.length > 0
            ? `Imported ${parts.join(' and ')}.`
            : 'Restored metadata or no new card files found.',
      };
    },
    []
  );

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const isMainSidebarOpen = settings.mainSidebarOpen !== false;

  const setMainSidebarOpen = useCallback((open: boolean) => {
    setSettings((prev) => ({ ...prev, mainSidebarOpen: open }));
  }, []);

  const toggleMainSidebar = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      mainSidebarOpen: prev.mainSidebarOpen === false ? true : false,
    }));
  }, []);

  const setActiveThemeId = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, activeThemeId: id }));
  }, []);

  const resetWorkspaceToDefaults = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    void clearDirectoryHandleFromIndexedDB();
    nativeDirHandleRef.current = null;
    pendingReconnectRecordRef.current = null;
    setNativeDirectoryName(null);
    setPendingReconnectFolderName(null);
    setCharacters([DEFAULT_CHARACTER, SECOND_CHARACTER]);
    setActiveCharacterId(DEFAULT_CHARACTER.id!);
    setLorebooks([DEFAULT_LOREBOOK, SECOND_LOREBOOK]);
    setActiveLorebookId(DEFAULT_LOREBOOK.id!);
    setThemes(DEFAULT_CONTEXT_THEMES);
    setTags(DEFAULT_TAG_LIBRARY);
    setAiConfig(DEFAULT_AI_CONFIG);
    setSettings(DEFAULT_SETTINGS);
    const nowDisplay = formatSafeTimestamp(new Date().toISOString());
    setSaveLogs([
      {
        id: `log-reset-${Date.now()}`,
        timestamp: nowDisplay,
        mode: 'manual',
        folderPath: UNIFIED_INTERNAL_ROOT,
        filesWritten: [
          'Characters/Seraphina_Vance.json',
          'Characters/Kaelen_Vex.json',
          'Lorebooks/Chronicles_of_Oakhaven_The_Ashen_Reach.json',
          'Lorebooks/Neo-Veridia_Orbital_Sub-Net_Protocols.json',
          META_FILENAME,
        ],
        nativeSynced: false,
      },
    ]);
    setLastSavedAt(nowDisplay);
    setIsDirty(false);
  }, []);

  const storageBytesUsed = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) || '';
      const localBytes = new Blob([raw]).size;
      const filesBytes = savedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      return Math.max(localBytes, filesBytes);
    } catch {
      return savedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    }
  }, [savedFiles]);

  const tokenBreakdown = useMemo(
    () =>
      calculateCardTokenBreakdown(
        character,
        character.character_book || lorebook,
        statBlock
      ),
    [character, lorebook, statBlock]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      isMainSidebarOpen,
      setMainSidebarOpen,
      toggleMainSidebar,
      characters,
      activeCharacterId,
      setActiveCharacterId,
      createNewCharacter,
      deleteCharacter,
      bindLorebookToCharacter,
      character,
      setCharacter,
      updateCharacterField,
      lorebooks,
      activeLorebookId,
      setActiveLorebookId,
      createNewLorebook,
      deleteLorebook,
      lorebook,
      setLorebook,
      statBlock,
      setStatBlock,
      themes,
      setThemes,
      activeTheme,
      setActiveThemeId,
      tags,
      setTags,
      ensureTagRegistered,
      aiConfig,
      setAiConfig,
      settings,
      setSettings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
      resetWorkspaceToDefaults,
      savedFiles,
      saveLogs,
      nativeDirectoryName,
      pendingReconnectFolderName,
      isSyncingFolder,
      selectNativeSaveFolder,
      reconnectNativeSaveFolder,
      scanAndLoadSaveFolder,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
      storageBytesUsed,
      importFromFiles,
    }),
    [
      activeTab,
      isMainSidebarOpen,
      setMainSidebarOpen,
      toggleMainSidebar,
      characters,
      activeCharacterId,
      createNewCharacter,
      deleteCharacter,
      bindLorebookToCharacter,
      character,
      setCharacter,
      updateCharacterField,
      lorebooks,
      activeLorebookId,
      createNewLorebook,
      deleteLorebook,
      lorebook,
      setLorebook,
      statBlock,
      setStatBlock,
      themes,
      activeTheme,
      setActiveThemeId,
      tags,
      ensureTagRegistered,
      aiConfig,
      settings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
      resetWorkspaceToDefaults,
      savedFiles,
      saveLogs,
      nativeDirectoryName,
      pendingReconnectFolderName,
      isSyncingFolder,
      selectNativeSaveFolder,
      reconnectNativeSaveFolder,
      scanAndLoadSaveFolder,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
      storageBytesUsed,
      importFromFiles,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
