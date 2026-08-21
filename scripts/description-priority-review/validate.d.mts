/* eslint-disable @typescript-eslint/no-explicit-any */
export const DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH: string;
export const DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH: string;
export const DESCRIPTION_PRIORITY_REVIEW_SCHEMA_VERSION: number;
export const FROZEN_DESCRIPTION_PRIORITY_SHA256: string;
export const REVIEW_STATES: readonly string[];
export const REVIEW_CLASSIFICATIONS: readonly string[];
export const HUMAN_PRIORITIES: readonly string[];
export const HUMAN_REASON_CODES: readonly string[];
export function descriptionPriorityReviewIdentityKey(identity: any): string;
export function validateDescriptionPriorityReviewCatalog(value: any, priorityCatalog: any, sourceGeoJson: any): any;
