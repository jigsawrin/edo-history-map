import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { buildDescriptionPriorityCalibrationBatch1Report } from "./calibration-report.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const result = buildDescriptionPriorityCalibrationBatch1Report(root);
console.log(`DESCRIPTION_PRIORITY_CALIBRATION_REPORT_BUILD_OK ${JSON.stringify({ reviewed: result.analysis.reviewedCount, unreviewed: result.analysis.unreviewedCount })}`);
