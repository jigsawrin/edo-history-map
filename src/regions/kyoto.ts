import packData from "./kyoto-pack.json";
import type { RegionPack } from "./types";

export const KYOTO_REGION_ID = "kyoto";

/** 根拠確認済みの幕末地点だけを結び付ける京都地域パック。 */
export const KYOTO_REGION_PACK = packData as unknown as RegionPack;
