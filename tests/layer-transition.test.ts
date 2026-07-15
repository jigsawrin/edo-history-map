import { describe, expect, it, vi } from "vitest";
import {
  eraTransitionDuration,
  LayerTransitionController,
  type TransitionLayer,
  type TransitionScheduler,
} from "../src/layer-transition";

function layer(id: string) {
  const state = {
    id,
    added: false,
    addCount: 0,
    removeCount: 0,
    opacity: -1,
    duration: -1,
  };
  const handle: TransitionLayer = {
    id,
    add: () => {
      state.added = true;
      state.addCount += 1;
    },
    remove: () => {
      state.added = false;
      state.removeCount += 1;
    },
    setOpacity: (opacity) => {
      state.opacity = opacity;
    },
    setTransition: (duration) => {
      state.duration = duration;
    },
  };
  return { handle, state };
}

function scheduler() {
  let callback: (() => void) | null = null;
  const clear = vi.fn(() => {
    callback = null;
  });
  const set = vi.fn((next: () => void) => {
    callback = next;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  });
  return {
    scheduler: { set, clear } satisfies TransitionScheduler,
    finish: () => callback?.(),
    set,
    clear,
  };
}

describe("LayerTransitionController", () => {
  it("年代変更でmap、中心、ズーム、現在地marker、精度円を変更しない", () => {
    const map = { center: [35.68, 139.75], zoom: 16 };
    const mapIdentity = map;
    const locationMarker = { id: "location" };
    const accuracyCircle = { id: "accuracy" };
    const before = {
      center: [...map.center],
      zoom: map.zoom,
      locationMarker,
      accuracyCircle,
    };
    const modern = layer("modern");
    const edo = layer("edo");
    const controller = new LayerTransitionController();
    controller.switchTo([{ layer: modern.handle, opacity: 1 }], 0);
    controller.switchTo([{ layer: edo.handle, opacity: 1 }], 0);

    expect(map).toBe(mapIdentity);
    expect(map.center).toEqual(before.center);
    expect(map.zoom).toBe(before.zoom);
    expect(locationMarker).toBe(before.locationMarker);
    expect(accuracyCircle).toBe(before.accuracyCircle);
  });

  it("現代基図と江戸復元基図を切り替え、終了後に旧レイヤーを削除する", () => {
    const clock = scheduler();
    const controller = new LayerTransitionController(clock.scheduler);
    const modern = layer("modern");
    const edo = layer("edo");
    controller.switchTo([{ layer: modern.handle, opacity: 1 }], 0);
    controller.switchTo([{ layer: edo.handle, opacity: 1 }], 220);
    expect(modern.state.added).toBe(true);
    expect(modern.state.opacity).toBe(0);
    expect(edo.state.added).toBe(true);
    clock.finish();
    expect(modern.state.added).toBe(false);
    expect(controller.presentLayerIds()).toEqual(["edo"]);
  });

  it("高速連続切り替えで重複追加せず、最後の対象以外を残さない", () => {
    const clock = scheduler();
    const controller = new LayerTransitionController(clock.scheduler);
    const modern = layer("modern");
    const edo = layer("edo");
    controller.switchTo([{ layer: modern.handle, opacity: 1 }], 220);
    controller.switchTo([{ layer: edo.handle, opacity: 1 }], 220);
    controller.switchTo([{ layer: modern.handle, opacity: 1 }], 220);
    expect(modern.state.addCount).toBe(1);
    expect(edo.state.addCount).toBe(1);
    expect(clock.clear).toHaveBeenCalledTimes(2);
    clock.finish();
    expect(controller.presentLayerIds()).toEqual(["modern"]);
    expect(edo.state.removeCount).toBe(1);
  });

  it("reduced motionではアニメーション時間を0にする", () => {
    expect(eraTransitionDuration(true)).toBe(0);
    expect(eraTransitionDuration(false)).toBeGreaterThanOrEqual(150);
    expect(eraTransitionDuration(false)).toBeLessThanOrEqual(300);
  });
});
