/** Pure decision rules and fixed source strings for GSI low-zoom attribution. */

export type GsiBaseLayer = "pale" | "std";

export interface GsiAttributionState {
  readonly base: GsiBaseLayer;
  readonly zoom: number;
  readonly baseVisible: boolean;
}

export interface GsiAdditionalSource {
  readonly id: GsiAdditionalSourceId;
  readonly text: string;
}

export const GSI_LOW_ZOOM_MIN = 5;
export const GSI_LOW_ZOOM_MAX = 8;

export const GSI_VMAP0_SOURCE_TEXT =
  'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.';

export const GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT = `『The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)
海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）』`;

export const GSI_PROJECT_HISTORY_ADDITION_TEXT =
  "地理院タイルに本プロジェクトの歴史情報を追記して掲載";

export const GSI_ADDITIONAL_SOURCE_IDS = {
  paleVmap0: "gsi-pale-low-zoom-vmap0",
  stdGebcoJcg: "gsi-std-low-zoom-gebco-japan-coast-guard",
  stdVmap0: "gsi-std-low-zoom-vmap0",
} as const;

export type GsiAdditionalSourceId =
  (typeof GSI_ADDITIONAL_SOURCE_IDS)[keyof typeof GSI_ADDITIONAL_SOURCE_IDS];

export const GSI_ADDITIONAL_SOURCE_TEXTS: Readonly<
  Record<GsiAdditionalSourceId, string>
> = Object.freeze({
  [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]: GSI_VMAP0_SOURCE_TEXT,
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg]:
    GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT,
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]: GSI_VMAP0_SOURCE_TEXT,
});

export const GSI_ADDITIONAL_CONDITIONS_SECTION_ID = "gsi-low-zoom-conditions";

export const GSI_ADDITIONAL_SOURCE_LINKS: Readonly<
  Record<
    GsiAdditionalSourceId,
    Readonly<{ readonly text: string; readonly href: string }>
  >
> = Object.freeze({
  [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]: Object.freeze({
    text: "GSI official tile list (VMAP0 shoreline source)",
    href: "https://maps.gsi.go.jp/development/ichiran.html",
  }),
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg]: Object.freeze({
    text: "GSI official tile list (GEBCO and Japan Coast Guard sources)",
    href: "https://maps.gsi.go.jp/development/ichiran.html",
  }),
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]: Object.freeze({
    text: "GSI official tile list (VMAP0 shoreline source)",
    href: "https://maps.gsi.go.jp/development/ichiran.html",
  }),
});

/** Fixed short links used only as supplementary Leaflet attribution. */
export const GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS: Readonly<
  Record<GsiAdditionalSourceId, string>
> = Object.freeze({
  [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">GSI low-zoom VMAP0 shoreline source</a>',
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg]:
    '<a href="https://www.gebco.net/" target="_blank" rel="noopener noreferrer">GEBCO Digital Atlas bathymetric contours</a> · <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">Japan Coast Guard permit (GSI low-zoom source)</a>',
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">GSI low-zoom VMAP0 shoreline source</a>',
});

const PALE_SOURCES: readonly GsiAdditionalSource[] = Object.freeze([
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.paleVmap0,
    text: GSI_VMAP0_SOURCE_TEXT,
  }),
]);

const STD_SOURCES: readonly GsiAdditionalSource[] = Object.freeze([
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg,
    text: GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT,
  }),
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.stdVmap0,
    text: GSI_VMAP0_SOURCE_TEXT,
  }),
]);

export function resolveGsiAdditionalSources(
  state: GsiAttributionState,
): readonly GsiAdditionalSource[] {
  if (!state.baseVisible) return [];
  if (!Number.isFinite(state.zoom)) return [];
  if (state.zoom < GSI_LOW_ZOOM_MIN || state.zoom > GSI_LOW_ZOOM_MAX) {
    return [];
  }
  if (state.base === "pale") return PALE_SOURCES;
  if (state.base === "std") return STD_SOURCES;
  return [];
}
