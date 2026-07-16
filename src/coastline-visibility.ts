import type { HistoricalViewMode } from "./machiya-visibility";

export function defaultCoastlineVisibilityForView(view: HistoricalViewMode): boolean {
  return view !== "points";
}

export function shouldShowCoastline(options: {
  isHistorical: boolean;
  layerAvailable: boolean;
  registryEnabled: boolean;
  selected: boolean;
}): boolean {
  return options.isHistorical && options.layerAvailable && options.registryEnabled && options.selected;
}
