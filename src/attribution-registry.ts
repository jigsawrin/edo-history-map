import {
  COASTLINE_ATTRIBUTION,
  CODH_ATTRIBUTION,
  GSI_ATTRIBUTION,
  MACHIYA_ATTRIBUTION,
} from "./config";
import {
  GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS,
  GSI_ADDITIONAL_SOURCE_IDS,
  type GsiAdditionalSourceId,
} from "./gsi-attribution";

export type AttributionId =
  | "gsi-tiles"
  | GsiAdditionalSourceId
  | "codh-edo-maps-places"
  | "codh-edo-machiya-areas"
  | "codh-edo-coastline"
  | "project-kyoto-bakumatsu-places"
  | "project-shiga-sengoku-places";

export const ATTRIBUTION_REGISTRY: Readonly<Record<AttributionId, string>> =
  Object.freeze({
    "gsi-tiles": GSI_ATTRIBUTION,
    [GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]:
      GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS[GSI_ADDITIONAL_SOURCE_IDS.paleVmap0],
    [GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg]:
      GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS[
        GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg
      ],
    [GSI_ADDITIONAL_SOURCE_IDS.stdVmap0]:
      GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS[GSI_ADDITIONAL_SOURCE_IDS.stdVmap0],
    "codh-edo-maps-places": CODH_ATTRIBUTION,
    "codh-edo-machiya-areas": MACHIYA_ATTRIBUTION,
    "codh-edo-coastline": COASTLINE_ATTRIBUTION,
    "project-kyoto-bakumatsu-places":
      "京都・幕末史跡：本プロジェクト編集（各地点の出典は情報カードに表示）",
    "project-shiga-sengoku-places":
      "滋賀・戦国史跡：本プロジェクト編集（各地点の出典は情報カードに表示）",
  });

export function resolveAttributions(ids: readonly string[]): readonly string[] {
  return ids.map((id) => {
    if (!Object.hasOwn(ATTRIBUTION_REGISTRY, id)) {
      throw new Error(`未登録の出典IDです: ${id}`);
    }
    return ATTRIBUTION_REGISTRY[id as AttributionId];
  });
}
