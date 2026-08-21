import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { DESCRIPTION_PRIORITY_CATALOG_PATH } from "../description-priority/validate.mjs";
import { EDO_SOURCE_DATA_PATH } from "../edo-place-curation-candidates.mjs";
import { renderDescriptionPriorityReviewReport, summarizeDescriptionPriorityReview } from "./generate.mjs";
import {
  DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH,
  DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH,
  validateDescriptionPriorityReviewCatalog,
} from "./validate.mjs";

const PRIVATE_MARKERS = ["private-description-priority-human-review", "human-calibration-only", "description-priority-review.json"];
const REVIEW_SCHEMA_SIGNATURE = ["\"prioritySnapshot\"", "\"reviewState\"", "\"humanPriority\"", "\"humanReasonCodes\""];

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

export function auditDescriptionPriorityReviewPrivateLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const path of filesBelow(resolve(root, area))) {
      const rel = relative(root, path).replaceAll("\\", "/");
      const name = rel.split("/").at(-1);
      if ([DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH, DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH].some((privatePath) => privatePath.split("/").at(-1) === name)) errors.push(`private Description Priority review file leaked to ${rel}`);
      if (!/\.(?:html|js|css|json|txt|xml|svg)$/iu.test(path)) continue;
      const content = readFileSync(path, "utf8");
      if (PRIVATE_MARKERS.some((marker) => content.includes(marker))) errors.push(`private Description Priority review marker leaked to ${rel}`);
      if (REVIEW_SCHEMA_SIGNATURE.every((marker) => content.includes(marker))) errors.push(`private Description Priority review schema leaked to ${rel}`);
    }
  }
  for (const path of filesBelow(resolve(root, "src"))) {
    if (!/\.(?:ts|mts|mjs|js|json)$/iu.test(path)) continue;
    const rel = relative(root, path).replaceAll("\\", "/");
    const content = readFileSync(path, "utf8");
    if (content.includes("description-priority-review") || content.includes("scripts/description-priority-review")) errors.push(`runtime source imports or embeds private Description Priority review data in ${rel}`);
  }
  return errors;
}

export function auditDescriptionPriorityReviewRepository(root = resolve(fileURLToPath(new URL("../..", import.meta.url)))) {
  const errors = [];
  try {
    const source = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
    const priority = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), "utf8"));
    const review = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH), "utf8"));
    validateDescriptionPriorityReviewCatalog(review, priority, source);
    const expectedReport = renderDescriptionPriorityReviewReport(review, priority);
    if (readFileSync(resolve(root, DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH), "utf8") !== expectedReport) errors.push("Description Priority review report is not deterministic or current");
    errors.push(...auditDescriptionPriorityReviewPrivateLeakage(root));
    return { errors, review, summary: summarizeDescriptionPriorityReview(review) };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, review: null, summary: null };
  }
}

function runCli() {
  const audit = auditDescriptionPriorityReviewRepository();
  if (audit.errors.length > 0) {
    for (const error of audit.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`DESCRIPTION_PRIORITY_REVIEW_AUDIT_OK ${JSON.stringify(audit.summary)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
