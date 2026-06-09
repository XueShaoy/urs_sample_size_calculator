/**
 * 样本量计算器 — 纯统计公式（无 DOM 依赖，可单元测试）
 */

export const Z_CI = { 0.90: 1.645, 0.95: 1.960, 0.99: 2.576 };

export const DEFAULT_MIN_SAMPLE = 200;

export function normInv(p) {
    if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pLow = 0.02425;
    let q, r;
    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= 1 - pLow) {
        q = p - 0.5; r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
}

export function getZ(alpha, power) {
    return normInv(1 - alpha/2) + normInv(power);
}

export function variance(p) {
    return p * (1 - p);
}

export function clampSampleSize(rawN, minSample = 1) {
    return Math.max(Math.ceil(rawN), minSample);
}

// ===== 比例指标 =====

export function calcRawN_single(p, delta, alpha, power) {
    const z = getZ(alpha, power);
    return Math.ceil(z * z * variance(p) / (delta * delta));
}

export function calcN_single(p, delta, alpha, power, minSample = 1) {
    return clampSampleSize(calcRawN_single(p, delta, alpha, power), minSample);
}

export function calcMDE_single(p, n, alpha, power) {
    const z = getZ(alpha, power);
    return z * Math.sqrt(variance(p) / n);
}

export function calcNB_given_nA_proportion(pA, nA, pB, delta, alpha, power, minSample = 1) {
    const z = getZ(alpha, power);
    const targetSE2 = Math.pow(delta / z, 2);
    const varA = variance(pA);
    const varB = variance(pB);
    const remaining = targetSE2 - varA / nA;
    if (remaining <= 0) return { nB: minSample, warning: true };
    return { nB: clampSampleSize(varB / remaining, minSample), warning: false };
}

export function calcMDE_ab_proportion(pA, nA, pB, nB, alpha, power) {
    const z = getZ(alpha, power);
    const se = Math.sqrt(variance(pA)/nA + variance(pB)/nB);
    return z * se;
}

export function calcSE_single(p, n) {
    return Math.sqrt(variance(p) / n);
}

export function calcSE_ab_proportion(pA, nA, pB, nB) {
    return Math.sqrt(variance(pA)/nA + variance(pB)/nB);
}

export function calcWeightedSE_single(pages) {
    return Math.sqrt(pages.reduce((sum, pg) => sum + pg.w * pg.w * variance(pg.p) / pg.n, 0));
}

export function calcWeightedSE_ab(pages) {
    return Math.sqrt(pages.reduce((sum, pg) => {
        return sum + pg.w * pg.w * (variance(pg.pA) / pg.nA + variance(pg.pB) / pg.nB);
    }, 0));
}

/** 长期观测 Mode1：按权重比例分配方差预算，反推单页所需样本量（未取整、未 clamp） */
export function calcRawPageN_monitoring(w, totalW, p, z, delta) {
    return w * totalW * variance(p) * z * z / (delta * delta);
}

/** 长期观测 Mode1：单页所需样本量（含 clamp） */
export function calcPageN_monitoring(w, totalW, p, z, delta, minSample = 1) {
    return clampSampleSize(calcRawPageN_monitoring(w, totalW, p, z, delta), minSample);
}

/** 加权整体 MDE（长期观测分页面） */
export function calcOverallMDE_monitoring(pages, z) {
    const varSum = pages.reduce((s, pg) => s + pg.w * pg.w * variance(pg.p) / pg.n, 0);
    return z * Math.sqrt(varSum);
}

// ===== 均值指标 =====

export function calcNB_given_nA_mean(sigmaA, nA, sigmaB, delta, alpha, power, minSample = 1) {
    const z = getZ(alpha, power);
    const targetSE2 = Math.pow(delta / z, 2);
    const remaining = targetSE2 - (sigmaA * sigmaA) / nA;
    if (remaining <= 0) return { nB: minSample, warning: true };
    return { nB: clampSampleSize((sigmaB * sigmaB) / remaining, minSample), warning: false };
}

export function calcMDE_ab_mean(sigmaA, nA, sigmaB, nB, alpha, power) {
    const z = getZ(alpha, power);
    const se = Math.sqrt((sigmaA*sigmaA)/nA + (sigmaB*sigmaB)/nB);
    return z * se;
}

export function calcSE_ab_mean(sigmaA, nA, sigmaB, nB) {
    return Math.sqrt((sigmaA*sigmaA)/nA + (sigmaB*sigmaB)/nB);
}

export function calcCI(se, conf) {
    return Z_CI[conf] * se;
}

export function effectiveSampleSize(varRef, se) {
    if (!(se > 0) || !(varRef > 0)) return null;
    return varRef / (se * se);
}

export function kishESS(pages) {
    const sumNW = pages.reduce((s, pg) => s + pg.n * pg.w, 0);
    const sumNW2 = pages.reduce((s, pg) => s + pg.n * pg.w * pg.w, 0);
    if (!(sumNW2 > 0)) return null;
    return (sumNW * sumNW) / sumNW2;
}
