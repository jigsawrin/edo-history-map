import type { KyotoBakumatsuPlace } from "./kyoto-bakumatsu-places";
import { KYOTO_SOURCE_REGISTRY } from "./kyoto-source-registry";

const CATEGORY_LABELS = Object.freeze({
  "court-politics": "朝廷・政治",
  bakufu: "幕府",
  "domain-residence": "藩邸・藩関係地",
  shinsengumi: "新選組・御陵衛士",
  incident: "事件・遭難",
  battle: "戦闘関係地",
  residence: "寓居・滞在地",
  memorial: "墓所・顕彰地",
});

const BASIS_LABELS = Object.freeze({
  "extant-site": "幕末当時から同位置に現存すると確認できる場所",
  "official-historic-marker": "公的データベースに記録された史跡碑の現在位置",
  "official-address": "公式資料に基づく現在の住所",
  "historical-area": "史料が示す歴史上のおおよその範囲",
  "memorial-location": "出来事の現場ではなく顕彰・追悼の場所",
});

const STATUS_LABELS = Object.freeze({
  extant: "現存",
  rebuilt: "再建",
  relocated: "移転",
  destroyed: "焼失・滅失",
  "marker-only": "史跡表示のみ",
  "approximate-area": "おおよその範囲",
});

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
  addRow(dl, "分類", CATEGORY_LABELS[place.category]);
  addRow(dl, "時期", place.dateDisplayJa);
  addRow(dl, "現在地と歴史位置", BASIS_LABELS[place.locationBasis]);
  addRow(dl, "史跡の状態", STATUS_LABELS[place.historicalSiteStatus]);
  addRow(
    dl,
    "位置精度",
    place.coordinateConfidence === "high" ? "高" : "中",
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
    confidenceNote.textContent =
      "位置精度は中です。表示点は公的資料に記録された碑・住所・範囲の代表点で、幕末当時の一点と一致するとは限りません。";
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
): void {
  container.replaceChildren();
  container.hidden = false;
  const message = document.createElement("p");
  message.textContent =
    "この地点には登録された京都・幕末史跡データがありません。";
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
