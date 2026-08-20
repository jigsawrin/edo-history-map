import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { EDO_SOURCE_DATA_PATH, EDO_SOURCE_SHA256 } from "../edo-place-curation-candidates.mjs";
import { generateDescriptionPriorityCatalog, loadDescriptionPriorityInputs } from "./generate.mjs";
import {
  canonicalDescriptionPriorityCatalogSha256,
  DESCRIPTION_PRIORITY_CATALOG_PATH,
  validateDescriptionPriorityCatalog,
} from "./validate.mjs";

const UNIQUE_PRIVATE_MARKERS = Object.freeze([
  "private-workflow-triage",
  "human-investigation-order-only",
  "description-priority-candidates.json",
]);
const PRIORITY_SCHEMA_SIGNATURE = Object.freeze([
  '"selectionContract"',
  '"suggestedTier"',
  '"reasonCodes"',
  '"contributions"',
]);

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...filesBelow(path));
    else files.push(path);
  }
  return files;
}

export function auditDescriptionPriorityPrivateLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const path of filesBelow(resolve(root, area))) {
      const rel = relative(root, path).replaceAll("\\", "/");
      const name = rel.split("/").at(-1);
      if (name === DESCRIPTION_PRIORITY_CATALOG_PATH.split("/").at(-1)) errors.push(`private description priority catalog leaked to ${rel}`);
      if (/\.(?:html|js|css|json|txt|xml|svg)$/iu.test(name ?? "")) {
        const content = readFileSync(path, "utf8");
        for (const marker of UNIQUE_PRIVATE_MARKERS) {
          if (content.includes(marker)) errors.push(`private description priority marker ${marker} leaked to ${rel}`);
        }
        if (PRIORITY_SCHEMA_SIGNATURE.every((marker) => content.includes(marker))) {
          errors.push(`private description priority schema structure leaked to ${rel}`);
        }
      }
    }
  }
  for (const path of filesBelow(resolve(root, "src"))) {
    if (!/\.(?:ts|mts|mjs|js|json)$/iu.test(path)) continue;
    const rel = relative(root, path).replaceAll("\\", "/");
    const content = readFileSync(path, "utf8");
    if (content.includes("description-priority-candidates") || content.includes("scripts/description-priority")) {
      errors.push(`runtime source imports or embeds private description priority data in ${rel}`);
    }
  }
  return errors;
}

export function summarizeDescriptionPriorityCatalog(catalog) {
  return Object.freeze({
    candidateCount: catalog.candidates.length,
    tierDistribution: Object.freeze(Object.fromEntries(["A", "B", "C", "D"].map((tier) => [tier, catalog.candidates.filter((candidate) => candidate.suggestedTier === tier).length]))),
    categoryDistribution: Object.freeze(Object.fromEntries([...new Set(catalog.candidates.map((candidate) => candidate.category))].map((category) => [category, catalog.candidates.filter((candidate) => candidate.category === category).length]))),
    canonicalOutputSha256: canonicalDescriptionPriorityCatalogSha256(catalog),
  });
}

export function auditDescriptionPriorityRepository(root = resolve(fileURLToPath(new URL("../..", import.meta.url)))) {
  const errors = [];
  try {
    const sourceBytes = readFileSync(resolve(root, EDO_SOURCE_DATA_PATH));
    if (createHash("sha256").update(sourceBytes).digest("hex") !== EDO_SOURCE_SHA256) errors.push("protected Edo source SHA-256 changed");
    const source = JSON.parse(sourceBytes.toString("utf8"));
    const stored = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), "utf8"));
    validateDescriptionPriorityCatalog(stored, source);
    const expected = generateDescriptionPriorityCatalog(loadDescriptionPriorityInputs(root));
    if (JSON.stringify(stored) !== JSON.stringify(expected)) errors.push("description priority catalog is not deterministic or current");
    errors.push(...auditDescriptionPriorityPrivateLeakage(root));
    return { errors, catalog: stored, summary: summarizeDescriptionPriorityCatalog(stored) };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, catalog: null, summary: null };
  }
}

function runCli() {
  const audit = auditDescriptionPriorityRepository();
  if (audit.errors.length > 0) {
    for (const error of audit.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`DESCRIPTION_PRIORITY_AUDIT_OK ${JSON.stringify(audit.summary)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
