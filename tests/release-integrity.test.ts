import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

describe("今回変更しない公開データの固定SHA", () => {
  it.each([
    ["public/data/edo-places.geojson", "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4"],
    ["public/data/edo-machiya-areas.geojson", "516fead3b082499ab1fb9d3c50060fc88812531530e9f86f63bcffff81a70bd6"],
    ["public/data/edo-coastlines.geojson", "c67be67ed6213021a7333774300bc196a52195894130f7670ede45e9a2124a31"],
    ["public/data/kyoto-bakumatsu-places.geojson", "d141eb046d34c2c16b49286d3a70de49ea06f79e59561ae20537cd934e06f4d6"],
    ["public/data/shiga-sengoku-places.geojson", "0467e166fdd7ff58bcc9ada8366068fe6e877edfc6af508df65ac7b355c26fb9"],
  ])("%sを変更しない", (path, expected) => { expect(sha256(path)).toBe(expected); });

  it("21テーマ・87関係と35年表・42地点・62テーマ関係の入力SHAを変更しない", () => {
    expect(sha256("data-curation/historical-themes.json")).toBe("b541a2627dd7cedbf0963ff45085418c559a12887b80b38042d83455fd79989d");
    expect(sha256("data-curation/historical-timeline.json")).toBe("976c49cdbdeda4d776f22259f95d3e6940d4e742b3f6c377b1cbfbaf7867b444");
  });
});
