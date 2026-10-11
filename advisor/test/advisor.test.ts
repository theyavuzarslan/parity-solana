import { describe, it, expect } from 'vitest';
import { forwardPrice, hedgeRatio, ladder, scenarios, ewma, effectiveSigma, expectedSpot } from '../src';
describe('advisor', () => {
  it('forward matches program example', () => { expect(forwardPrice(20, 0.04, 360, 0.10, 360, 90)).toBeCloseTo(20.2970, 3); });
  it('seller with positive premium hedges fully', () => {
    expect(hedgeRatio({ direction: 'sell', spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90, risk: 'balanced' })).toBe(1);
  });
  it('buyer facing expensive carry hedges less', () => {
    const h = hedgeRatio({ direction: 'buy', spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90, risk: 'balanced' });
    expect(h).toBeGreaterThan(0); expect(h).toBeLessThan(1);
  });
  it('more risk-averse buyer hedges more', () => {
    const base = { direction: 'buy' as const, spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90 };
    expect(hedgeRatio({ ...base, risk: 'conservative' })).toBeGreaterThan(hedgeRatio({ ...base, risk: 'opportunistic' }));
  });
  it('ladder decays', () => {
    expect(ladder({ months: 3, monthlyExposure: 3000, h: 1 }).map(r => r.amount)).toEqual([3000, 2250, 1500]);
  });
  it('hedged outcome is flat across shocks', () => {
    const s = scenarios({ exposure: 3000, strike: 45, spot: 42, shocks: [-0.2, 0, 0.4] });
    expect(new Set(s.map(x => Math.round(x.hedged))).size).toBe(1);
  });
  it('ewma of constant returns is zero', () => { expect(ewma([0, 0, 0, 0])).toBe(0); });
  it('zero variance returns 1', () => {
    expect(hedgeRatio({ direction: 'buy', spot: 1, forward: 1, expected: 1, sigmaAnnual: 0, days: 30, risk: 'balanced' })).toBe(1);
  });
  it('sigma floor applies', () => {
    const b = { direction: 'buy' as const, spot: 42, forward: 43, expected: 42.8, days: 90, risk: 'balanced' as const };
    const floored = hedgeRatio({ ...b, sigmaAnnual: 0.0157 });
    expect(floored).toBeGreaterThan(0); expect(floored).toBeLessThan(1);
    expect(floored).toBe(hedgeRatio({ ...b, sigmaAnnual: 0.10 }));
    expect(floored).not.toBe(hedgeRatio({ ...b, sigmaAnnual: 0.30 }));
  });
  it('effectiveSigma floors only low values', () => {
    expect(effectiveSigma(0.0157)).toBe(0.10); expect(effectiveSigma(0.3)).toBe(0.3);
  });
  it('expectedSpot applies simple drift', () => {
    expect(expectedSpot(100, 0.365, 100)).toBeCloseTo(110, 6);
  });
  it('ladder scales by h<1', () => {
    expect(ladder({ months: 2, monthlyExposure: 1000, h: 0.5 }).map(r => r.amount)).toEqual([500, 375]);
  });
});
