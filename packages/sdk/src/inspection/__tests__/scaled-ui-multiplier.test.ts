import { resolveScaledUiMultiplier } from '../scaled-ui-multiplier.js';

// 2026-01-01T00:00:00Z
const AT = 1767225600n;

describe('resolveScaledUiMultiplier', () => {
    it('returns undefined without a multiplier', () => {
        expect(resolveScaledUiMultiplier({}, AT)).toBeUndefined();
    });

    describe('not scheduled', () => {
        it('keeps the multiplier when the timestamp is zero', () => {
            expect(
                resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: 0n }, AT),
            ).toEqual({ multiplier: 1 });
        });

        it('keeps the multiplier when there is no new multiplier or timestamp', () => {
            expect(resolveScaledUiMultiplier({ multiplier: 1 }, AT)).toEqual({ multiplier: 1 });
            expect(resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 2 }, AT)).toEqual({ multiplier: 1 });
        });

        it('ignores a schedule to the same multiplier', () => {
            expect(
                resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 1, newMultiplierEffectiveTimestamp: AT }, 0n),
            ).toEqual({ multiplier: 1 });
        });

        it('ignores a timestamp that is not a non-negative integer', () => {
            for (const timestamp of ['', 'abc', '-5', '1.5', 1.5, -5n]) {
                expect(
                    resolveScaledUiMultiplier(
                        { multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: timestamp },
                        AT,
                    ),
                ).toEqual({ multiplier: 1 });
            }
        });
    });

    it('keeps the current multiplier while the change is in the future', () => {
        expect(
            resolveScaledUiMultiplier(
                { multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: AT },
                AT - 1n,
            ),
        ).toEqual({ multiplier: 1, scheduled: { multiplier: 2, effectiveAt: AT, active: false } });
    });

    it('applies the change exactly at its timestamp', () => {
        expect(
            resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: AT }, AT),
        ).toEqual({ multiplier: 2, scheduled: { multiplier: 2, effectiveAt: AT, active: true } });
    });

    it('applies the change after its timestamp', () => {
        expect(
            resolveScaledUiMultiplier(
                { multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: AT },
                AT + 1n,
            ),
        ).toEqual({ multiplier: 2, scheduled: { multiplier: 2, effectiveAt: AT, active: true } });
    });

    it('accepts the dashboard string timestamp and number clocks', () => {
        const schedule = { multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: AT.toString() };
        expect(resolveScaledUiMultiplier(schedule, Number(AT) - 1)?.multiplier).toBe(1);
        expect(resolveScaledUiMultiplier(schedule, Number(AT))?.multiplier).toBe(2);
        // A fractional clock is floored to whole seconds
        expect(resolveScaledUiMultiplier(schedule, Number(AT) - 0.5)?.multiplier).toBe(1);
    });

    it('defaults to the current time', () => {
        const now = BigInt(Math.floor(Date.now() / 1000));
        expect(
            resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: now - 10n })
                ?.multiplier,
        ).toBe(2);
        expect(
            resolveScaledUiMultiplier({ multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: now + 3600n })
                ?.multiplier,
        ).toBe(1);
    });
});
