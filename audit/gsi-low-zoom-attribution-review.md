# GSI low-zoom attribution review

Review date: 2026-08-06

## Official source review

The implementation was reviewed against the official [GSI tile list and source notes](https://maps.gsi.go.jp/development/) and the official [GSI tile usage/content guidance](https://maps.gsi.go.jp/development/siyou.html). The tile-list page is the authoritative GSI source for tile names, zoom ranges, attribution, and the additional source notices; the usage page documents the XYZ tile endpoint and use conditions.

The application loads the documented XYZ endpoints in real time:

- `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`

At zoom levels 5–8, the official notices are fixed as follows. The GEBCO URL has no trailing punctuation so the displayed text matches the official wording exactly.

```text
The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)
海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）
Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.
```

The pale map uses the VMAP0 shoreline notice. The standard map uses the GEBCO bathymetric-contour notice, the Japan Coast Guard permit notice, and the same VMAP0 shoreline notice. The ordinary short GSI attribution remains visible, and the live Leaflet attribution additionally uses these fixed entries when applicable:

- `GSI low-zoom VMAP0 shoreline source`
- `GEBCO Digital Atlas bathymetric contours`
- `Japan Coast Guard permit (GSI low-zoom source)`

## Conditions and boundaries

- Additional notices apply only while a visible GSI `pale` or `std` base is shown at zoom 5–8.
- At zoom 9 and above, no additional source notice is required; the dialog still retains a separate GSI conditions section whenever the GSI tile attribution is active.
- GSI tiles are fetched from the documented XYZ endpoints in real time. This project does not cache or bulk-download tiles.
- The application does not provide print or image-export functionality for GSI tiles.
- The normal GSI source/conditions are kept separate from the project's historical information provenance and licensing. Historical layers do not gain GSI low-zoom source claims.
- No tile bounds, region, historical coverage, or source identity is inferred from the map view.

## Implementation and safety review

`src/gsi-attribution.ts` contains the pure zoom/base visibility resolver, exact source strings, and fixed Leaflet attribution links. `src/attribution.ts` renders the normal GSI source, project-history separation, and the separate conditions section with safe DOM `textContent` and fixed HTTPS links. `src/style.css` wraps long live attribution text on desktop and mobile, including safe-area spacing, without horizontal overflow.

No source text comes from URL parameters, fetched data, storage, analytics, proxy, or user input. No `innerHTML`, `eval`, `new Function`, external script, font, CSS policy, tile URL, package dependency, public data, workflow, region/history data, or privacy behavior was changed. Runtime tile loading remains unchanged.

The static audit remains tracked by the prepublish audit's exact audit-path allowlist. Human browser checks still need to confirm the desktop and mobile attribution dialog/control layout before this Draft PR is made Ready; automated tests, build output, and the repository audits cover the deterministic content and public-boundary checks.
