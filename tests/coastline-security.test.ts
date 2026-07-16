import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCoastlinesGeoJson } from "../src/coastlines";

const ROOT = join(__dirname, "..");

describe("江戸末期海岸線の権利・公開ゲート", () => {
  it("approved台帳のSHA-256と実データ構造が一致する", () => {
    const buffer = readFileSync(join(ROOT, "public", "data", "edo-coastlines.geojson"));
    const hash = createHash("sha256").update(buffer).digest("hex");
    const ledger = readFileSync(join(ROOT, "DATA_SOURCES.yml"), "utf8");
    expect(hash).toBe("c67be67ed6213021a7333774300bc196a52195894130f7670ede45e9a2124a31");
    expect(ledger).toContain(`converted_sha256: ${hash}`);
    const data = parseCoastlinesGeoJson(buffer.toString("utf8"));
    expect(data.features).toHaveLength(3);
    expect(new Set(data.features.map((feature) => feature.geometry.type))).toEqual(new Set(["LineString"]));
  });
});
