import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normInv,
    getZ,
    variance,
    calcN_single,
    calcMDE_single,
    calcRawN_single,
    calcWeightedSE_single,
    calcWeightedSE_ab,
    kishESS,
    effectiveSampleSize,
    calcPageN_monitoring,
    calcOverallMDE_monitoring,
    calcNB_given_nA_proportion,
    calcMDE_ab_proportion,
    calcCI,
    Z_CI,
} from '../js/stats.js';
import { PAGE_CSV_SAMPLE, parsePageCSV, validatePageCsvRows, buildPageCsvTemplate } from '../js/pages.js';

const ALPHA = 0.2;
const POWER = 0.7;
const P = 0.7;
const DELTA = 0.01;

describe('normInv / getZ', () => {
    it('normInv(0.5) ≈ 0', () => {
        assert.ok(Math.abs(normInv(0.5)) < 1e-6);
    });

    it('getZ matches Z_α/2 + Z_β for defaults', () => {
        const z = getZ(ALPHA, POWER);
        const expected = normInv(1 - ALPHA / 2) + normInv(POWER);
        assert.ok(Math.abs(z - expected) < 1e-10);
        assert.ok(z > 1.7 && z < 1.9);
    });
});

describe('calcN_single ↔ calcMDE_single', () => {
    it('round-trip: n from δ then MDE ≈ δ (minSample=1)', () => {
        const n = calcN_single(P, DELTA, ALPHA, POWER, 1);
        const mde = calcMDE_single(P, n, ALPHA, POWER);
        assert.ok(Math.abs(mde - DELTA) < 0.002, `MDE ${mde} vs δ ${DELTA}`);
    });

    it('respects minSample clamp', () => {
        const n = calcN_single(P, 0.5, ALPHA, POWER, 200);
        assert.equal(n, 200);
    });

    it('rawN without clamp is below threshold for large δ', () => {
        const raw = calcRawN_single(P, 0.5, ALPHA, POWER);
        assert.ok(raw < 200);
    });
});

describe('calcWeightedSE_single', () => {
    it('matches manual formula for two pages', () => {
        const pages = [
            { w: 0.5, p: 0.7, n: 10000 },
            { w: 0.5, p: 0.8, n: 10000 },
        ];
        const se = calcWeightedSE_single(pages);
        const manual = Math.sqrt(
            0.5 * 0.5 * variance(0.7) / 10000 +
            0.5 * 0.5 * variance(0.8) / 10000
        );
        assert.ok(Math.abs(se - manual) < 1e-12);
    });

    it('sample CSV pages produce positive weighted SE', () => {
        const pages = PAGE_CSV_SAMPLE.map(r => ({
            w: r.w,
            p: r.p / 100,
            n: r.n,
        }));
        const se = calcWeightedSE_single(pages);
        assert.ok(se > 0 && se < 0.05);
    });
});

describe('kishESS', () => {
    it('equals n when all weights equal', () => {
        const pages = [
            { w: 1, n: 1000 },
            { w: 1, n: 1000 },
        ];
        assert.equal(kishESS(pages), 2000);
    });

    it('is less than sum(n) when weights differ', () => {
        const pages = PAGE_CSV_SAMPLE.map(r => ({ w: r.w, n: r.n }));
        const sumN = pages.reduce((s, pg) => s + pg.n, 0);
        const ess = kishESS(pages);
        assert.ok(ess < sumN);
        assert.ok(ess > sumN * 0.5);
    });

    it('returns null for empty weight sum', () => {
        assert.equal(kishESS([{ w: 0, n: 100 }]), null);
    });
});

describe('effectiveSampleSize', () => {
    it('n_eff = p(1-p)/SE²', () => {
        const p = 0.7;
        const se = 0.01;
        assert.ok(Math.abs(effectiveSampleSize(variance(p), se) - variance(p) / (se * se)) < 1e-10);
    });
});

describe('calcPageN_monitoring / overall MDE', () => {
    it('allocated pages reproduce target δ (minSample=1)', () => {
        const z = getZ(ALPHA, POWER);
        const pages = PAGE_CSV_SAMPLE.map(r => ({
            id: r.page_id,
            w: r.w,
            p: r.p / 100,
            n: 0,
        }));
        const totalW = pages.reduce((s, pg) => s + pg.w, 0);
        for (const pg of pages) {
            pg.n = calcPageN_monitoring(pg.w, totalW, pg.p, z, DELTA, 1);
        }
        const overallMDE = calcOverallMDE_monitoring(pages, z);
        assert.ok(Math.abs(overallMDE - DELTA) < 0.002, `overall MDE ${overallMDE} vs δ ${DELTA}`);
    });
});

describe('AB proportion', () => {
    it('calcNB + calcMDE meets target δ', () => {
        const pA = 0.7, pB = 0.7, nA = 8000;
        const { nB, warning } = calcNB_given_nA_proportion(pA, nA, pB, DELTA, ALPHA, POWER, 1);
        assert.equal(warning, false);
        const mde = calcMDE_ab_proportion(pA, nA, pB, nB, ALPHA, POWER);
        assert.ok(Math.abs(mde - DELTA) < 0.002);
    });
});

describe('calcCI', () => {
    it('uses Z_CI constants', () => {
        const se = 0.01;
        assert.ok(Math.abs(calcCI(se, 0.95) - Z_CI[0.95] * se) < 1e-12);
    });
});

describe('pages.js CSV', () => {
    it('parsePageCSV reads template', () => {
        const rows = parsePageCSV(buildPageCsvTemplate());
        assert.equal(rows.length, PAGE_CSV_SAMPLE.length);
    });

    it('validatePageCsvRows accepts sample data', () => {
        const rows = parsePageCSV(buildPageCsvTemplate());
        const result = validatePageCsvRows(rows);
        assert.equal(result.ok, true);
        assert.equal(result.rows.length, 5);
    });

    it('validatePageCsvRows rejects duplicate page', () => {
        const result = validatePageCsvRows([
            { page_id: 'L', w: '0.5', p: '70', n: '1000' },
            { page_id: 'L', w: '0.5', p: '70', n: '2000' },
        ]);
        assert.equal(result.ok, false);
    });
});
