import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { initializeDescriptionPriorityReviewCatalog } from "./generate.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const review = initializeDescriptionPriorityReviewCatalog(root);
console.log(`DESCRIPTION_PRIORITY_REVIEW_INIT_OK ${JSON.stringify({ reviewEntryCount: review.reviewEntries.length })}`);
