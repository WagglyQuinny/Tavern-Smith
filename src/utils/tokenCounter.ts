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
  if (stat.type === 'group') {
    return '';
  }
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

export function inferStatTemplatePreset(
  formatTemplate: string,
  explicitPreset?: StatTemplatePresetId
): StatTemplatePresetId {
  if (explicitPreset) return explicitPreset;
  const trimmed = (formatTemplate || '').trim();
  if (trimmed.includes('[STATUS]')) return 'compact_rpg_bar';
  if (trimmed.startsWith('|')) return 'markdown_table';
  return 'collapsible_block';
}

function collectStatPathEntries(
  stats: StatItem[],
  parentPath = ''
): Array<{ path: string; stat: StatItem; depth: number }> {
  const entries: Array<{ path: string; stat: StatItem; depth: number }> = [];
  for (const stat of stats) {
    const cleanLabel = (stat.label || '').trim() || 'Stat';
    const fullPath = parentPath ? `${parentPath}.${cleanLabel}` : cleanLabel;
    const depth = parentPath ? parentPath.split('.').length : 0;
    entries.push({ path: fullPath, stat, depth });
    if (Array.isArray(stat.subStats) && stat.subStats.length > 0) {
      entries.push(...collectStatPathEntries(stat.subStats, fullPath));
    }
  }
  return entries;
}

export function countAllStatItems(stats: StatItem[]): {
  topLevel: number;
  subStats: number;
  total: number;
} {
  let subStats = 0;
  const countChildren = (items: StatItem[]) => {
    for (const item of items) {
      if (Array.isArray(item.subStats) && item.subStats.length > 0) {
        subStats += item.subStats.length;
        countChildren(item.subStats);
      }
    }
  };
  countChildren(stats);
  return {
    topLevel: stats.length,
    subStats,
    total: stats.length + subStats,
  };
}

/**
 * Generates a Format Template string for one of the 3 presets based on current stats and sub-stats.
 */
export function buildStatTemplatePreset(
  preset: StatTemplatePresetId,
  stats: StatItem[]
): string {
  const activeStats: StatItem[] =
    stats.length > 0
      ? stats
      : [
          {
            id: 'default-hp',
            label: 'Resolve',
            type: 'bar',
            defaultValue: '85',
            min: 0,
            max: 100,
            unit: '%',
            changeRules: '',
          },
        ];

  if (preset === 'compact_rpg_bar') {
    const renderCompactNode = (stat: StatItem, parentPath = ''): string => {
      const label = (stat.label || '').trim() || 'Stat';
      const path = parentPath ? `${parentPath}.${label}` : label;
      const children = Array.isArray(stat.subStats) ? stat.subStats : [];
      if (children.length > 0) {
        const subParts = children.map((child) => renderCompactNode(child, path));
        if (stat.type === 'group') {
          return `${label} (${subParts.join(', ')})`;
        }
        return `${label}: {{stat:${path}}} (${subParts.join(', ')})`;
      }
      if (stat.type === 'group') {
        return `${label}: []`;
      }
      return `${label}: {{stat:${path}}}`;
    };

    const parts = activeStats.map((s) => renderCompactNode(s));
    return `\`\`\`text\n[STATUS] ${parts.join(' | ')}\n\`\`\``;
  }

  if (preset === 'markdown_table') {
    const rows: string[] = ['| Stat | Value |', '| :--- | :--- |'];
    const appendTableRows = (items: StatItem[], parentPath = '', depth = 0) => {
      for (const stat of items) {
        const label = (stat.label || '').trim() || 'Stat';
        const path = parentPath ? `${parentPath}.${label}` : label;
        const prefix = depth > 0 ? `${'  '.repeat(depth - 1)}↳ ` : '';
        if (stat.type === 'group') {
          rows.push(`| ${prefix}**${label}** | |`);
        } else {
          rows.push(`| ${prefix}${label} | {{stat:${path}}} |`);
        }
        if (Array.isArray(stat.subStats) && stat.subStats.length > 0) {
          appendTableRows(stat.subStats, path, depth + 1);
        }
      }
    };
    appendTableRows(activeStats);
    return rows.join('\n');
  }

  // Default: 'collapsible_block'
  const yamlLines: string[] = [];
  const appendYamlLines = (items: StatItem[], parentPath = '', depth = 0) => {
    const indent = '  '.repeat(depth);
    for (const stat of items) {
      const label = (stat.label || '').trim() || 'Stat';
      const path = parentPath ? `${parentPath}.${label}` : label;
      const hasChildren =
        Array.isArray(stat.subStats) && stat.subStats.length > 0;
      if (stat.type === 'group') {
        yamlLines.push(
          hasChildren ? `${indent}${label}:` : `${indent}${label}: {}`
        );
      } else {
        yamlLines.push(`${indent}${label}: {{stat:${path}}}`);
      }
      if (hasChildren && stat.subStats) {
        appendYamlLines(stat.subStats, path, depth + 1);
      }
    }
  };
  appendYamlLines(activeStats);
  return `<details><summary>Character Stats</summary>\n\`\`\`yaml\n${yamlLines.join('\n')}\n\`\`\`\n</details>`;
}

