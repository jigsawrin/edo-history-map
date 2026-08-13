export const EDO_NAVIGATION_MIN_ZOOM = 5;
export const EDO_NAVIGATION_MAX_ZOOM = 14;
export const EDO_NAVIGATION_CELL_SIZE = 48;

export interface NavigationPresentationPoint {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface NavigationWorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface EdoNavigationCell {
  readonly key: string;
  readonly zoom: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly memberIds: readonly string[];
  readonly memberCount: number;
}

export type NavigationProjector = (
  latitude: number,
  longitude: number,
  zoom: number,
) => NavigationWorldPoint;

export interface EdoNavigationGrid {
  readonly cellsByZoom: ReadonlyMap<number, readonly EdoNavigationCell[]>;
  firstSplittingZoom(cell: EdoNavigationCell): number;
}

export function navigationCellKey(zoom: number, cellX: number, cellY: number): string {
  return `${zoom}/${cellX}/${cellY}`;
}

export function buildEdoNavigationGrid(
  points: readonly NavigationPresentationPoint[],
  project: NavigationProjector,
  cellSize = EDO_NAVIGATION_CELL_SIZE,
  minZoom = EDO_NAVIGATION_MIN_ZOOM,
  maxZoom = EDO_NAVIGATION_MAX_ZOOM,
): EdoNavigationGrid {
  const pointById = new Map(points.map((point) => [point.id, point]));
  if (pointById.size !== points.length) throw new Error("Edo navigation point IDs must be unique");
  const cellsByZoom = new Map<number, readonly EdoNavigationCell[]>();

  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const membersByKey = new Map<string, { cellX: number; cellY: number; memberIds: string[] }>();
    for (const point of points) {
      const projected = project(point.latitude, point.longitude, zoom);
      const cellX = Math.floor(projected.x / cellSize);
      const cellY = Math.floor(projected.y / cellSize);
      const key = navigationCellKey(zoom, cellX, cellY);
      const cell = membersByKey.get(key) ?? { cellX, cellY, memberIds: [] };
      cell.memberIds.push(point.id);
      membersByKey.set(key, cell);
    }
    cellsByZoom.set(zoom, [...membersByKey.entries()]
      .map(([key, cell]) => {
        const memberIds = cell.memberIds.sort();
        return {
          key,
          zoom,
          cellX: cell.cellX,
          cellY: cell.cellY,
          centerX: (cell.cellX + 0.5) * cellSize,
          centerY: (cell.cellY + 0.5) * cellSize,
          memberIds,
          memberCount: memberIds.length,
        };
      })
      .sort((a, b) => a.cellY - b.cellY || a.cellX - b.cellX));
  }

  return {
    cellsByZoom,
    firstSplittingZoom(cell) {
      for (let zoom = cell.zoom + 1; zoom <= maxZoom; zoom += 1) {
        const childKeys = new Set(cell.memberIds.map((id) => {
          const point = pointById.get(id);
          if (!point) throw new Error(`Unknown Edo navigation point: ${id}`);
          const projected = project(point.latitude, point.longitude, zoom);
          return navigationCellKey(
            zoom,
            Math.floor(projected.x / cellSize),
            Math.floor(projected.y / cellSize),
          );
        }));
        if (childKeys.size >= 2) return zoom;
      }
      return maxZoom + 1;
    },
  };
}

export function navigationCellIntersectsPixelBounds(
  cell: Pick<EdoNavigationCell, "cellX" | "cellY">,
  bounds: {
    readonly min?: NavigationWorldPoint | undefined;
    readonly max?: NavigationWorldPoint | undefined;
  },
  cellSize = EDO_NAVIGATION_CELL_SIZE,
): boolean {
  if (!bounds.min || !bounds.max) return false;
  const minX = cell.cellX * cellSize;
  const minY = cell.cellY * cellSize;
  return minX <= bounds.max.x && minX + cellSize >= bounds.min.x &&
    minY <= bounds.max.y && minY + cellSize >= bounds.min.y;
}
