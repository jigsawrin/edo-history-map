export function handleHistoricalBackgroundClick(
  infoCard: HTMLElement,
  hasPlaceDataset: boolean,
  showNoData: () => void,
): boolean {
  // 地名markerが先にカードを表示した場合は、同じクリックを空白扱いしない。
  if (!infoCard.hidden || !hasPlaceDataset) return false;
  showNoData();
  return true;
}
