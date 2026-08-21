import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { buildDescriptionPriorityReviewReport } from "./generate.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const result = buildDescriptionPriorityReviewReport(root);
console.log(`DESCRIPTION_PRIORITY_REVIEW_REPORT_BUILD_OK ${JSON.stringify({ reviewState: result.summary.reviewState })}`);
