import type { KyotoBakumatsuPlace } from "./kyoto-bakumatsu-places";
import { KYOTO_SOURCE_REGISTRY } from "./kyoto-source-registry";
import presentation from "./kyoto-place-presentation.json";

function addRow(dl: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

export function renderKyotoPlaceCard(
  container: HTMLElement,
  place: KyotoBakumatsuPlace,
  returnFocus?: HTMLElement,
): void {
  container.replaceChildren();
  container.hidden = false;

  const heading = document.createElement("h2");
  heading.textContent = place.nameJa;
  container.append(heading);

  const dl = document.createElement("dl");
  addRow(dl, "分類", presentation.categoryLabels[place.category]);
  addRow(dl, "時期", place.dateDisplayJa);
  addRow(dl, "現在地と歴史位置", presentation.locationBasisLabels[place.locationBasis]);
  addRow(dl, "史跡の状態", presentation.historicalSiteStatusLabels[place.historicalSiteStatus]);
  addRow(
    dl,
    "位置精度",
    presentation.coordinateConfidenceLabels[place.coordinateConfidence],
  );
  container.append(dl);

  const summary = document.createElement("p");
  summary.textContent = place.summaryJa;
  container.append(summary);

  const locationNote = document.createElement("p");
  locationNote.className = "card-note";
  locationNote.textContent = `位置について：${place.locationNoteJa}`;
  container.append(locationNote);

  if (place.coordinateConfidence === "medium") {
    const confidenceNote = document.createElement("p");
    confidenceNote.className = "card-note card-warning";
    confidenceNote.textContent = presentation.mediumConfidenceWarning;
    container.append(confidenceNote);
  }

  const sourceHeading = document.createElement("h3");
  sourceHeading.textContent = "出典";
  container.append(sourceHeading);
  const sourceList = document.createElement("ul");
  for (const sourceId of place.sourceIds) {
    const source = KYOTO_SOURCE_REGISTRY[sourceId];
    if (!source) continue;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.publisher}「${source.title}」`;
    item.append(link);
    sourceList.append(item);
  }
  container.append(sourceList);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.setAttribute("aria-label", "京都・幕末地点情報を閉じる");
  close.addEventListener("click", () => {
    container.hidden = true;
    container.replaceChildren();
    returnFocus?.focus();
  });
  container.append(close);
}

export function renderKyotoNoData(
  container: HTMLElement,
  returnFocus?: HTMLElement,
  text = "この地点には登録された京都・幕末史跡データがありません。",
): void {
  container.replaceChildren();
  container.hidden = false;
  const message = document.createElement("p");
  message.textContent = text;
  container.append(message);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.addEventListener("click", () => {
    container.hidden = true;
    container.replaceChildren();
    returnFocus?.focus();
  });
  container.append(close);
}
