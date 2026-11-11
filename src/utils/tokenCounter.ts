import {
  CharacterCardData,
  Lorebook,
  StatBlockConfig,
  StatItem,
  StatTemplatePresetId,
  TokenBreakdown,
} from '../types';

/**
 * Estimates GPT/Llama BPE tokens using a ~3.8 characters/word heuristic
 * combined with punctuation and macro weighting (`{{char}}`, `{{user}}`).
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const charBased = trimmed.length / 3.8;
  const wordBased = words.length * 1.28;

  const punctuationMatches = trimmed.match(/[{}[\]().,!?;:"'`~@#$%^&*+=<>|\\/-]/g);
  const punctuationCount = punctuationMatches ? punctuationMatches.length : 0;
  const newlineMatches = trimmed.match(/\n/g);
  const newlineCount = newlineMatches ? newlineMatches.length : 0;

  const blended =
    charBased * 0.7 +
    wordBased * 0.3 +
    punctuationCount * 0.14 +
    newlineCount * 0.25;

  return Math.max(1, Math.ceil(blended));
}

/**
 * Renders an ASCII progress bar like `[██████░░░░] 60%` for `bar` type stats.
 */
export function formatAsciiProgressBar(
  valueStr: string,
  min = 0,
  max = 100,
  unit = '%',
  width = 8
): string {
  const numeric = parseFloat(valueStr);
  if (Number.isNaN(numeric)) {
    return `[${'█'.repeat(Math.floor(width / 2))}${'░'.repeat(
      width - Math.floor(width / 2)
    )}] ${valueStr}${unit}`;
  }
  const span = Math.max(1, max - min);
  const ratio = Math.min(1, Math.max(0, (numeric - min) / span));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${numeric}/${max}${unit}`;
}

export function formatSingleStatDefault(stat: StatItem): string {
  if (stat.type === 'bar') {
    return formatAsciiProgressBar(
      stat.defaultValue,
      stat.min ?? 0,
      stat.max ?? 100,
      stat.unit ?? ''
    );
  }
  if (stat.type === 'list') {
    return `[${stat.defaultValue}]`;
  }
  return `${stat.defaultValue}${stat.unit ? ' ' + stat.unit : ''}`;
}

/**
 * Generates a Format Template string for one of the 3 presets based on current stats.
 */
export function buildStatTemplatePreset(
  preset: StatTemplatePresetId,
  stats: StatItem[]
): string {
  const activeStats =
    stats.length > 0
      ? stats
      : [
          {
            id: 'default-hp',
            label: 'Resolve',
            type: 'bar' as const,
            defaultValue: '85',
            min: 0,
            max: 100,
            unit: '%',
            changeRules: '',
          },
        ];

  if (preset === 'compact_rpg_bar') {
    const parts = activeStats.map((s) => `${s.label}: {{stat:${s.label}}}`);
    return `\`\`\`text\n[STATUS] ${parts.join(' | ')}\n\`\`\``;
  }

  if (preset === 'markdown_table') {
    const headers = activeStats.map((s) => ` ${s.label} `).join('|');
    const dividers = activeStats.map(() => ' :--- ').join('|');
    const values = activeStats.map((s) => ` {{stat:${s.label}}} `).join('|');
    return `|${headers}|\n|${dividers}|\n|${values}|`;
  }

  // Default: 'collapsible_block'
  const yamlLines = activeStats
    .map((s) => `${s.label}: {{stat:${s.label}}}`)
    .join('\n');
  return `<details><summary>Status & Telemetry</summary>\n\`\`\`yaml\n${yamlLines}\n\`\`\`\n</details>`;
}

/**
 * Renders the concrete live preview / initial stat block (with `{{stat:Label}}` replaced by formatted defaults).
 */
