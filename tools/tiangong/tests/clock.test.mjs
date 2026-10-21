import { describe, expect, test } from 'vitest';
import { FixedClock } from '../../../src/runtime/clock.ts';

describe('P01-03 fixed simulation clock', () => {
  test.each([30, 60, 144])('advances exactly 60 logical steps at a %i Hz display cadence', fps => {
    const clock = new FixedClock(60, 5);
    clock.advance(0);
    for (let frame = 1; frame <= fps; frame++) clock.advance(frame * 1000 / fps);
    expect(clock.tick).toBe(60);
    expect(clock.maxObservedSteps).toBeLessThanOrEqual(5);
  });
  test('caps a multi-minute stall instead of chasing unlimited missed steps', () => {
    const clock = new FixedClock(60, 5);
    clock.advance(0);
    expect(clock.advance(120000)).toBe(5);
    expect(clock.advance(120001)).toBe(0);
  });
  test('resets elapsed time on resume while preserving completed logical steps', () => {
    const clock = new FixedClock(60, 5);
    clock.advance(0); clock.advance(1000 / 60);
    const before = clock.tick;
    clock.reset();
    expect(clock.advance(90000)).toBe(0);
    expect(clock.tick).toBe(before);
    expect(clock.advance(90000 + 1000 / 60)).toBe(1);
  });
  test('rejects invalid settings and nonfinite timestamps', () => {
    expect(() => new FixedClock(0, 5)).toThrow();
    expect(() => new FixedClock(60, 0)).toThrow();
    expect(() => new FixedClock(60, 5).advance(Infinity)).toThrow();
  });
});
