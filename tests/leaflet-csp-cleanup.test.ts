import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

describe("Leaflet tile cleanup under the production CSP", () => {
  it("allows Leaflet's embedded cleanup image without external connections", () => {
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    const audit = readFileSync(
      join(root, "scripts", "prepublish-audit.mjs"),
      "utf8",
    );

    expect(vite).toContain('"connect-src \'self\' data:"');
    expect(vite).not.toMatch(/connect-src[^"\n]*https?:/);
    expect(audit).toContain("viteConnectSources.length !== 2");
    expect(audit).toContain('viteConnectSources[1] !== "data:"');
    expect(audit).toContain("connectSources.length !== 2");
    expect(audit).toContain('connectSources[1] !== "data:"');
  });
});
