import type { HistoricalViewMode } from "./eras";

export type { HistoricalViewMode } from "./eras";

export function defaultMachiyaVisibilityForView(
  view: HistoricalViewMode,
): boolean {
  return view !== "points";
}

export function shouldShowMachiyaArea(options: {
  isHistorical: boolean;
  layerAvailable: boolean;
  registryEnabled: boolean;
  selected: boolean;
}): boolean {
  return (
    options.isHistorical &&
    options.layerAvailable &&
    options.registryEnabled &&
    options.selected
  );
}
