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
  readonly collisionDistance: number | null;
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
  if (zoom <= 12) return { collisionDistance: 48 };
  if (zoom === 13) return { collisionDistance: 40 };
  if (zoom === 14) return { collisionDistance: 32 };
  if (zoom === 15) return { collisionDistance: 24 };
  if (zoom === 16) return { collisionDistance: 16 };
  if (zoom >= 17 && zoom <= maximumZoom) return { collisionDistance: null };
  return { collisionDistance: null };
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
  if (zoom >= 17) {
    return { eligible, visible: eligible };
  }

  const acceptedIds = new Set<string>();
  // Seed each stage with every earlier winner so zooming in can only add markers.
  for (let stageZoom = EDO_PROGRESSIVE_REVEAL_MIN_ZOOM; stageZoom <= zoom; stageZoom += 1) {
    const distance = edoProgressiveRevealRule(stageZoom, maximumZoom).collisionDistance;
    if (distance === null) break;
    const buckets = new Map<string, { readonly x: number; readonly y: number }[]>();
    const addPoint = (x: number, y: number): void => {
      const key = `${Math.floor(x / distance)}/${Math.floor(y / distance)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({ x, y });
      buckets.set(key, bucket);
    };
    for (const candidate of eligible) {
      if (!acceptedIds.has(candidate.id) || stageZoom < minDisplayZoom(candidate, maximumZoom)) continue;
      const point = project(candidate.latitude, candidate.longitude, stageZoom);
      addPoint(point.x, point.y);
    }
    const stageEligible = eligible.filter((candidate) => stageZoom >= minDisplayZoom(candidate, maximumZoom));
    for (const candidate of stageEligible) {
      if (acceptedIds.has(candidate.id)) continue;
      const point = project(candidate.latitude, candidate.longitude, stageZoom);
      const bucketX = Math.floor(point.x / distance);
      const bucketY = Math.floor(point.y / distance);
      let collides = false;
      for (let x = bucketX - 1; x <= bucketX + 1 && !collides; x += 1) {
        for (let y = bucketY - 1; y <= bucketY + 1 && !collides; y += 1) {
          collides = (buckets.get(`${x}/${y}`) ?? []).some((accepted) =>
            (accepted.x - point.x) ** 2 + (accepted.y - point.y) ** 2 < distance ** 2
          );
        }
      }
      if (collides) continue;
      acceptedIds.add(candidate.id);
      addPoint(point.x, point.y);
    }
  }
  return { eligible, visible: eligible.filter((candidate) => acceptedIds.has(candidate.id)) };
}
