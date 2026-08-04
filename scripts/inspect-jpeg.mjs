import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function readExifOrientation(segment) {
  if (segment.length < 14 || segment.subarray(0, 6).toString("binary") !== "Exif\0\0") return null;
  const offset = 6; const little = segment.toString("ascii", offset, offset + 2) === "II";
  const u16 = (at) => little ? segment.readUInt16LE(at) : segment.readUInt16BE(at);
  const u32 = (at) => little ? segment.readUInt32LE(at) : segment.readUInt32BE(at);
  if (u16(offset + 2) !== 42) return null;
  const ifd = offset + u32(offset + 4); if (ifd + 2 > segment.length) return null;
  const count = u16(ifd);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12; if (entry + 12 > segment.length) return null;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return null;
}

export function inspectJpeg(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("JPEG SOI magic bytesがありません");
  let offset = 2; let frame = null; let jfif = null; let exif = false; let xmp = false; let iccChunks = 0; let adobeTransform = null;
  const markers = ["SOI"];
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9) { markers.push("EOI"); break; }
    if (marker === 0xda) { markers.push("SOS"); break; }
    if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) continue;
    if (offset + 2 > buffer.length) throw new Error("JPEG marker lengthが欠損しています");
    const length = buffer.readUInt16BE(offset); if (length < 2 || offset + length > buffer.length) throw new Error("JPEG markerが範囲外です");
    const segment = buffer.subarray(offset + 2, offset + length);
    const name = marker >= 0xe0 && marker <= 0xef ? `APP${marker - 0xe0}` : `0x${marker.toString(16).padStart(2, "0")}`;
    markers.push(name);
    if (marker === 0xe0 && segment.subarray(0, 5).toString("binary") === "JFIF\0") jfif = { version: `${segment[5]}.${String(segment[6]).padStart(2, "0")}`, densityUnits: segment[7], xDensity: segment.readUInt16BE(8), yDensity: segment.readUInt16BE(10), thumbnailWidth: segment[12], thumbnailHeight: segment[13] };
    if (marker === 0xe1) { const identifier = segment.subarray(0, 40).toString("binary"); if (identifier.startsWith("Exif\0\0")) exif = true; if (identifier.startsWith(["http", "://ns.adobe.com/xap/1.0/\0"].join(""))) xmp = true; }
    if (marker === 0xe2 && segment.subarray(0, 12).toString("binary") === "ICC_PROFILE\0") iccChunks += 1;
    if (marker === 0xee && segment.subarray(0, 5).toString("ascii") === "Adobe") adobeTransform = segment[11] ?? null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) frame = { type: marker === 0xc2 ? "progressive" : "baseline", precision: segment[0], height: segment.readUInt16BE(1), width: segment.readUInt16BE(3), components: segment[5] };
    offset += length;
  }
  if (!frame) throw new Error("JPEG SOF markerがありません");
  const orientation = (() => { let at = 2; while (at + 4 < buffer.length) { if (buffer[at] !== 0xff) { at += 1; continue; } const marker = buffer[at + 1]; if (marker === 0xd9 || marker === 0xda) break; const length = buffer.readUInt16BE(at + 2); if (marker === 0xe1) { const value = readExifOrientation(buffer.subarray(at + 4, at + 2 + length)); if (value !== null) return value; } at += 2 + length; } return null; })();
  return Object.freeze({ path: resolve(path), mime: "image/jpeg", bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), magicBytes: buffer.subarray(0, 3).toString("hex"), ...frame, colorSpace: frame.components === 3 && jfif ? "YCbCr (JFIF, inferred)" : frame.components === 3 ? "three-component JPEG" : `${frame.components}-component JPEG`, jfif, exif, exifOrientation: orientation, xmp, iccProfile: iccChunks > 0, iccChunks, adobeTransform, embeddedThumbnail: Boolean(jfif?.thumbnailWidth && jfif?.thumbnailHeight), markers: Object.freeze(markers) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const path = process.argv[2]; if (!path) throw new Error("JPEG pathを指定してください");
  console.log(JSON.stringify(inspectJpeg(path), null, 2));
}
