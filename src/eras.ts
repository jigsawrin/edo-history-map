import catalogData from "./era-catalog.json";

export type EraBaseMode = "modern" | "reconstructed" | "historical-image";

/** 地域に依存しない年代カタログ。表示レイヤーと出典は地域パックが所有する。 */
export interface EraDefinition {
  id: string;
  label: string;
  localizedLabels?: Partial<Record<"ja" | "en", string>>;
  startYear: number | null;
  endYear: number | null;
}

export const VISUAL_LAYER_IDS = {
  modernBase: "modern-base",
  reconstructedBackground: "reconstructed-background",
  historicalCoastline: "historical-coastline",
  historicalWater: "historical-water",
  historicalMoats: "historical-moats",
  historicalRoads: "historical-roads",
  historicalCommonerAreas: "historical-commoner-areas",
  historicalSamuraiAreas: "historical-samurai-areas",
  historicalTempleAreas: "historical-temple-areas",
  historicalCastle: "historical-castle",
  historicalPoints: "historical-points",
} as const;

export const VISUAL_LAYER_ENABLED: Readonly<Record<string, boolean>> = {
  [VISUAL_LAYER_IDS.modernBase]: true,
  [VISUAL_LAYER_IDS.reconstructedBackground]: true,
  [VISUAL_LAYER_IDS.historicalCoastline]: true,
  [VISUAL_LAYER_IDS.historicalWater]: false,
  [VISUAL_LAYER_IDS.historicalMoats]: false,
  [VISUAL_LAYER_IDS.historicalRoads]: false,
  [VISUAL_LAYER_IDS.historicalCommonerAreas]: true,
  [VISUAL_LAYER_IDS.historicalSamuraiAreas]: false,
  [VISUAL_LAYER_IDS.historicalTempleAreas]: false,
  [VISUAL_LAYER_IDS.historicalCastle]: false,
  [VISUAL_LAYER_IDS.historicalPoints]: true,
};

export function isVisualLayerEnabled(id: string): boolean {
  return VISUAL_LAYER_ENABLED[id] === true;
}

const ERA_DEFINITIONS = catalogData as readonly EraDefinition[];

function cloneDefinition(definition: EraDefinition): Readonly<EraDefinition> {
  const clone: EraDefinition = { ...definition };
  if (definition.localizedLabels) {
    clone.localizedLabels = Object.freeze({ ...definition.localizedLabels });
  }
  return Object.freeze(clone);
}

export class EraRegistry {
  readonly #definitions: ReadonlyMap<string, Readonly<EraDefinition>>;

  constructor(definitions: readonly EraDefinition[] = ERA_DEFINITIONS) {
    const entries = definitions.map((definition) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id) || !definition.label) {
        throw new Error("年代定義のIDとラベルが不正です");
      }
      return [definition.id, cloneDefinition(definition)] as const;
    });
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("年代定義のIDが重複しています");
    }
    this.#definitions = new Map(entries);
  }

  get(id: string): Readonly<EraDefinition> | null {
    return this.#definitions.get(id) ?? null;
  }

  all(): readonly Readonly<EraDefinition>[] {
    return [...this.#definitions.values()];
  }
}

export const eraRegistry = new EraRegistry();

export function formatEraLabel(
  era: Readonly<EraDefinition>,
  locale: "ja" | "en" = "ja",
): string {
  const label = era.localizedLabels?.[locale] ?? era.label;
  if (era.startYear === null || era.endYear === null) return label;
  return `${label} ${era.startYear}\u2013${era.endYear}`;
}

export function populateEraSelect(
  select: HTMLSelectElement,
  eraIds: readonly string[],
  registry: EraRegistry = eraRegistry,
  locale: "ja" | "en" = document.documentElement.lang.startsWith("en")
    ? "en"
    : "ja",
): void {
  const selected = select.value;
  const options = eraIds.map((eraId) => {
    const era = registry.get(eraId);
    if (!era) throw new Error(`存在しない年代IDです: ${eraId}`);
    const option = document.createElement("option");
    option.value = era.id;
    option.textContent = formatEraLabel(era, locale);
    return option;
  });
  select.replaceChildren(...options);
  if (eraIds.includes(selected)) select.value = selected;
}