export function renderInitialStatBlockInstance(statBlock: StatBlockConfig): string {
  if (!statBlock.formatTemplate.trim()) return '';
  let output = statBlock.formatTemplate;
  for (const stat of statBlock.stats) {
    const renderedVal = formatSingleStatDefault(stat);
    const pattern = new RegExp(
      `\\{\\{stat:${stat.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
      'gi'
    );
    output = output.replace(pattern, renderedVal);
  }
  return output;
}

/**
 * Formats a StatBlockConfig into the rendered prompt string that gets injected into SillyTavern's `post_history_instructions`.
 */
export function compileStatBlockPrompt(statBlock: StatBlockConfig): string {
  if (!statBlock.enableDMTracker || statBlock.stats.length === 0) {
    return '';
  }

  const statLines = statBlock.stats
    .map((stat) => {
      const rangeInfo =
        stat.type === 'bar'
          ? ` (Progress Bar [████░░], range ${stat.min ?? 0} to ${stat.max ?? 100}${stat.unit ? ' ' + stat.unit : ''})`
          : stat.type === 'number' &&
              stat.min !== undefined &&
              stat.max !== undefined
            ? ` (Number ${stat.min} to ${stat.max}${stat.unit ? ' ' + stat.unit : ''})`
            : ` (${stat.type})`;
      const rulePart = stat.changeRules ? ` | Update Rule: ${stat.changeRules}` : '';
      return `- ${stat.label}${rangeInfo}: Initial = ${formatSingleStatDefault(stat)}${rulePart}`;
    })
    .join('\n');

  return [
    '[System Directive: Dynamic DM/GM Stat Tracker]',
    'At the very end of every response, append the updated Status Block reflecting the events of the turn.',
    'Tracked Attributes & Rules:',
    statLines,
    '',
    'Required Output Format Template:',
    statBlock.formatTemplate.trim(),
  ].join('\n');
}

export function calculateLorebookTokens(lorebook: Lorebook): {
  constant: number;
  triggered: number;
  total: number;
} {
  let constant = 0;
  let triggered = 0;
  for (const entry of lorebook.entries) {
    if (!entry.enabled) continue;
    const tkn = estimateTokens(entry.content);
    if (entry.constant) {
      constant += tkn;
    } else {
      triggered += tkn;
    }
  }
  return { constant, triggered, total: constant + triggered };
}

/**
 * Calculates a complete token breakdown for a Character Card, Lorebook, and StatBlock.
 */
export function calculateCardTokenBreakdown(
  character: CharacterCardData,
  lorebook: Lorebook,
  statBlock: StatBlockConfig
): TokenBreakdown {
  const name = estimateTokens(character.name);
  const description = estimateTokens(character.description);
  const personality = estimateTokens(character.personality);
  const scenario = estimateTokens(character.scenario);
  const first_mes = estimateTokens(character.first_mes);
  const mes_example = estimateTokens(character.mes_example);
  const system_prompt = estimateTokens(character.system_prompt);
  const post_history_instructions = estimateTokens(
    character.post_history_instructions
  );
  const creator_notes = estimateTokens(character.creator_notes);

  const alternate_greetings = (character.alternate_greetings || []).reduce(
    (sum, greeting) => sum + estimateTokens(greeting),
    0
  );

  const compiledStats = compileStatBlockPrompt(statBlock);
  const stat_block = estimateTokens(compiledStats);

  const loreStats = calculateLorebookTokens(lorebook);

  const permanentTokens =
    name +
    description +
    personality +
    scenario +
    system_prompt +
    post_history_instructions +
    stat_block +
    loreStats.constant;

  const temporaryTokens = first_mes + mes_example;
  const totalCardTokens = permanentTokens + temporaryTokens + loreStats.triggered;

  return {
    name,
    description,
    personality,
    scenario,
    first_mes,
    mes_example,
    system_prompt,
    post_history_instructions,
    alternate_greetings,
    creator_notes,
    stat_block,
    lorebook_constant: loreStats.constant,
    lorebook_Triggered: loreStats.triggered,
    permanentTokens,
    temporaryTokens,
    totalCardTokens,
  };
}
