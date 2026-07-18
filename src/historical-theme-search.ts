import { normalizeSearchText } from "./place-search/normalize";
import type { HistoricalThemeDefinition, HistoricalThemeType } from "./historical-theme-registry";

interface RankedTheme {
  readonly theme: HistoricalThemeDefinition;
  readonly rank: number;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function themeRank(theme: HistoricalThemeDefinition, query: string): number {
  if (!query) return 0;
  const title = normalizeSearchText(theme.titleJa);
  const titleEn = normalizeSearchText(theme.titleEn ?? "");
  const aliases = theme.aliasesJa.map(normalizeSearchText);
  if (title === query || titleEn === query) return 0;
  if (aliases.includes(query)) return 1;
  if (title.startsWith(query) || titleEn.startsWith(query)) return 2;
  if (title.includes(query) || titleEn.includes(query)) return 3;
  if (aliases.some((alias) => alias.includes(query))) return 4;
  if (normalizeSearchText(theme.summaryJa).includes(query)) return 5;
  return -1;
}

export function searchHistoricalThemes(
  themes: readonly HistoricalThemeDefinition[],
  input: string,
  type: HistoricalThemeType | "" = "",
): readonly HistoricalThemeDefinition[] {
  const query = normalizeSearchText(input);
  const ranked: RankedTheme[] = [];
  for (const theme of themes) {
    if (type && theme.type !== type) continue;
    const rank = themeRank(theme, query);
    if (rank >= 0) ranked.push({ theme, rank });
  }
  ranked.sort((left, right) => left.rank - right.rank || compareCodeUnits(left.theme.titleJa, right.theme.titleJa) || compareCodeUnits(left.theme.id, right.theme.id));
  return Object.freeze(ranked.map(({ theme }) => theme));
}
