import type { ShigaSengokuPlace } from "./shiga-sengoku-places";
import { SHIGA_SOURCE_REGISTRY } from "./shiga-source-registry";
import presentation from "./shiga-place-presentation.json";

function addRow(dl: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement("dt"); dt.textContent = term;
  const dd = document.createElement("dd"); dd.textContent = value;
  dl.append(dt, dd);
}

export function renderShigaPlaceCard(container: HTMLElement, place: ShigaSengokuPlace, returnFocus?: HTMLElement): void {
  container.replaceChildren(); container.hidden = false;
  const heading = document.createElement("h2"); heading.textContent = place.nameJa; container.append(heading);
  const dl = document.createElement("dl");
  addRow(dl, "分類", presentation.categoryLabels[place.category]);
  addRow(dl, "市町", place.municipalityJa);
  addRow(dl, "時期", place.dateDisplayJa);
  addRow(dl, "現在地と歴史位置", presentation.locationBasisLabels[place.locationBasis]);
  addRow(dl, "史跡の状態", presentation.historicalSiteStatusLabels[place.historicalSiteStatus]);
  addRow(dl, "位置精度", presentation.coordinateConfidenceLabels[place.coordinateConfidence]);
  container.append(dl);
  const summary = document.createElement("p"); summary.textContent = place.summaryJa; container.append(summary);
  const locationNote = document.createElement("p"); locationNote.className = "card-note"; locationNote.textContent = `位置について：${place.locationNoteJa}`; container.append(locationNote);
  if (place.coordinateConfidence === "medium") {
    const warning = document.createElement("p"); warning.className = "card-note card-warning"; warning.textContent = presentation.mediumConfidenceWarning; container.append(warning);
  }
  if (place.category === "castle" || place.category === "battle") {
    const warning = document.createElement("p"); warning.className = "card-note card-warning"; warning.textContent = presentation.accessWarning; container.append(warning);
  }
  const sourceHeading = document.createElement("h3"); sourceHeading.textContent = "出典"; container.append(sourceHeading);
  const list = document.createElement("ul");
  for (const sourceId of place.sourceIds) {
    const source = SHIGA_SOURCE_REGISTRY[sourceId]; if (!source) continue;
    const item = document.createElement("li"); const link = document.createElement("a");
    link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = `${source.providerJa}「${source.titleJa}」`; item.append(link); list.append(item);
  }
  container.append(list);
  const close = document.createElement("button"); close.type = "button"; close.textContent = "閉じる"; close.setAttribute("aria-label", "滋賀・戦国地点情報を閉じる");
  close.addEventListener("click", () => { container.hidden = true; container.replaceChildren(); returnFocus?.focus(); }); container.append(close);
}

export function renderShigaNoData(container: HTMLElement, returnFocus?: HTMLElement, text = "この地点には登録された滋賀・戦国史跡データがありません。"): void {
  container.replaceChildren(); container.hidden = false;
  const message = document.createElement("p"); message.textContent = text; container.append(message);
  const close = document.createElement("button"); close.type = "button"; close.textContent = "閉じる";
  close.addEventListener("click", () => { container.hidden = true; container.replaceChildren(); returnFocus?.focus(); }); container.append(close);
}
