import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  convertHistoricalCoastlineShapefile,
} from "../scripts/convert-historical-coastline.mjs";

const PRJ = Buffer.from('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]');
const CPG = Buffer.from("UTF-8");

function makeDbf(dataName = "coastline", objectId = "1929"): Buffer {
  const headerLength = 97;
  const recordLength = 21;
  const dbf = Buffer.alloc(headerLength + recordLength + 1, 0x20);
  dbf[0] = 3;
  dbf.writeUInt32LE(1, 4);
  dbf.writeUInt16LE(headerLength, 8);
  dbf.writeUInt16LE(recordLength, 10);
  const fields = [["data_name", 32], ["object_id", 64]] as const;
  for (const [name, offset] of fields) {
    dbf.fill(0, offset, offset + 32);
    dbf.write(name, offset, "ascii");
    dbf[offset + 11] = "C".charCodeAt(0);
    dbf[offset + 16] = 10;
  }
  dbf[96] = 0x0d;
  dbf[headerLength] = 0x20;
  dbf.write(dataName.padEnd(10), headerLength + 1, "utf8");
  dbf.write(objectId.padEnd(10), headerLength + 11, "utf8");
  dbf[dbf.length - 1] = 0x1a;
  return dbf;
}

function makeShp(lines: number[][][], shapeType = 3): Buffer {
  if (shapeType === 0) {
    const shp = Buffer.alloc(112);
    shp.writeInt32BE(9994, 0); shp.writeInt32BE(56, 24); shp.writeInt32LE(1000, 28); shp.writeInt32LE(3, 32);
    shp.writeInt32BE(1, 100); shp.writeInt32BE(2, 104); shp.writeInt32LE(0, 108);
    return shp;
  }
  const points = lines.flat();
  const contentBytes = 44 + lines.length * 4 + points.length * 16;
  const shp = Buffer.alloc(108 + contentBytes);
  const xs = points.map((point) => point[0] ?? 0);
  const ys = points.map((point) => point[1] ?? 0);
  const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE(shp.length / 2, 24);
  shp.writeInt32LE(1000, 28);
  shp.writeInt32LE(3, 32);
  bounds.forEach((value, index) => shp.writeDoubleLE(value, 36 + index * 8));
  shp.writeInt32BE(1, 100);
  shp.writeInt32BE(contentBytes / 2, 104);
  shp.writeInt32LE(shapeType, 108);
  bounds.forEach((value, index) => shp.writeDoubleLE(value, 112 + index * 8));
  shp.writeInt32LE(lines.length, 144);
  shp.writeInt32LE(points.length, 148);
  let count = 0;
  lines.forEach((line, index) => { shp.writeInt32LE(count, 152 + index * 4); count += line.length; });
  const pointOffset = 152 + lines.length * 4;
  points.forEach(([x, y], index) => {
    shp.writeDoubleLE(x ?? 0, pointOffset + index * 16);
    shp.writeDoubleLE(y ?? 0, pointOffset + index * 16 + 8);
  });
  return shp;
}

function convert(lines: number[][][], options: { prj?: Buffer; dbf?: Buffer; shapeType?: number } = {}) {
  return convertHistoricalCoastlineShapefile({
    shp: makeShp(lines, options.shapeType),
    dbf: options.dbf ?? makeDbf(),
    prj: options.prj ?? PRJ,
    cpg: CPG,
  });
}

describe("江戸末期海岸線変換", () => {
  const line = [[139.7, 35.6], [139.8, 35.7], [139.9, 35.8]];

  it("正常なLineStringを安定したGeoJSONへ変換する", () => {
    const first = convert([line]);
    const second = convert([line]);
    expect(JSON.parse(first.geojson).features[0].geometry.type).toBe("LineString");
    expect(first.geojson).toBe(second.geojson);
    expect(first.stats.outputSha256).toBe(createHash("sha256").update(first.geojson).digest("hex"));
  });

  it("公式形式に存在する複数partをMultiLineStringとして保持する", () => {
    const result = convert([line, [[139.75, 35.65], [139.76, 35.66]]]);
    expect(JSON.parse(result.geojson).features[0].geometry.type).toBe("MultiLineString");
  });

  it.each([
    ["Polygon等の未許可Shape Type", () => convert([line], { shapeType: 5 })],
    ["CRS不一致", () => convert([line], { prj: Buffer.from("EPSG:3857") })],
    ["NaN", () => convert([[[Number.NaN, 35.6], [139.8, 35.7]]])],
    ["Infinity", () => convert([[[Number.POSITIVE_INFINITY, 35.6], [139.8, 35.7]]])],
    ["bounds外", () => convert([[[130, 30], [131, 31]]])],
    ["空geometry", () => convert([], { shapeType: 0 })],
    ["1点LineString", () => convert([[[139.7, 35.6]]])],
    ["連続重複座標", () => convert([[[139.7, 35.6], [139.7, 35.6]]])],
    ["制御文字属性", () => convert([line], { dbf: makeDbf("coast\u0001line") })],
  ])("%sを拒否する", (_label, action) => {
    expect(action).toThrow();
  });
});
