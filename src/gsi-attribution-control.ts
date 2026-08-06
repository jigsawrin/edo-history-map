import L from "leaflet";
import type { GsiAdditionalSource } from "./gsi-attribution";

export interface GsiAttributionControlView {
  readonly element: HTMLElement;
  update(sources: readonly GsiAdditionalSource[]): void;
  dispose(): void;
}

export type GsiAttributionControl = GsiAttributionControlView;

export function createGsiAttributionControlView(): GsiAttributionControlView {
  const element = document.createElement("section");
  element.className = "leaflet-control gsi-source-control";
  element.setAttribute("role", "note");
  element.setAttribute("aria-label", "地理院タイルの追加出所");
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  let disposed = false;

  function hide(): void {
    element.replaceChildren();
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
  }

  return {
    element,
    update(sources): void {
      if (disposed) return;
      hide();
      if (sources.length === 0) return;

      const heading = document.createElement("strong");
      heading.textContent = "地理院タイル追加出所（ズーム5〜8）";
      element.append(heading);
      for (const source of sources) {
        const paragraph = document.createElement("p");
        paragraph.textContent = source.text;
        element.append(paragraph);
      }
      element.hidden = false;
      element.setAttribute("aria-hidden", "false");
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hide();
      element.remove();
    },
  };
}

export function createGsiAttributionControl(map: L.Map): GsiAttributionControl {
  const view = createGsiAttributionControlView();
  const leafletControl = new L.Control({ position: "topright" });
  leafletControl.onAdd = () => {
    L.DomEvent.disableClickPropagation(view.element);
    L.DomEvent.disableScrollPropagation(view.element);
    return view.element;
  };
  leafletControl.addTo(map);
  let disposed = false;

  return {
    element: view.element,
    update(sources): void {
      if (!disposed) view.update(sources);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      view.dispose();
      leafletControl.remove();
    },
  };
}
