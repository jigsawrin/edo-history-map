export type EraBaseMode = "modern" | "reconstructed" | "historical-image";

export interface EraDefinition {
  id: string;
  label: string;
  startYear: number | null;
  endYear: number | null;
  baseMode: EraBaseMode;
  visualLayers: string[];
  placeDatasetId: string | null;
  attributionIds: string[];
  uncertaintyNote: string;
  enabled: boolean;
  localizedLabels?: Partial<Record<"ja" | "en", string>>;
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
  [VISUAL_LAYER_IDS.historicalCoastline]: false,
  [VISUAL_LAYER_IDS.historicalWater]: false,
  [VISUAL_LAYER_IDS.historicalMoats]: false,
  [VISUAL_LAYER_IDS.historicalRoads]: false,
  [VISUAL_LAYER_IDS.historicalCommonerAreas]: false,
  [VISUAL_LAYER_IDS.historicalSamuraiAreas]: false,
  [VISUAL_LAYER_IDS.historicalTempleAreas]: false,
  [VISUAL_LAYER_IDS.historicalCastle]: false,
  [VISUAL_LAYER_IDS.historicalPoints]: true,
};

export function isVisualLayerEnabled(id: string): boolean {
  return VISUAL_LAYER_ENABLED[id] === true;
}

/**
 * 年代UIとレイヤー構成の唯一の定義元。
 * 未導入の歴史GISレイヤーは将来の識別子だけを予約し、実データや形状は登録しない。
 */
const ERA_DEFINITIONS: EraDefinition[] = [
  {
    id: "modern",
    label: "現代",
    startYear: null,
    endYear: null,
    baseMode: "modern",
    visualLayers: [VISUAL_LAYER_IDS.modernBase],
    placeDatasetId: null,
    attributionIds: ["gsi-tiles"],
    uncertaintyNote: "",
    enabled: true,
    localizedLabels: { ja: "現代", en: "Modern" },
  },
  {
    id: "edo-late",
    label: "江戸後期",
    startYear: 1849,
    endYear: 1862,
    baseMode: "reconstructed",
    visualLayers: [
      VISUAL_LAYER_IDS.reconstructedBackground,
      VISUAL_LAYER_IDS.historicalCoastline,
      VISUAL_LAYER_IDS.historicalWater,
      VISUAL_LAYER_IDS.historicalMoats,
      VISUAL_LAYER_IDS.historicalRoads,
      VISUAL_LAYER_IDS.historicalCommonerAreas,
      VISUAL_LAYER_IDS.historicalSamuraiAreas,
      VISUAL_LAYER_IDS.historicalTempleAreas,
      VISUAL_LAYER_IDS.historicalCastle,
      VISUAL_LAYER_IDS.historicalPoints,
    ],
    placeDatasetId: "codh-edo-maps-places",
    attributionIds: ["codh-edo-maps-places"],
    uncertaintyNote:
      "江戸地名の位置は、古地図を現代地図へ位置合わせしたデータに基づく推定です。現在の歴史背景は、古地図原本や当時の道路・海岸線・敷地境界を再現したものではありません。測量・境界・権利確認には使用できません。",
    enabled: true,
    localizedLabels: { ja: "江戸後期", en: "Late Edo" },
  },
  {
    id: "edo-early",
    label: "江戸前期",
    startYear: null,
    endYear: null,
    baseMode: "historical-image",
    visualLayers: [],
    placeDatasetId: null,
    attributionIds: [],
    uncertaintyNote: "権利・位置合わせ確認済みの画像は未導入です。",
    enabled: false,
    localizedLabels: { ja: "江戸前期", en: "Early Edo" },
  },
];

export class EraRegistry {
  readonly #definitions: ReadonlyMap<string, Readonly<EraDefinition>>;

  constructor(definitions: readonly EraDefinition[] = ERA_DEFINITIONS) {
    const entries = definitions.map((definition) => {
      if (!definition.id || !definition.label) {
        throw new Error("年代定義のIDとラベルは必須です");
      }
      const cloned: EraDefinition = {
        ...definition,
        visualLayers: [...definition.visualLayers],
        attributionIds: [...definition.attributionIds],
      };
      if (definition.localizedLabels) {
        cloned.localizedLabels = { ...definition.localizedLabels };
      }
      return [
        definition.id,
        Object.freeze(cloned),
      ] as const;
    });
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("年代定義のIDが重複しています");
    }
    this.#definitions = new Map(entries);
  }

  get(id: string): Readonly<EraDefinition> | null {
    const definition = this.#definitions.get(id);
    return definition?.enabled ? definition : null;
  }

  enabled(): readonly Readonly<EraDefinition>[] {
    return [...this.#definitions.values()].filter(
      (definition) => definition.enabled,
    );
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
  registry: EraRegistry = eraRegistry,
  locale: "ja" | "en" = document.documentElement.lang.startsWith("en")
    ? "en"
    : "ja",
): void {
  const selected = select.value;
  const options = registry.enabled().map((era) => {
    const option = document.createElement("option");
    option.value = era.id;
    option.textContent = formatEraLabel(era, locale);
    return option;
  });
  select.replaceChildren(...options);
  if (registry.get(selected)) select.value = selected;
}
