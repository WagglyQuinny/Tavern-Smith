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
  TokenBreakdown,
  WorkspaceTab,
} from '../types';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';
import {
  importCardFromFile,
  sanitizeFilename,
  serializeCharacterCard,
  triggerBrowserDownload,
} from '../utils/cardIO';

const STORAGE_KEY = 'tavernsmith_ide_state_v2';

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

export const DEFAULT_SAVE_FOLDERS = [
  '/TavernSmith/Saves/Default',
  '/TavernSmith/Saves/Characters',
  '/TavernSmith/Saves/Lorebooks',
];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'dark',
  editorMode: 'sandbox',
  autoSaveEnabled: true,
  autoSaveIntervalSec: 15,
  activeThemeId: 'theme-dark-fantasy',
  cardSpecVersion: 'v3',
  activeSaveFolder: '/TavernSmith/Saves/Default',
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
    return 'Today, ' +
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
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
    // If raw is already a formatted time like "10:15:30 AM" or "Today, 03:15 PM"
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

function normalizeFolderPath(path: string): string {
  if (!path) return '/TavernSmith/Saves/Default';
  if (path === '/TavernSmith/Saves/Campaigns') {
    return '/TavernSmith/Saves/Characters';
  }
  if (path === '/TavernSmith/Saves/Archive') {
    return '/TavernSmith/Saves/Lorebooks';
  }
  return path;
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
  // Save Folder & Storage Management
  savedFiles: SavedFileEntry[];
  saveLogs: SaveLogEntry[];
  nativeDirectoryName: string | null;
  selectNativeSaveFolder: () => Promise<{ ok: boolean; message: string }>;
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

function buildInitialSavedFiles(): SavedFileEntry[] {
  const nowIso = new Date().toISOString();
  const charJson = JSON.stringify(
    serializeCharacterCard(DEFAULT_CHARACTER, 'v3', DEFAULT_LOREBOOK),
    null,
    2
  );
  const loreJson = JSON.stringify(
    {
      name: DEFAULT_LOREBOOK.name,
      description: DEFAULT_LOREBOOK.description,
      scan_depth: DEFAULT_LOREBOOK.scan_depth,
      token_budget: DEFAULT_LOREBOOK.token_budget,
      recursive_scanning: DEFAULT_LOREBOOK.recursive_scanning,
      entries: DEFAULT_LOREBOOK.entries,
    },
    null,
    2
  );

  return [
    {
      id: 'file-default-char',
      folderPath: '/TavernSmith/Saves/Default',
      fileName: 'Seraphina_Vance.json',
      kind: 'character',
      sizeBytes: new Blob([charJson]).size,
      updatedAt: nowIso,
      content: charJson,
    },
    {
      id: 'file-default-lore',
      folderPath: '/TavernSmith/Saves/Default',
      fileName: 'Chronicles_of_Oakhaven_The_Ashen_Reach.json',
      kind: 'lorebook',
      sizeBytes: new Blob([loreJson]).size,
      updatedAt: nowIso,
      content: loreJson,
    },
  ];
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

      const rawFolders =
        Array.isArray(parsed.settings?.availableSaveFolders) &&
        parsed.settings!.availableSaveFolders.length > 0
          ? parsed.settings!.availableSaveFolders.map(normalizeFolderPath)
          : DEFAULT_SAVE_FOLDERS;

      const mergedFolders = Array.from(
        new Set([...DEFAULT_SAVE_FOLDERS, ...rawFolders])
      );

      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
        activeSaveFolder: normalizeFolderPath(
          parsed.settings?.activeSaveFolder ||
            DEFAULT_SETTINGS.activeSaveFolder
        ),
        availableSaveFolders: mergedFolders,
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

      const migratedFiles =
        Array.isArray(parsed.savedFiles) && parsed.savedFiles.length > 0
          ? parsed.savedFiles.map((f) => ({
              ...f,
              folderPath: normalizeFolderPath(f.folderPath),
              updatedAt:
                f.updatedAt && !Number.isNaN(new Date(f.updatedAt).getTime())
                  ? f.updatedAt
                  : nowIso,
            }))
          : buildInitialSavedFiles();

      return {
        characters,
        activeCharacterId,
        lorebooks,
        activeLorebookId,
        themes,
        tags:
          Array.isArray(parsed.tags) && parsed.tags.length > 0
            ? parsed.tags
            : DEFAULT_TAG_LIBRARY,
        aiConfig: { ...DEFAULT_AI_CONFIG, ...(parsed.aiConfig || {}) },
        settings,
        savedFiles: migratedFiles,
        saveLogs: Array.isArray(parsed.saveLogs)
          ? parsed.saveLogs.map((l) => ({
              ...l,
              folderPath: normalizeFolderPath(l.folderPath),
            }))
          : [],
        lastSavedAt: parsed.lastSavedAt || nowDisplay,
      };
    }
  } catch {
    // Fallback to clean defaults
  }

  return {
    characters: [DEFAULT_CHARACTER, SECOND_CHARACTER],
    activeCharacterId: DEFAULT_CHARACTER.id!,
    lorebooks: [DEFAULT_LOREBOOK, SECOND_LOREBOOK],
    activeLorebookId: DEFAULT_LOREBOOK.id!,
    themes: DEFAULT_CONTEXT_THEMES,
    tags: DEFAULT_TAG_LIBRARY,
    aiConfig: DEFAULT_AI_CONFIG,
    settings: DEFAULT_SETTINGS,
    savedFiles: buildInitialSavedFiles(),
    saveLogs: [
      {
        id: 'log-init',
        timestamp: nowDisplay,
        mode: 'autosave',
        folderPath: '/TavernSmith/Saves/Default',
        filesWritten: [
          'Seraphina_Vance.json',
          'Chronicles_of_Oakhaven_The_Ashen_Reach.json',
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
  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>(
    initial.savedFiles
  );
  const [saveLogs, setSaveLogs] = useState<SaveLogEntry[]>(initial.saveLogs);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initial.lastSavedAt
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Native FileSystemDirectoryHandle ref (when user selects an OS folder via showDirectoryPicker)
  const nativeDirHandleRef = useRef<any>(null);
  const [nativeDirectoryName, setNativeDirectoryName] = useState<string | null>(
    null
  );

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

  // Select Native Save Folder via File System Access API (`window.showDirectoryPicker`)
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
          'Native OS directory picker is not supported in this browser or iframe. Using the In-App Save Folder Manager instead.',
      };
    }

    try {
      const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      nativeDirHandleRef.current = dirHandle;
      const folderName = `/LocalPC/${dirHandle.name || 'SaveFolder'}`;
      setNativeDirectoryName(dirHandle.name || 'SaveFolder');
      setSettings((prev) => {
        const nextFolders = Array.from(
          new Set([folderName, ...prev.availableSaveFolders])
        );
        return {
          ...prev,
          activeSaveFolder: folderName,
          availableSaveFolders: nextFolders,
        };
      });
      return {
        ok: true,
        message: `Connected native local directory "${dirHandle.name}". Manual and Auto-Saves will write JSON files directly to this folder.`,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, message: 'Folder selection cancelled.' };
      }
      return {
        ok: false,
        message:
          'Browser preview iframe restricted native OS folder picker. Open the app in a standalone tab for direct OS disk access, or select/create a path in the In-App Save Folder Manager below.',
      };
    }
  }, []);

  const createSaveFolder = useCallback((rawPath: string) => {
    const clean = rawPath.trim();
    if (!clean) return;
    const normalized = clean.startsWith('/') ? clean : `/TavernSmith/Saves/${clean}`;
    setSettings((prev) => {
      const nextList = Array.from(
        new Set([...prev.availableSaveFolders, normalized])
      );
      return {
        ...prev,
        activeSaveFolder: normalized,
        availableSaveFolders: nextList,
      };
    });
  }, []);

  const setActiveSaveFolder = useCallback((folderPath: string) => {
    setSettings((prev) => ({
      ...prev,
      activeSaveFolder: folderPath,
    }));
  }, []);

  const deleteSavedFile = useCallback((fileId: string) => {
    setSavedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const exportSaveFolderBundle = useCallback(
    (folderPath?: string) => {
      const targetFolder = folderPath || settings.activeSaveFolder;
      const folderFiles = savedFiles.filter(
        (f) => f.folderPath === targetFolder
      );
      const bundle = {
        bundleVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        saveFolder: targetFolder,
        fileCount: folderFiles.length,
        files: folderFiles.map((f) => ({
          fileName: f.fileName,
          kind: f.kind,
          updatedAt: f.updatedAt,
          data: JSON.parse(f.content),
        })),
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const folderSlug = sanitizeFilename(targetFolder.split('/').pop() || 'Saves');
      triggerBrowserDownload(
        blob,
        `TavernSmith_${folderSlug}_BackupBundle.json`
      );
    },
    [savedFiles, settings.activeSaveFolder]
  );

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
  // Writes active Character (`[name].json`) and Lorebook (`[name].json`) directly to the selected Save Folder
  const saveNow = useCallback(
    (mode: 'manual' | 'autosave' = 'manual') => {
      const nowIso = new Date().toISOString();
      const displayTime = formatSafeTimestamp(nowIso);

      const targetFolder =
        settings.activeSaveFolder || '/TavernSmith/Saves/Default';
      const charFileName = `${sanitizeFilename(character.name)}.json`;
      const loreFileName = `${sanitizeFilename(lorebook.name)}.json`;

      // Serialize Character Card & Lorebook without any API keys
      const charSerialized = JSON.stringify(
        serializeCharacterCard(character, settings.cardSpecVersion, lorebook),
        null,
        2
      );
      const loreSerialized = JSON.stringify(
        {
          name: lorebook.name,
          description: lorebook.description,
          scan_depth: lorebook.scan_depth,
          token_budget: lorebook.token_budget,
          recursive_scanning: lorebook.recursive_scanning,
          entries: lorebook.entries,
        },
        null,
        2
      );

      const charFileEntry: SavedFileEntry = {
        id: `${targetFolder}::${charFileName}`,
        folderPath: targetFolder,
        fileName: charFileName,
        kind: 'character',
        sizeBytes: new Blob([charSerialized]).size,
        updatedAt: nowIso,
        content: charSerialized,
      };

      const loreFileEntry: SavedFileEntry = {
        id: `${targetFolder}::${loreFileName}`,
        folderPath: targetFolder,
        fileName: loreFileName,
        kind: 'lorebook',
        sizeBytes: new Blob([loreSerialized]).size,
        updatedAt: nowIso,
        content: loreSerialized,
      };

      setSavedFiles((prev) => {
        const filtered = prev.filter(
          (f) => f.id !== charFileEntry.id && f.id !== loreFileEntry.id
        );
        return [charFileEntry, loreFileEntry, ...filtered];
      });

      const newLog: SaveLogEntry = {
        id: `savelog-${Date.now()}`,
        timestamp: displayTime,
        mode,
        folderPath: targetFolder,
        filesWritten: [charFileName, loreFileName],
        nativeSynced: Boolean(nativeDirHandleRef.current),
      };

      setSaveLogs((prev) => [newLog, ...prev.slice(0, 19)]);

      // If connected to a native OS folder via FileSystemDirectoryHandle, write both files directly
      if (nativeDirHandleRef.current) {
        const dirHandle = nativeDirHandleRef.current;
        (async () => {
          try {
            const cHandle = await dirHandle.getFileHandle(charFileName, {
              create: true,
            });
            const cWritable = await cHandle.createWritable();
            await cWritable.write(charSerialized);
            await cWritable.close();

            const lHandle = await dirHandle.getFileHandle(loreFileName, {
              create: true,
            });
            const lWritable = await lHandle.createWritable();
            await lWritable.write(loreSerialized);
            await lWritable.close();
          } catch {
            // Ignore native permission loss
          }
        })();
      }

      setLastSavedAt(displayTime);
      setIsDirty(false);
    },
    [character, lorebook, settings.activeSaveFolder, settings.cardSpecVersion]
  );

  // Sync full state snapshot to localStorage whenever state or savedFiles update
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

  // Automatic Save Interval Loop writing to the active Save Folder
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
          `${importedChars} character${importedChars === 1 ? '' : 's'}`
        );
      }
      if (importedBooks > 0) {
        parts.push(
          `${importedBooks} lorebook${importedBooks === 1 ? '' : 's'}`
        );
      }

      return {
        count: importedChars + importedBooks,
        summary:
          parts.length > 0
            ? `Imported ${parts.join(' and ')} into library.`
            : 'No valid files imported.',
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
    nativeDirHandleRef.current = null;
    setNativeDirectoryName(null);
    setCharacters([DEFAULT_CHARACTER, SECOND_CHARACTER]);
    setActiveCharacterId(DEFAULT_CHARACTER.id!);
    setLorebooks([DEFAULT_LOREBOOK, SECOND_LOREBOOK]);
    setActiveLorebookId(DEFAULT_LOREBOOK.id!);
    setThemes(DEFAULT_CONTEXT_THEMES);
    setTags(DEFAULT_TAG_LIBRARY);
    setAiConfig(DEFAULT_AI_CONFIG);
    setSettings(DEFAULT_SETTINGS);
    setSavedFiles(buildInitialSavedFiles());
    const nowDisplay = formatSafeTimestamp(new Date().toISOString());
    setSaveLogs([
      {
        id: `log-reset-${Date.now()}`,
        timestamp: nowDisplay,
        mode: 'manual',
        folderPath: DEFAULT_SETTINGS.activeSaveFolder,
        filesWritten: [
          'Seraphina_Vance.json',
          'Chronicles_of_Oakhaven_The_Ashen_Reach.json',
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
      return new Blob([raw]).size;
    } catch {
      return 0;
    }
  }, [
    characters,
    lorebooks,
    themes,
    tags,
    savedFiles,
    saveLogs,
    settings,
    lastSavedAt,
  ]);

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
      selectNativeSaveFolder,
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
      selectNativeSaveFolder,
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
