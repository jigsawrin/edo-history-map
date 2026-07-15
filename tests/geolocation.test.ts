import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCurrentLocation,
  isGeolocationSupported,
} from "../src/geolocation";

/** テスト用のダミー座標(皇居前広場付近の公共地点。実在の個人の現在地ではない)。 */
const DUMMY_LAT = 35.6825;
const DUMMY_LON = 139.7574;

function mockGeolocation(
  impl: (
    success: PositionCallback,
    error: PositionErrorCallback,
  ) => void,
): void {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn(impl),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getCurrentLocation", () => {
  it("位置情報 API 非対応の場合 unsupported を返す", async () => {
    vi.stubGlobal("navigator", {});
    expect(isGeolocationSupported()).toBe(false);
    const outcome = await getCurrentLocation();
    expect(outcome.status).toBe("unsupported");
  });

  it("取得成功時に座標を返す", async () => {
    mockGeolocation((success) => {
      success({
        coords: {
          latitude: DUMMY_LAT,
          longitude: DUMMY_LON,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    });
    const outcome = await getCurrentLocation();
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.position.lat).toBeCloseTo(DUMMY_LAT);
      expect(outcome.position.lon).toBeCloseTo(DUMMY_LON);
    }
  });

  it("許可拒否時に denied を返す(座標は含まれない)", async () => {
    mockGeolocation((_success, error) => {
      error({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });
    const outcome = await getCurrentLocation();
    expect(outcome.status).toBe("denied");
    expect("position" in outcome).toBe(false);
  });

  it("取得失敗時に unavailable を返す", async () => {
    mockGeolocation((_success, error) => {
      error({
        code: 2,
        message: "unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });
    const outcome = await getCurrentLocation();
    expect(outcome.status).toBe("unavailable");
  });

  it("watchPosition(継続追跡)を呼ばない", async () => {
    const watch = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: {
              latitude: DUMMY_LAT,
              longitude: DUMMY_LON,
              accuracy: 25,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          } as GeolocationPosition),
        ),
        watchPosition: watch,
      },
    });
    await getCurrentLocation();
    expect(watch).not.toHaveBeenCalled();
  });

  it("座標を console へ出力しない", async () => {
    const logSpy = vi.spyOn(console, "log");
    const infoSpy = vi.spyOn(console, "info");
    const warnSpy = vi.spyOn(console, "warn");
    const errorSpy = vi.spyOn(console, "error");
    mockGeolocation((success) => {
      success({
        coords: {
          latitude: DUMMY_LAT,
          longitude: DUMMY_LON,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    });
    await getCurrentLocation();
    const allCalls = [logSpy, infoSpy, warnSpy, errorSpy].flatMap((s) =>
      s.mock.calls.flat().map(String),
    );
    for (const line of allCalls) {
      expect(line).not.toContain(String(DUMMY_LAT));
      expect(line).not.toContain(String(DUMMY_LON));
    }
  });

  it("座標を localStorage / sessionStorage へ保存しない", async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockGeolocation((success) => {
      success({
        coords: {
          latitude: DUMMY_LAT,
          longitude: DUMMY_LON,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    });
    await getCurrentLocation();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("座標が URL へ追加されない", async () => {
    const before = window.location.href;
    mockGeolocation((success) => {
      success({
        coords: {
          latitude: DUMMY_LAT,
          longitude: DUMMY_LON,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    });
    await getCurrentLocation();
    expect(window.location.href).toBe(before);
    expect(window.location.href).not.toContain(String(DUMMY_LAT));
  });
});
