import { MAX_ZOOM } from "./config";

export interface EdoDisplayCandidate {
  readonly id: string;
  readonly sourceName: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly sourceIndexes: readonly number[];
  readonly aggregate?: boolean;
}

export interface EdoProgressiveRevealRule {
  readonly cellSize: number | null;
  readonly representatives: number | null;
}

export interface EdoProgressiveRevealSelection {
  readonly eligible: readonly EdoDisplayCandidate[];
  readonly visible: readonly EdoDisplayCandidate[];
}

export const EDO_PROGRESSIVE_REVEAL_MIN_ZOOM = 12;

/** Runtime map prominence only. This is unrelated to Description Priority. */
export function mapDisplayPriority(candidate: Pick<EdoDisplayCandidate, "sourceName" | "category">): number {
  const categoryBoost: Readonly<Record<string, number>> = {
    海川池: 30,
    名所: 28,
    寺社: 24,
    施設: 20,
    地名: 14,
    町村字: 12,
    町地: 12,
    屋敷地: 6,
  };
  let priority = 100 + (categoryBoost[candidate.category] ?? 0);
  if (/[御惣総]門|門跡|川|河|堀|池|橋/.test(candidate.sourceName)) priority += 16;
  if (candidate.sourceName.length <= 2) priority -= 12;
  return priority;
}

export function minDisplayZoom(
  candidate: Pick<EdoDisplayCandidate, "sourceName" | "category">,
  maximumZoom = MAX_ZOOM,
): number {
  if (candidate.sourceName.startsWith("（")) return maximumZoom;
  const priority = mapDisplayPriority(candidate);
  if (priority >= 140) return 12;
  if (priority >= 128) return 13;
  if (priority >= 120) return 14;
  if (priority >= 112) return 15;
  if (priority >= 104) return 16;
  return 17;
}

export function edoProgressiveRevealRule(zoom: number, maximumZoom = MAX_ZOOM): EdoProgressiveRevealRule {
  if (zoom <= 12) return { cellSize: 144, representatives: 1 };
  if (zoom === 13) return { cellSize: 120, representatives: 1 };
  if (zoom === 14) return { cellSize: 96, representatives: 2 };
  if (zoom === 15) return { cellSize: 72, representatives: 3 };
  if (zoom === 16) return { cellSize: 56, representatives: 4 };
  if (zoom >= 17 && zoom <= maximumZoom) return { cellSize: null, representatives: null };
  return { cellSize: null, representatives: 0 };
}

export function compareEdoDisplayCandidates(a: EdoDisplayCandidate, b: EdoDisplayCandidate): number {
  return mapDisplayPriority(b) - mapDisplayPriority(a) || a.id.localeCompare(b.id, "en");
}

export function selectEdoProgressiveReveal(
  candidates: readonly EdoDisplayCandidate[],
  zoom: number,
  project: (latitude: number, longitude: number, zoom: number) => { readonly x: number; readonly y: number },
  maximumZoom = MAX_ZOOM,
): EdoProgressiveRevealSelection {
  if (zoom < EDO_PROGRESSIVE_REVEAL_MIN_ZOOM || zoom > maximumZoom) {
    return { eligible: [], visible: [] };
  }
  const eligible = candidates
    .filter((candidate) => zoom >= minDisplayZoom(candidate, maximumZoom))
    .sort(compareEdoDisplayCandidates);
  const rule = edoProgressiveRevealRule(zoom, maximumZoom);
  if (rule.cellSize === null || rule.representatives === null) {
    return { eligible, visible: eligible };
  }
  const cellCounts = new Map<string, number>();
  const visible: EdoDisplayCandidate[] = [];
  for (const candidate of eligible) {
    const point = project(candidate.latitude, candidate.longitude, zoom);
    const key = `${zoom}/${Math.floor(point.x / rule.cellSize)}/${Math.floor(point.y / rule.cellSize)}`;
    const count = cellCounts.get(key) ?? 0;
    if (count >= rule.representatives) continue;
    cellCounts.set(key, count + 1);
    visible.push(candidate);
  }
  return { eligible, visible };
}
