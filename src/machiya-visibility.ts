export type HistoricalViewMode = "reconstructed" | "compare" | "points";

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
