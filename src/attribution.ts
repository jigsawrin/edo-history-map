import { KYOTO_SOURCE_REGISTRY } from "./kyoto-source-registry";
import { SHIGA_SOURCE_DEFINITIONS } from "./shiga-source-registry";

/** 出典・ライセンス画面とプライバシー画面。DOMは安全なAPIだけで構築する。 */

interface LinkSpec {
  text: string;
  href: string;
}

interface AttributionSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  links?: readonly LinkSpec[];
}

function para(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

function linkList(items: readonly LinkSpec[]): HTMLUListElement {
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = item.text;
    li.append(a);
    ul.append(li);
  }
  return ul;
}

const ATTRIBUTION_SECTIONS: readonly AttributionSection[] = [
  {
    id: "gsi-tiles",
    title: "背景地図",
    paragraphs: [
      "背景地図には国土地理院の「地理院タイル」(標準地図・淡色地図)を使用しています。地理院タイルは出典の明示により利用できます。",
    ],
    links: [
      {
        text: "地理院タイル一覧(国土地理院)",
        href: "https://maps.gsi.go.jp/development/ichiran.html",
      },
    ],
  },
  {
    id: "codh-edo-machiya-areas",
    title: "町家領域データ",
    paragraphs: [
      "『江戸切絵図』町家領域データセット(ROIS-DS人文学オープンデータ共同利用センター(CODH)作成、doi:10.20676/00000446)を使用しています。ライセンスはCC BY 4.0です。",
      "本アプリでの加工内容: 完成版ShapefileのWGS 84座標をGeoJSONへ変換し、必要属性だけを保持、座標を小数6桁へ丸め、外周と穴の向きをGeoJSON向けに正規化しました。形状の簡略化は行っていません。丸め後に縮退したring 1件のみ除外しています。",
      "町家領域は江戸切絵図を現代地図へ位置合わせした推定ポリゴンです。正確な地籍、人口、所有権、境界、現代の用途地域を示すものではありません。",
    ],
    links: [
      {
        text: "『江戸切絵図』町家領域データセット(CODH)",
        href: "https://codh.rois.ac.jp/edo-maps/rekichizu/index.html.ja",
      },
      {
        text: "CC BY 4.0 ライセンス",
        href: "https://creativecommons.org/licenses/by/4.0/deed.ja",
      },
    ],
  },
  {
    id: "codh-edo-coastline",
    title: "江戸末期海岸線データ",
    paragraphs: [
      "『江戸末期海岸線／水域データセット』（ROIS-DS人文学オープンデータ共同利用センター作成、doi:10.20676/00000453）の海岸線データを使用しています。ライセンスはCC BY 4.0です。",
      "本アプリでの加工内容: 公式WGS 84 PolyLine Shapefileから、東京23区周辺の対象boundsと交差する元レコード3件をレコード単位で抽出し、必要属性を付与してGeoJSONへ変換、座標を小数6桁へ丸め、丸め後に完全同一となった連続点22件を除去しました。線の切断・簡略化・平滑化・補間・結合は行っていません。公式入力の空shape 2件と対象外レコードは公開データに含めていません。",
      "この海岸線は、1884～1894年の地図を主資料として現代座標へ位置合わせし、伊能大図や地理院地図等も参照して作成された約20万分の1相当の推定表示です。時期、潮位、河道変化、地図の歪み等により実際の位置・形状と異なる可能性があります。測量、境界、所有権、浸水予測、津波・高潮等の災害判断には使用できません。",
    ],
    links: [
      {
        text: "『江戸末期海岸線／水域データセット』(CODH)",
        href: "https://codh.rois.ac.jp/historical-gis/edo-coast/",
      },
      {
        text: "データ作成方法(CODH、PDF)",
        href: "https://codh.rois.ac.jp/historical-gis/edo-coast/edo-coast-method.pdf",
      },
      {
        text: "CC BY 4.0 ライセンス",
        href: "https://creativecommons.org/licenses/by/4.0/deed.ja",
      },
    ],
  },
  {
    id: "codh-edo-maps-places",
    title: "歴史地名データ",
    paragraphs: [
      "『江戸マップ地名データセット』(ROIS-DS人文学オープンデータ共同利用センター(CODH)作成、doi:10.20676/00000445)を使用しています。ライセンスはクリエイティブ・コモンズ 表示 4.0 国際(CC BY 4.0)です。",
      "本アプリでの加工内容: 原データ(CSV)から地名・分類・緯度経度・収載切絵図名・詳細ページURLの項目を抽出し、GeoJSON形式へ変換のうえ、東京23区周辺の範囲に限定しています。",
      "原資料は江戸切絵図「尾張屋版」(1849–1862年頃)です。データセットの位置情報は古地図のジオリファレンスによる推定であり、確定した測量成果ではありません。",
    ],
    links: [
      {
        text: "江戸マップ(CODH)",
        href: "https://codh.rois.ac.jp/edo-maps/",
      },
      {
        text: "CC BY 4.0 ライセンス",
        href: "https://creativecommons.org/licenses/by/4.0/deed.ja",
      },
    ],
  },
  {
    id: "project-kyoto-bakumatsu-places",
    title: "京都・幕末史跡データ",
    paragraphs: [
      "京都・幕末史跡データは、複数の公的・学術資料で歴史的事実と現在位置を確認し、本プロジェクトが地点単位で独自編集したものです。第三者のデータベース、説明原文、画像は転載していません。",
      "説明文は確認した事実を基に本プロジェクトが独自に作成しました。座標は公式ページに明示された世界測地系座標、公式住所・公式地図、または公的な史跡碑位置を根拠とし、位置精度を高・中に分類しています。現在の碑、再建建物、顕彰地が幕末当時の現場や建物と一致しない場合があります。",
      "本アプリでは京都の幕末史を扱う表示範囲として1853年から1868年を採用しています。幕末の始期・終期には複数の区分方法があります。調査日は2026年7月16日です。",
    ],
    links: Object.values(KYOTO_SOURCE_REGISTRY).map((source) => ({
      text: `${source.publisher}「${source.title}」`,
      href: source.url,
    })),
  },
  {
    id: "project-shiga-sengoku-places",
    title: "滋賀・戦国史跡データ",
    paragraphs: [
      "滋賀・戦国史跡データは、滋賀県などの公的資料と国立情報学研究所の地名情報を照合し、本プロジェクトが36地点を独自に選定・編集したものです。第三者の説明原文、画像、データベース一式は転載していません。",
      "説明文は確認した歴史的事実を基に独自作成しました。座標は公的な住所検索、現存史跡、遺跡・城域の代表位置を根拠とし、位置精度を高・中に分類しています。特に山城、古戦場、寺域は広い範囲を一点で表しています。",
      "国立情報学研究所／CODHの歴史的行政区域データセットβ版に含まれる地名座標はCC BY 4.0に基づき、出典を明示して利用しています。調査日は2026年7月17日です。",
    ],
    links: SHIGA_SOURCE_DEFINITIONS.map((source) => ({
      text: `${source.providerJa}「${source.titleJa}」`,
      href: source.url,
    })),
  },
];

