import type { PlaceFeature } from "./validate";

/**
 * 歴史情報カードの描画。
 * すべてのデータ由来文字列は textContent で挿入する(innerHTML 不使用)。
 */

function addRow(dl: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

export function renderPlaceCard(
  container: HTMLElement,
  place: PlaceFeature,
  returnFocus?: HTMLElement,
): void {
  container.replaceChildren();
  container.hidden = false;

  const heading = document.createElement("h2");
  heading.textContent = place.name;
  container.append(heading);

  const dl = document.createElement("dl");
  if (place.category) addRow(dl, "分類", place.category);
  if (place.sheet) addRow(dl, "収載切絵図", place.sheet);
  addRow(dl, "対象年代", "江戸後期(嘉永〜文久、1849–1862年頃)");
  addRow(dl, "位置の確度", "推定(ジオリファレンスによる推定位置)");
  addRow(
    dl,
    "出典",
    "江戸マップ地名データセット(ROIS-DS人文学オープンデータ共同利用センター作成)CC BY 4.0",
  );
  container.append(dl);

  if (place.sourceUrl) {
    const p = document.createElement("p");
    const a = document.createElement("a");
    a.href = place.sourceUrl; // sanitizeLinkUrl 検証済み(https + 許可ドメインのみ)
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "CODH の地名詳細ページを開く(外部サイト)";
    p.append(a);
    container.append(p);
  }

  const note = document.createElement("p");
  note.className = "card-note";
  note.textContent =
    "位置は現代地図への推定合わせで、数十メートル以上の誤差を含み得ます。測量・境界・権利関係の証拠には使用できません。";
  container.append(note);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.setAttribute("aria-label", "地点情報を閉じる");
  close.addEventListener("click", () => {
    container.hidden = true;
    container.replaceChildren();
    returnFocus?.focus();
  });
  container.append(close);
}

/** データがない地点向けの表示。 */
export function renderNoData(
  container: HTMLElement,
  returnFocus?: HTMLElement,
): void {
  container.replaceChildren();
  container.hidden = false;
  const p = document.createElement("p");
  p.textContent =
    "この地点には登録された歴史地名データがありません。江戸切絵図の収録範囲(江戸市中)外の可能性があります。";
  container.append(p);
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