/**
 * Renders the concrete live preview / initial stat block (with `{{stat:Label}}` & `{{stat:Parent.Child}}` replaced by formatted defaults).
 */
export function renderInitialStatBlockInstance(statBlock: StatBlockConfig): string {
  if (!statBlock.formatTemplate.trim()) return '';
  let output = statBlock.formatTemplate;

  const pathEntries = collectStatPathEntries(statBlock.stats);
  // Sort longest path first so `Parent.Child` matches before `Parent`
  const sortedEntries = [...pathEntries].sort(
    (a, b) => b.path.length - a.path.length
  );

  for (const { path, stat } of sortedEntries) {
    const renderedVal = formatSingleStatDefault(stat);
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\{\\{stat:${escapedPath}\\}\\}`, 'gi');
    output = output.replace(pattern, () => renderedVal);
  }

  // Fallback: match bare {{stat:Label}} if someone manually wrote a sub-stat without parent prefix
  for (const { stat } of sortedEntries) {
    const cleanLabel = (stat.label || '').trim();
    if (!cleanLabel) continue;
    const renderedVal = formatSingleStatDefault(stat);
    const escapedLabel = cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\{\\{stat:${escapedLabel}\\}\\}`, 'gi');
    output = output.replace(pattern, () => renderedVal);
  }

  return output;
}

/**
 * Formats a StatBlockConfig (including nested sub-stats) into the rendered prompt string that gets injected into SillyTavern's `post_history_instructions`.
 */
export function compileStatBlockPrompt(statBlock: StatBlockConfig): string {
  if (!statBlock.enableDMTracker || statBlock.stats.length === 0) {
    return '';
  }

  const statLines: string[] = [];
  const appendCompiledLines = (items: StatItem[], depth = 0) => {
    const indent = '  '.repeat(depth);
    for (const stat of items) {
      const label = (stat.label || '').trim() || 'Stat';
      if (stat.type === 'group') {
        const rulePart = stat.changeRules
          ? ` (${stat.changeRules})`
          : '';
        statLines.push(`${indent}- [Group] ${label}${rulePart}`);
      } else {
        const rangeInfo =
          stat.type === 'bar'
            ? ` (Progress Bar [████░░], range ${stat.min ?? 0} to ${stat.max ?? 100}${stat.unit ? ' ' + stat.unit : ''})`
            : stat.type === 'number' &&
                stat.min !== undefined &&
                stat.max !== undefined
              ? ` (Number ${stat.min} to ${stat.max}${stat.unit ? ' ' + stat.unit : ''})`
              : ` (${stat.type})`;
        const rulePart = stat.changeRules
          ? ` | Update Rule: ${stat.changeRules}`
          : '';
        statLines.push(
          `${indent}- ${label}${rangeInfo}: Initial = ${formatSingleStatDefault(stat)}${rulePart}`
        );
      }
      if (Array.isArray(stat.subStats) && stat.subStats.length > 0) {
        appendCompiledLines(stat.subStats, depth + 1);
      }
    }
  };
  appendCompiledLines(statBlock.stats);

  return [
    '[System Directive: Dynamic DM/GM Stat Tracker]',
    'At the very end of every response, append the updated Status Block reflecting the events of the turn.',
    'Tracked Attributes & Rules:',
    statLines.join('\n'),
    '',
    'Required Output Format Template:',
    statBlock.formatTemplate.trim(),
  ].join('\n');
}

export function calculateLorebookTokens(lorebook?: Lorebook): {
  constant: number;
  triggered: number;
  total: number;
} {
  if (!lorebook || !Array.isArray(lorebook.entries)) {
    return { constant: 0, triggered: 0, total: 0 };
  }
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
 * Calculates a complete token breakdown for a Character Card, optional linked Lorebook, and StatBlock.
 */
export function calculateCardTokenBreakdown(
  character: CharacterCardData,
  lorebook: Lorebook | undefined,
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

  // Avoid double-counting stat block tokens once compiled into post_history_instructions or system_prompt
  const statBlockAlreadyCompiled =
    Boolean(compiledStats) &&
    ((character.post_history_instructions || '').includes(
      '[System Directive: Dynamic DM/GM Stat Tracker]'
    ) ||
      (character.system_prompt || '').includes(
        '[System Directive: Dynamic DM/GM Stat Tracker]'
      ));

  const loreStats = calculateLorebookTokens(lorebook);

  const permanentTokens =
    name +
    description +
    personality +
    scenario +
    system_prompt +
    post_history_instructions +
    (statBlockAlreadyCompiled ? 0 : stat_block) +
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