export function renderAttribution(
  container: HTMLElement,
  attributionIds: readonly string[] = ATTRIBUTION_SECTIONS.map(
    (section) => section.id,
  ),
): void {
  container.replaceChildren();
  const allowed = new Set(attributionIds);
  for (const section of ATTRIBUTION_SECTIONS) {
    if (!allowed.has(section.id)) continue;
    container.append(heading(section.title));
    for (const text of section.paragraphs) container.append(para(text));
    if (section.links) container.append(linkList(section.links));
  }

  container.append(heading("和田倉御門 参考画像"));
  container.append(para("『江戸城御外郭御門絵図 第1図 和田倉御門』（東京都立中央図書館所蔵）（部分・加工）。画像の使用条件はパブリックドメインです。現代地図へ位置合わせした画像ではありません。"));
  container.append(para("原画像から外側の撮影背景、資料番号札、カラーチャート、グレースケール、定規を除く保守的な切り抜きを行いました。"));
  container.append(linkList([
    { text:"公式資料ページ（東京都立図書館）", href:"https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960" },
    { text:"公式画像利用案内（東京都立図書館）", href:"https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2" },
  ]));

  if (attributionIds.some((id) => id.startsWith("codh-"))) {
    container.append(heading("歴史背景について"));
    container.append(
      para(
        "和紙風の歴史背景は本プロジェクト独自の装飾です。古地図原本や当時の道路・河川・堀・町割りを再現した地図ではありません。史料と位置合わせに基づく推定情報は、江戸地名ポイント、町家領域、江戸末期海岸線です。",
      ),
    );
    container.append(heading("古地図画像について"));
    container.append(
      para(
        "江戸切絵図などの古地図「画像」そのものは、画像単位の利用条件の確認が完了していないため、本アプリには含めていません。権利確認済みの画像レイヤーのみ将来追加される可能性があります。",
      ),
    );
    container.append(heading("古地図原本の表現に関する注意(将来用)"));
    container.append(
      para(
        "将来、権利確認済みの古地図原本を表示する場合、当時の社会的背景を反映し、現在では不適切な名称・区分・表現が含まれる可能性があります。原本の歴史的文脈を説明する注意を併記します。",
      ),
    );
    container.append(heading("免責"));
    container.append(
      para(
        "歴史データの位置・名称・分類には誤りや推定が含まれます。「確定」情報として扱わず、学術・防災・不動産・権利関係の判断には一次資料を確認してください。",
      ),
    );
  }

  if (attributionIds.includes("project-kyoto-bakumatsu-places")) {
    container.append(heading("京都地点の利用上の注意"));
    container.append(
      para(
        "京都地点は歴史的位置の測量成果ではありません。個別カードの位置関係・位置精度・注意事項を確認し、境界、所有権、工事、防災などの判断には使用しないでください。",
      ),
    );
  }
  if (attributionIds.includes("project-shiga-sengoku-places")) {
    container.append(heading("滋賀地点の利用上の注意"));
    container.append(
      para(
        "滋賀地点は登山口、通行可能な経路、遺跡境界、戦闘範囲を示すものではありません。現地では立入規制、私有地、天候、文化財保護と公式案内を確認してください。測量、所有権、工事、防災の判断には使用できません。",
      ),
    );
  }
}

