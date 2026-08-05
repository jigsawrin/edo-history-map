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

export const GSI_ADDITIONAL_SOURCE_IDS = {
  paleVmap0: "gsi-pale-low-zoom-vmap0",
  stdGebco: "gsi-std-low-zoom-gebco",
  stdJapanCoastGuard: "gsi-std-low-zoom-japan-coast-guard",
  stdVmap0: "gsi-std-low-zoom-vmap0",
} as const;

export type GsiAdditionalSourceId =
  (typeof GSI_ADDITIONAL_SOURCE_IDS)[keyof typeof GSI_ADDITIONAL_SOURCE_IDS];

export const GSI_ADDITIONAL_SOURCE_TEXTS: Readonly<
  Record<GsiAdditionalSourceId, string>
> = Object.freeze({
  [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]:
    'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.',
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebco]:
    "The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)",
  [GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard]:
    "海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）",
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]:
    'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.',
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
    href: "https://maps.gsi.go.jp/development/",
  }),
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebco]: Object.freeze({
    text: "GEBCO Digital Atlas",
    href: "https://www.gebco.net/",
  }),
  [GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard]: Object.freeze({
    text: "GSI official tile list (Japan Coast Guard permit)",
    href: "https://maps.gsi.go.jp/development/",
  }),
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]: Object.freeze({
    text: "GSI official tile list (VMAP0 shoreline source)",
    href: "https://maps.gsi.go.jp/development/",
  }),
});

/** Fixed HTML strings used only by Leaflet's attribution control. */
export const GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS: Readonly<
  Record<GsiAdditionalSourceId, string>
> = Object.freeze({
  [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]:
    '<a href="https://maps.gsi.go.jp/development/" target="_blank" rel="noopener noreferrer">GSI low-zoom VMAP0 shoreline source</a>',
  [GSI_ADDITIONAL_SOURCE_IDS.stdGebco]:
    '<a href="https://www.gebco.net/" target="_blank" rel="noopener noreferrer">GEBCO Digital Atlas bathymetric contours</a>',
  [GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard]:
    '<a href="https://maps.gsi.go.jp/development/" target="_blank" rel="noopener noreferrer">Japan Coast Guard permit (GSI low-zoom source)</a>',
  [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]:
    '<a href="https://maps.gsi.go.jp/development/" target="_blank" rel="noopener noreferrer">GSI low-zoom VMAP0 shoreline source</a>',
});

const PALE_SOURCES: readonly GsiAdditionalSource[] = Object.freeze([
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.paleVmap0,
    text: GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.paleVmap0],
  }),
]);

const STD_SOURCES: readonly GsiAdditionalSource[] = Object.freeze([
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.stdGebco,
    text: GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.stdGebco],
  }),
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard,
    text: GSI_ADDITIONAL_SOURCE_TEXTS[
      GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard
    ],
  }),
  Object.freeze({
    id: GSI_ADDITIONAL_SOURCE_IDS.stdVmap0,
    text: GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.stdVmap0],
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
