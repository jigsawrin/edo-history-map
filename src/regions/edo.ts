import packData from "./edo-pack.json";
import type { RegionPack } from "./types";

export const EDO_REGION_ID = "edo";

/** 監査可能なJSON manifestを型付き地域パックとして公開する。 */
export const EDO_REGION_PACK = packData as unknown as RegionPack;
