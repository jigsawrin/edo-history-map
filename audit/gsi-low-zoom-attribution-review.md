# GSI low-zoom attribution review

Review date: 2026-08-09

## Official pages and their roles

This review uses the following five official GSI pages. Their roles are deliberately separated:

The official tile list was rechecked on 2026-08-09. The standard-map zoom 5–8 notice begins with `「` and ends with `」`; the UI constant, exact-string regression test, and this review reproduce those characters consistently.

1. [地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html) — identifies tile URLs, zoom ranges, ordinary attribution, and tile-specific third-party source notices.
2. [地理院タイルについて](https://maps.gsi.go.jp/development/siyou.html) — documents the XYZ technical specification. It is a technical reference, not the primary legal basis for this review.
3. [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) — supplies the general attribution, editing notice, third-party-rights, and applicable-law framework.
4. [出典の記載](https://www.gsi.go.jp/LAW/2930-meizi.html) — explains on-screen attribution while a result is displayed and the separate notice required when information is added or edited.
5. [国土地理院の測量成果の利用手続](https://www.gsi.go.jp/LAW/2930-index.html) — supplies the application-procedure decision framework for basic-survey results.

The application loads the documented endpoints in real time and neither stores nor redistributes the tiles. Under the official procedure guidance, this browser display is treated as an application-free use with attribution. That evaluation must be repeated if the loading, storage, output, or redistribution model changes.

- `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`

The ordinary attribution keeps the tile-list link and explicitly states `地理院タイルに本プロジェクトの歴史情報を追記して掲載`. This separates the GSI basemap from the project's independently sourced historical information and does not imply that GSI created that historical information.

## Tile-specific third-party source notices

At zoom levels 5–8, the standard map requires the following single quoted, two-line notice. The GEBCO URL is followed immediately by `)` and a newline, with no period added.

```text
「The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)
海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）」
```

Both the pale and standard maps use the same VMAP0 shoreline source text at zoom levels 5–8:

```text
Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.
```

These are third-party-rights notices carried by the official tile list. The project preserves their full text and does not reinterpret ownership or license scope. As a project policy, the UI and documentation do not state that a source is “unnecessary”; outside its applicability range the notice is simply not displayed on the map.

## On-map and dialog behavior

The dedicated map control continuously displays full source text, in deterministic order, only when applicable:

- visible pale basemap, opacity greater than zero, zoom 5–8: VMAP0 text;
- visible standard basemap, opacity greater than zero, zoom 5–8: quoted GEBCO/Japan Coast Guard text, then VMAP0 text;
- zoom 9 or higher, hidden/removed basemap, opacity zero, or unknown basemap: empty and hidden.

The short Leaflet links remain auxiliary attribution only. They do not replace the full-text control.

The attribution dialog is intentionally comprehensive and independent of current zoom, basemap, and opacity. Requesting only the GSI section includes the normal GSI attribution, the project-history addition notice, real-time/application reasoning, all standard- and pale-map conditions and full source texts, and all five official links listed above.

## Distribution and re-review boundaries

- No cache, proxy, bulk download, tile repackaging, or tile redistribution is implemented.
- No print, screenshot export, image export, or offline tile export is implemented.
- No new public data or derived catalogue is emitted.
- A change to those boundaries, the official source text, tile zoom applicability, endpoint, third-party rights, or GSI guidance requires a new legal/source review before release.

## Implementation and safety

`src/gsi-attribution.ts` holds the exact constants and pure decision rule. `src/gsi-attribution-control.ts` renders full text through `textContent`/text nodes, exposes no focusable element, has no `aria-live` zoom chatter, and disposes deterministically. `src/main.ts` updates it through the existing attribution synchronization path. `src/attribution.ts` provides the comprehensive dialog using safe DOM construction and fixed HTTPS links. `src/style.css` bounds the control on desktop and 320/375/430-pixel mobile viewports, allows internal vertical scrolling, prevents horizontal overflow, preserves high contrast and safe-area spacing, and uses no truncation or animation.

No source text comes from URL parameters, fetched data, storage, analytics, proxy, or user input. No `innerHTML`, inline event handler, `eval`, external script, external CSS, font, dependency, workflow, tile URL, public data, region/history dataset, or privacy behavior is added or changed.

The static audit remains tracked by the prepublish audit's exact audit-path allowlist. Human browser verification confirmed the full-text pale/standard transitions, zoom 9 and opacity-zero hiding, comprehensive dialog, and bounded no-horizontal-overflow layout at desktop and 320-pixel width on 2026-08-09. The PR remains Draft because this task does not authorize Ready conversion.
