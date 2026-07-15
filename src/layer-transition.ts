export interface TransitionLayer {
  readonly id: string;
  add(): void;
  remove(): void;
  setOpacity(opacity: number): void;
  setTransition(durationMs: number): void;
}

export interface LayerTarget {
  layer: TransitionLayer;
  opacity: number;
}

export interface TransitionScheduler {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}

const defaultScheduler: TransitionScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer),
};

export function eraTransitionDuration(
  prefersReducedMotion: boolean,
  normalDurationMs = 220,
): number {
  return prefersReducedMotion ? 0 : normalDurationMs;
}

/** 高速な連続変更でも、最後の切替に不要なレイヤーを1本のタイマーで回収する。 */
export class LayerTransitionController {
  readonly #present = new Map<string, TransitionLayer>();
  readonly #scheduler: TransitionScheduler;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #generation = 0;

  constructor(scheduler: TransitionScheduler = defaultScheduler) {
    this.#scheduler = scheduler;
  }

  switchTo(targets: readonly LayerTarget[], durationMs: number): void {
    this.#generation += 1;
    const generation = this.#generation;
    if (this.#timer !== null) {
      this.#scheduler.clear(this.#timer);
      this.#timer = null;
    }

    const desired = new Map(targets.map((target) => [target.layer.id, target]));
    for (const target of targets) {
      if (!this.#present.has(target.layer.id)) {
        target.layer.setTransition(0);
        target.layer.setOpacity(0);
        target.layer.add();
        this.#present.set(target.layer.id, target.layer);
      }
    }

    const duration = Math.max(0, durationMs);
    for (const [id, layer] of this.#present) {
      layer.setTransition(duration);
      layer.setOpacity(desired.get(id)?.opacity ?? 0);
    }

    const finish = (): void => {
      if (generation !== this.#generation) return;
      for (const [id, layer] of this.#present) {
        if (!desired.has(id)) {
          layer.remove();
          this.#present.delete(id);
        } else {
          layer.setTransition(0);
        }
      }
      this.#timer = null;
    };

    if (duration === 0) finish();
    else this.#timer = this.#scheduler.set(finish, duration);
  }

  presentLayerIds(): readonly string[] {
    return [...this.#present.keys()];
  }

  dispose(): void {
    this.#generation += 1;
    if (this.#timer !== null) this.#scheduler.clear(this.#timer);
    this.#timer = null;
    for (const layer of this.#present.values()) layer.remove();
    this.#present.clear();
  }
}
