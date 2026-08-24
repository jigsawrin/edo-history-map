export interface EdoDisplayCandidate {
  readonly id: string;
  readonly sourceName: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly sourceIndexes: readonly number[];
  readonly supplemental?: boolean;
}

export interface EdoDisplayCell {
  readonly key: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly visible: readonly EdoDisplayCandidate[];
  readonly hidden: readonly EdoDisplayCandidate[];
  readonly hiddenSourceCount: number;
}

export interface EdoDeclutterAggregate {
  readonly key: string;
  readonly hiddenSourceCount: number;
  readonly members: readonly EdoDisplayCandidate[];
}

export interface EdoDeclutterRule {
  readonly cellSize: number;
  readonly representatives: number;
}

export const EDO_DECLUTTER_MIN_ZOOM = 12;
export const EDO_DECLUTTER_MAX_ZOOM = 16;

export function edoDeclutterRule(zoom: number): EdoDeclutterRule {
  if (zoom <= 12) return { cellSize: 144, representatives: 0 };
  if (zoom === 13) return { cellSize: 144, representatives: 1 };
  if (zoom === 14) return { cellSize: 120, representatives: 1 };
  if (zoom === 15) return { cellSize: 96, representatives: 2 };
  return { cellSize: 72, representatives: 4 };
}

/** Runtime map prominence only. This is unrelated to Description Priority. */
export function mapDisplayPriority(candidate: Pick<EdoDisplayCandidate, "sourceName" | "category" | "supplemental">): number {
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
  if (candidate.supplemental) priority -= 48;
  if (candidate.sourceName.startsWith("（")) priority -= 80;
  return priority;
}

export function compareEdoDisplayCandidates(a: EdoDisplayCandidate, b: EdoDisplayCandidate): number {
  return mapDisplayPriority(b) - mapDisplayPriority(a) ||
    a.sourceName.localeCompare(b.sourceName, "ja") ||
    a.id.localeCompare(b.id);
}

export function selectEdoDisplayCells(
  candidates: readonly EdoDisplayCandidate[],
  zoom: number,
  project: (latitude: number, longitude: number, zoom: number) => { readonly x: number; readonly y: number },
): readonly EdoDisplayCell[] {
  const rule = edoDeclutterRule(zoom);
  const byCell = new Map<string, { x: number; y: number; members: EdoDisplayCandidate[] }>();
  for (const candidate of candidates) {
    const point = project(candidate.latitude, candidate.longitude, zoom);
    const x = Math.floor(point.x / rule.cellSize);
    const y = Math.floor(point.y / rule.cellSize);
    const key = `${zoom}/${x}/${y}`;
    const cell = byCell.get(key) ?? { x, y, members: [] };
    cell.members.push(candidate);
    byCell.set(key, cell);
  }
  return [...byCell.entries()].map(([key, cell]) => {
    const sorted = [...cell.members].sort(compareEdoDisplayCandidates);
    const visibleCount = rule.representatives === 0
      ? (sorted.length === 1 ? 1 : 0)
      : (sorted.length <= rule.representatives + 1 ? sorted.length : rule.representatives);
    const hidden = sorted.slice(visibleCount);
    return {
      key,
      centerX: (cell.x + 0.5) * rule.cellSize,
      centerY: (cell.y + 0.5) * rule.cellSize,
      visible: sorted.slice(0, visibleCount),
      hidden,
      hiddenSourceCount: hidden.reduce((sum, item) => sum + item.sourceIndexes.length, 0),
    };
  }).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
}
