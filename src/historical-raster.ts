import L from "leaflet";
import registryData from "./historical-raster-registry.json";
import { resolveAttributions } from "./attribution-registry";
import {
  assertManifestMatchesDefinition,
  validateHistoricalRasterManifest,
  type HistoricalRasterManifest,
} from "./historical-raster-manifest.mjs";
import {
  validateHistoricalRasterDefinitions,
} from "./historical-raster-schema.mjs";
import { MAP_PANES } from "./leaflet-layers";

export type HistoricalRasterReviewStatus = "approved" | "pending" | "rejected";
export type HistoricalRasterTileFormat = "png" | "webp";
export type HistoricalRasterGeoreferenceMethod =
  | "projective"
  | "polynomial-1"
  | "polynomial-2"
  | "thin-plate-spline"
  | "map-warper-export"
  | "other";
export type HistoricalRasterSeamPolicy =
  | "single-sheet"
  | "manual-selection"
  | "fixed-priority";

export interface HistoricalRasterDefinition {
  readonly id: string;
  readonly regionId: string;
  readonly eraId: string;
  readonly titleJa: string;
  readonly titleEn?: string;
  readonly sheetLabelJa: string;
  readonly sheetLabelEn?: string;
  readonly sourceId: string;
  readonly attributionId: string;
  readonly localTilePath: string;
  readonly tileManifestPath: string;
  readonly tileFormat: HistoricalRasterTileFormat;
  readonly tileSize: 256;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly maxNativeZoom: number;
  readonly bounds: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly defaultOpacity: number;
  readonly georeferenceMethod: HistoricalRasterGeoreferenceMethod;
  readonly controlPointCount: number;
  readonly estimatedErrorMeters: number | null;
  readonly maximumErrorMeters: number | null;
  readonly qualityGateVersion?: 1;
  readonly qualityGatePassed?: boolean;
  readonly sourceDateDisplayJa: string;
  readonly geographicCoverageJa: string;
  readonly georeferenceNoteJa: string;
  readonly contextNoteJa: string;
  readonly seamPolicy: HistoricalRasterSeamPolicy;
  readonly priority: number;
  readonly reviewStatus: HistoricalRasterReviewStatus;
}

/** DATA_SOURCES.yml の画像単位の権利監査を通過した source ID だけを列挙する。 */
export const APPROVED_HISTORICAL_RASTER_SOURCE_IDS: readonly string[] = [];

/** 権利確認済み画像がないため、実行時レジストリは意図的に空。 */
export const HISTORICAL_RASTER_DEFINITIONS =
  validateHistoricalRasterDefinitions(registryData);

export function getApprovedHistoricalRasters(
  definitions: readonly HistoricalRasterDefinition[] =
    HISTORICAL_RASTER_DEFINITIONS,
  approvedSourceIds: readonly string[] = APPROVED_HISTORICAL_RASTER_SOURCE_IDS,
): readonly Readonly<HistoricalRasterDefinition>[] {
  const approvedSources = new Set(approvedSourceIds);
  let validatedDefinitions: readonly Readonly<HistoricalRasterDefinition>[];
  try {
    validatedDefinitions = validateHistoricalRasterDefinitions(definitions);
  } catch {
    // 不正定義は実行時レジストリへ通さない。公開前監査ではエラーとして報告する。
    return Object.freeze([]);
  }
  const approved = validatedDefinitions.filter(
    (definition) =>
      definition.reviewStatus === "approved" &&
      definition.qualityGatePassed === true &&
      approvedSources.has(definition.sourceId),
  );
  return Object.freeze(
    approved.sort((left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id, "en")),
  );
}

export interface HistoricalRasterLayer {
  readonly layer: L.TileLayer;
  readonly definition: Readonly<HistoricalRasterDefinition>;
  activate(): void;
  deactivate(): void;
  setOpacity(value: number): void;
  dispose(): void;
}

export interface HistoricalRasterLayerOptions {
  readonly definitions?: readonly HistoricalRasterDefinition[];
  readonly approvedSourceIds?: readonly string[];
  readonly onTileError?: (message: string) => void;
}

function clampOpacity(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function createHistoricalRasterLayer(
  definition: HistoricalRasterDefinition,
  options: HistoricalRasterLayerOptions = {},
): HistoricalRasterLayer {
  const allowed = getApprovedHistoricalRasters(
    options.definitions,
    options.approvedSourceIds,
  ).find((candidate) => candidate.id === definition.id);
  if (!allowed || allowed.localTilePath !== definition.localTilePath) {
    throw new Error("固定レジストリで承認されていない古地図ラスタです");
  }
  const [attribution] = resolveAttributions([allowed.attributionId]);
  const layer = L.tileLayer(allowed.localTilePath, {
    pane: MAP_PANES.historicalRaster,
    attribution,
    noWrap: true,
    bounds: [
      [...allowed.bounds[0]],
      [...allowed.bounds[1]],
    ] as L.LatLngBoundsLiteral,
    minZoom: allowed.minZoom,
    maxZoom: allowed.maxZoom,
    maxNativeZoom: allowed.maxNativeZoom,
    tileSize: allowed.tileSize,
    opacity: clampOpacity(allowed.defaultOpacity),
  });
  let reportedTileError = false;
  const handleTileError = (): void => {
    if (reportedTileError) return;
    reportedTileError = true;
    options.onTileError?.(
      "古地図タイルの一部を読み込めませんでした。現代地図と地点は引き続き利用できます。",
    );
  };
  let listening = false;
  const activate = (): void => {
    if (listening) return;
    layer.on("tileerror", handleTileError);
    listening = true;
  };
  const deactivate = (): void => {
    if (!listening) return;
    layer.off("tileerror", handleTileError);
    listening = false;
  };
  activate();
  return Object.freeze({
    layer,
    definition: allowed,
    activate,
    deactivate,
    setOpacity(value: number): void {
      layer.setOpacity(clampOpacity(value));
    },
    dispose(): void {
      deactivate();
      layer.remove();
    },
  });
}

/** 旧API互換。IDは固定レジストリ以外から受け付けない。 */
export function addHistoricalImageLayer(rasterId?: string): L.TileLayer | null {
  if (!rasterId) return null;
  const definition = getApprovedHistoricalRasters().find(
    (candidate) => candidate.id === rasterId,
  );
  return definition ? createHistoricalRasterLayer(definition).layer : null;
}

/** 同一originの固定manifestを、ページ存続中だけPromise単位で再利用する。 */
export class HistoricalRasterManifestCache {
  readonly #cache = new Map<string, Promise<HistoricalRasterManifest>>();

  load(
    definition: Readonly<HistoricalRasterDefinition>,
  ): Promise<HistoricalRasterManifest> {
    const cached = this.#cache.get(definition.id);
    if (cached) return cached;
    const promise = this.#load(definition).catch((error: unknown) => {
      this.#cache.delete(definition.id);
      throw error;
    });
    this.#cache.set(definition.id, promise);
    return promise;
  }

  async #load(
    definition: Readonly<HistoricalRasterDefinition>,
  ): Promise<HistoricalRasterManifest> {
    const url = new URL(definition.tileManifestPath, document.baseURI);
    if (url.origin !== window.location.origin) {
      throw new Error("古地図manifestは同一originである必要があります");
    }
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("古地図manifestを読み込めません");
    const text = await response.text();
    if (text.length > 1024 * 1024) {
      throw new Error("古地図manifestが大きすぎます");
    }
    const manifest = validateHistoricalRasterManifest(JSON.parse(text));
    return assertManifestMatchesDefinition(manifest, definition);
  }
}
