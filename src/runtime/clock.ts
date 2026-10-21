/** A fixed simulation clock; a long frame never causes unlimited catch-up. */
export class FixedClock {
  private previous: number | null = null;
  private accumulated = 0;
  tick = 0;
  maxObservedSteps = 0;
  constructor(readonly hz: number, readonly maxSteps: number) {
    if (!Number.isFinite(hz) || hz <= 0 || !Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid simulation clock');
  }
  reset(): void { this.previous = null; this.accumulated = 0; }
  advance(nowMilliseconds: number): number {
    if (!Number.isFinite(nowMilliseconds)) throw new Error('Clock timestamp must be finite');
    if (this.previous === null) { this.previous = nowMilliseconds; return 0; }
    const elapsed = Math.max(0, (nowMilliseconds - this.previous) / 1000);
    this.previous = nowMilliseconds;
    const interval = 1 / this.hz;
    this.accumulated += Math.min(elapsed, interval * this.maxSteps);
    let steps = 0;
    while (this.accumulated + 1e-10 >= interval && steps < this.maxSteps) { this.accumulated -= interval; steps++; }
    this.tick += steps;
    this.maxObservedSteps = Math.max(this.maxObservedSteps, steps);
    return steps;
  }
}