export function renderPrivacy(container: HTMLElement): void {
  container.replaceChildren();
  container.append(heading("収集しない情報"));
  container.append(
    para(
      "本アプリの運営者は、利用者の位置情報・識別子・閲覧履歴を収集・保存しません。アクセス解析、広告、トラッカー、SNS埋め込み、Cookie、localStorage は使用していません。",
    ),
  );
  container.append(heading("位置情報"));
  container.append(
    para(
      "位置情報は「現在地を表示」ボタンを押した場合にのみ、ブラウザの許可を経て1回取得します。継続的な追跡は行いません。取得した緯度・経度はブラウザのメモリ内でのみ使用し、独自サーバーへ保存せず、URL・Cookie・localStorage・ログにも書き込みません。",
    ),
  );
  container.append(heading("外部への通信"));
  container.append(
    para(
      "地図表示のため、地図タイル提供者(国土地理院)には、IPアドレスや表示地域に対応するタイル要求が送信されます。また、本アプリをホスティングする GitHub Pages(GitHub社)が、セキュリティ目的でアクセス情報(IPアドレス等)を記録する場合があります。詳細は各提供者のプライバシーポリシーをご確認ください。",
    ),
  );
  container.append(heading("利用者による管理"));
  container.append(
    para(
      "位置情報の許可は、ブラウザまたはOSの設定からいつでも取り消すことができます。許可しない場合も、地図の閲覧機能はすべて利用できます。",
    ),
  );
  container.append(heading("お問い合わせ"));
  container.append(
    para(
      "GitHub リポジトリの Issue などで利用者自身が送信した情報は、GitHub のサービス上で公開・処理されます(本アプリの動作とは別扱いです)。",
    ),
  );
}
