import { normalizeSearchText } from "./place-search/normalize";
import type { HistoricalTimelineEntry, HistoricalTimelineEntryType, HistoricalTimelineTrack } from "./historical-timeline-registry";

function rank(entry: HistoricalTimelineEntry, query: string): number {
  if (!query) return 0;
  const titles = [entry.titleJa, entry.titleEn ?? ""].map(normalizeSearchText);
  const aliases = entry.aliasesJa.map(normalizeSearchText);
  if (titles.includes(query)) return 0;
  if (aliases.includes(query)) return 1;
  if (titles.some((title) => title.startsWith(query))) return 2;
  if (titles.some((title) => title.includes(query))) return 3;
  if (aliases.some((alias) => alias.includes(query))) return 4;
  if (normalizeSearchText(entry.date.displayJa).includes(query)) return 5;
  if (normalizeSearchText(entry.summaryJa).includes(query)) return 6;
  return -1;
}

export function searchHistoricalTimeline(
  entries: readonly HistoricalTimelineEntry[], input: string,
  track: HistoricalTimelineTrack | "" = "", type: HistoricalTimelineEntryType | "" = "",
): readonly HistoricalTimelineEntry[] {
  const query = normalizeSearchText(input);
  return Object.freeze(entries
    .map((entry) => ({ entry, rank: track && entry.track !== track || type && entry.type !== type ? -1 : rank(entry, query) }))
    .filter(({ rank: entryRank }) => entryRank >= 0)
    .sort((left, right) => left.rank - right.rank || left.entry.order - right.entry.order)
    .map(({ entry }) => entry));
}
