import packData from "./shiga-pack.json";
import type { RegionPack } from "./types";

export const SHIGA_REGION_ID = "shiga";
/** 公的・学術資料で根拠を確認した戦国地点だけを結び付ける滋賀地域パック。 */
export const SHIGA_REGION_PACK = packData as unknown as RegionPack;
