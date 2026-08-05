# GSI low-zoom attribution review

Review date: 2026-08-05

## Official source review

The implementation was checked against the official [GSI tile list](https://maps.gsi.go.jp/development/) and the official [GSI tile usage guidance](https://maps.gsi.go.jp/development/siyou.html). The tile-list entry for the standard map (`std`) identifies the small-scale map at zoom levels 5–8 and requires these additional source notices:

- Bathymetric contours are derived from the GEBCO Digital Atlas, published by BODC on behalf of IOC and IHO (2003), with `https://www.gebco.net` as the referenced source.
- 海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）.
- Shoreline data is derived from United States National Imagery and Mapping Agency, “Vector Map Level 0 (VMAP0),” Bethesda/Denver, 1997.

The pale map (`pale`) entry identifies the same small-scale zoom range and requires the VMAP0 shoreline notice only. The regular GSI tile attribution remains present for both base layers.

## Decision rules

- `pale` and `std` are the only recognized modern base layers.
- Additional sources are returned only when the modern base is visible and zoom is 5 through 8 inclusive.
- Zoom 4 and zoom 9 or higher return no additional source. Zoom transitions therefore remove/add the fixed entries deterministically.
- A hidden or zero-opacity base (`baseVisible: false`) returns no additional source.
- Unknown base values return no additional source; they are not interpreted as `pale` or `std`.
- Source order and IDs are fixed. The resolver does not infer bounds, region, center, or historical coverage.
- Historical/reconstructed layers do not gain GSI low-zoom sources unless a visible modern GSI base is part of the current view.

## Implementation and safety review

`src/gsi-attribution.ts` contains the pure resolver and fixed source/link constants. Leaflet attribution values are fixed strings; the attribution dialog uses DOM `textContent` and fixed HTTPS links with `target="_blank"` and `rel="noopener noreferrer"`. No source text comes from URL parameters, fetched data, storage, analytics, proxy, or user input. No `innerHTML`, `eval`, `new Function`, external script, font, CSS, or CSP change was introduced.

The existing `gsi-tiles` registry entry keeps its existing meaning. Additional entries are separate IDs and are only merged into the active attribution set when the resolver says they apply. Runtime tile URLs, zoom limits, region/history data, public data, package dependencies, workflows, and privacy behavior remain unchanged.
