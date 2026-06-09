import {
    normInv, getZ, variance, calcRawN_single, calcN_single, calcMDE_single,
    calcNB_given_nA_proportion, calcMDE_ab_proportion, calcSE_single, calcSE_ab_proportion,
    calcWeightedSE_single, calcWeightedSE_ab, calcNB_given_nA_mean, calcMDE_ab_mean,
    calcSE_ab_mean, calcCI, effectiveSampleSize, kishESS,
    calcRawPageN_monitoring, clampSampleSize,
} from './stats.js';
import {
    PAGES, PAGE_NAMES, parsePageCSV, validatePageCsvRows, buildPageCsvTemplate,
} from './pages.js';

let scenario = 'monitoring';
let metricType = 'proportion';

function getMinSample() {
    return Math.max(1, parseInt(document.getElementById('min-sample').value) || 200);
}

function clearFieldError(input) {
    if (!input) return;
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    const group = input.closest('.form-group') || input.parentElement;
    group?.querySelector('.field-error-msg')?.remove();
}

function clearValidation(mode) {
    document.querySelectorAll(`#mode${mode} input.input-error`).forEach(clearFieldError);
    const banner = document.getElementById(`m${mode}-validation-banner`);
    if (banner) {
        banner.hidden = true;
        banner.innerHTML = '';
    }
}

function setFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    const group = input.closest('.form-group') || input.parentElement;
    if (!group) return;
    let msg = group.querySelector('.field-error-msg');
    if (!msg) {
        msg = document.createElement('span');
        msg.className = 'field-error-msg';
        msg.setAttribute('role', 'alert');
        group.appendChild(msg);
    }
    msg.textContent = message;
}

function showValidationErrors(mode, errors) {
    clearValidation(mode);
    const unique = [];
    const seen = new Set();
    for (const err of errors) {
        const key = `${err.id || ''}:${err.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(err);
    }
    let firstFocus = null;
    for (const err of unique) {
        if (err.id) {
            setFieldError(err.id, err.message);
            if (!firstFocus) firstFocus = document.getElementById(err.id);
        }
    }
    const banner = document.getElementById(`m${mode}-validation-banner`);
    if (banner) {
        banner.hidden = false;
        banner.innerHTML = unique.map(e => `<div>⚠ ${e.message}</div>`).join('');
    }
    document.getElementById(`m${mode}-results`).classList.remove('visible');
    setDownloadBtnVisible(mode, false);
    const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (firstFocus) {
        firstFocus.focus({ preventScroll: true });
        firstFocus.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    } else if (banner) {
        banner.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    }
    return false;
}

function showResults(mode) {
    const el = document.getElementById(`m${mode}-results`);
    el.classList.add('visible', 'highlight-flash');
    el.addEventListener('animationend', () => el.classList.remove('highlight-flash'), { once: true });
    const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    });
}

// GA追踪
function trackEvent(action, mode) {
    if (typeof gtag !== 'undefined') {
        gtag('event', action, {
            'event_category': 'calculator',
            'event_label': scenario + '_' + metricType + '_' + mode,
            'scenario': scenario,
            'metric_type': metricType,
            'mode': mode
        });
    }
}

function essCardHTML(valStr, note, label) {
    return `<div class="result-summary">
            <div class="result-label">${label || '等效样本量 (Effective Sample Size)'}</div>
            <div class="result-value">${valStr}</div>
            <div class="result-note">${note}</div>
        </div>`;
}

// ===== 多指标 Bonferroni =====
function updateMetricInputs() {
    const k = Math.max(1, parseInt(document.getElementById('m1-k').value) || 1);
    const single = document.getElementById('m1-single-metric');
    const multi = document.getElementById('m1-multi-metrics');
    const pageCard = document.getElementById('m1-page-card');

    if (k === 1) {
        single.style.display = 'block';
        multi.style.display = 'none';
        if (pageCard) pageCard.style.display = 'block';
        return;
    }

    single.style.display = 'none';
    multi.style.display = 'block';
    if (pageCard) pageCard.style.display = 'none';

    // Preserve existing input values before re-render
    const existing = [];
    for (let i = 1; i <= 20; i++) {
        const pEl = document.getElementById(`m1-metric-${i}-p`);
        const dEl = document.getElementById(`m1-metric-${i}-delta`);
        if (!pEl) break;
        existing.push({ p: pEl.value, delta: dEl ? dEl.value : '' });
    }

    let rows = '';
    for (let i = 1; i <= k; i++) {
        const prev = existing[i - 1] || { p: '', delta: '' };
        rows += `<div style="display:flex;align-items:center;gap:16px;background:var(--bg-secondary);border-radius:10px;padding:14px 16px;border:1px solid var(--border-color);">
            <span style="font-size:0.8rem;color:var(--text-muted);min-width:36px;font-family:'JetBrains Mono',monospace;">指标 ${i}</span>
            <div class="form-group" style="flex:1;margin:0;">
                <label style="font-size:0.78rem;">观测目标 p</label>
                <div class="input-suffix" data-suffix="%"><input type="number" id="m1-metric-${i}-p" value="${prev.p}" placeholder="例如: 70" step="0.1" min="0" max="100"></div>
            </div>
            <div class="form-group" style="flex:1;margin:0;">
                <label style="font-size:0.78rem;">波动精度 δ (MDE)</label>
                <div class="input-suffix" data-suffix="%"><input type="number" id="m1-metric-${i}-delta" value="${prev.delta}" placeholder="例如: 1" step="0.1" min="0"></div>
            </div>
        </div>`;
    }

    const alpha = parseFloat(document.getElementById('m1-alpha').value) || 0.2;
    const alphaAdj = (alpha / k).toFixed(4);
    multi.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">${rows}</div>
        <div id="m1-bonferroni-info" style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.2);border-radius:8px;padding:10px 14px;">
            Bonferroni 校正：α_adj = ${alpha} / ${k} = <strong style="color:var(--accent-cyan);">${alphaAdj}</strong>，整体误报率 ≤ ${alpha}
        </div>`;
}

function updateBonferroniInfo() {
    const info = document.getElementById('m1-bonferroni-info');
    if (!info) return;
    const k = Math.max(1, parseInt(document.getElementById('m1-k').value) || 1);
    const alpha = parseFloat(document.getElementById('m1-alpha').value) || 0.2;
    info.innerHTML = `Bonferroni 校正：α_adj = ${alpha} / ${k} = <strong style="color:var(--accent-cyan);">${(alpha / k).toFixed(4)}</strong>，整体误报率 ≤ ${alpha}`;
}

// ===== UI =====
function switchScenario(s) {
    scenario = s;
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.classList.remove('active', 'ab-test');
        const selected = btn.dataset.scenario === s;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) { btn.classList.add('active'); if (s === 'ab-test') btn.classList.add('ab-test'); }
    });
    document.getElementById('page-title').textContent = s === 'ab-test' ? 'AB 测试 ' : '长期观测 ';
    
    // Show/hide metric switch
    document.getElementById('metric-switch').style.display = s === 'ab-test' ? 'flex' : 'none';
    
    // Reset metric type when switching to monitoring
    if (s === 'monitoring') metricType = 'proportion';
    
    updateInputVisibility();
    updateInfoBoxes();
    updateM2PageCsvVisibility();
    initPageConfigs();
    document.getElementById('m1-results').classList.remove('visible');
    document.getElementById('m2-results').classList.remove('visible');
    clearValidation(1);
    clearValidation(2);
    setDownloadBtnVisible(1, false);
    setDownloadBtnVisible(2, false);
}

function switchMode(mode) {
    document.querySelectorAll('.switch-btn').forEach(btn => {
        const selected = btn.dataset.mode === mode;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    document.getElementById('mode1').style.display = mode === 'mode1' ? 'block' : 'none';
    document.getElementById('mode2').style.display = mode === 'mode2' ? 'block' : 'none';
    const m1HasResult = document.getElementById('m1-results').classList.contains('visible');
    const m2HasResult = document.getElementById('m2-results').classList.contains('visible');
    setDownloadBtnVisible(1, mode === 'mode1' && m1HasResult);
    setDownloadBtnVisible(2, mode === 'mode2' && m2HasResult);
    updateM2PageCsvVisibility();
}

function switchMetric(m) {
    metricType = m;
    document.querySelectorAll('.metric-btn').forEach(btn => {
        const selected = btn.dataset.metric === m;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    updateInputVisibility();
    updateInfoBoxes();
    document.getElementById('m1-results').classList.remove('visible');
    document.getElementById('m2-results').classList.remove('visible');
    clearValidation(1);
    clearValidation(2);
    setDownloadBtnVisible(1, false);
    setDownloadBtnVisible(2, false);
}

function updateInputVisibility() {
    // Mode 1
    document.getElementById('m1-monitoring').style.display = scenario === 'monitoring' ? 'block' : 'none';
    document.getElementById('m1-ab-proportion').style.display = (scenario === 'ab-test' && metricType === 'proportion') ? 'block' : 'none';
    document.getElementById('m1-ab-mean').style.display = (scenario === 'ab-test' && metricType === 'mean') ? 'block' : 'none';
    
    // Mode 2
    document.getElementById('m2-monitoring').style.display = scenario === 'monitoring' ? 'block' : 'none';
    document.getElementById('m2-ab-proportion').style.display = (scenario === 'ab-test' && metricType === 'proportion') ? 'block' : 'none';
    document.getElementById('m2-ab-mean').style.display = (scenario === 'ab-test' && metricType === 'mean') ? 'block' : 'none';
    
    // Page config (hide for mean metric)
    const showPageConfig = scenario === 'monitoring' || metricType === 'proportion';
    document.getElementById('m1-page-card').style.display = showPageConfig ? 'block' : 'none';
    document.getElementById('m2-page-card').style.display = showPageConfig ? 'block' : 'none';
    const m2Desc = document.getElementById('m2-page-card-desc');
    if (m2Desc) {
        m2Desc.textContent = scenario === 'monitoring'
            ? '选择页面手动录入，或导入 CSV 批量填写（长期观测 · 模式2）'
            : '选择页面，输入各页面参数（可选）';
    }
    updateM2PageCsvVisibility();
}

function isMode2Active() {
    return document.getElementById('mode2').style.display !== 'none';
}

function updateM2PageCsvVisibility() {
    const el = document.getElementById('m2-page-csv-section');
    if (el) el.style.display = (scenario === 'monitoring' && isMode2Active()) ? 'block' : 'none';
}

function updateInfoBoxes() {
    const m1 = document.getElementById('m1-info'), m2 = document.getElementById('m2-info');
    
    if (scenario === 'monitoring') {
        m1.className = 'info-box';
        m1.innerHTML = '<strong>💡 长期观测公式：</strong>n = Z²×p(1-p)/δ²，其中 Z = Z<sub>α/2</sub> + Z<sub>β</sub><br><strong>说明：</strong>配对样本（同一群体跨周期），单组样本量。分页面时按整体 δ 与权重比例分配方差预算，反推各页所需样本量，使加权整体 MDE 回算 ≈ δ。<br><strong>多指标：</strong>「同时观测指标数 k」及 Bonferroni 校正仅作用于顶部整体结果，不影响各页面详情。';
        m2.className = 'info-box';
        m2.innerHTML = '<strong>💡 长期观测公式：</strong>MDE = Z × √(p(1-p)/n)<br><strong>说明：</strong>可通过页面加权计算整体精度。分页面支持 CSV 导入，列：<code>page_id, w, p, n</code>（页面 ID 为 L/D/B/O/M，w 为权重，p 为预期比例%，n 为实际样本量）；文件中填写几行即导入几个页面。';
    } else if (metricType === 'proportion') {
        m1.className = 'info-box ab-test';
        m1.innerHTML = `<strong>💡 比例指标AB测试公式：</strong><br>SE = √(VarA/nA + VarB/nB)，MDE = Z × SE<br>给定 nA，求 nB = VarB / [(δ/Z)² - VarA/nA]`;
        m2.className = 'info-box ab-test';
        m2.innerHTML = `<strong>💡 比例指标AB测试公式：</strong><br>MDE = Z × √(pA(1-pA)/nA + pB(1-pB)/nB)`;
    } else {
        m1.className = 'info-box ab-test';
        m1.innerHTML = `<strong>💡 均值指标AB测试公式：</strong><br>SE = √(σA²/nA + σB²/nB)，MDE = Z × SE<br>给定 nA，求 nB = σB² / [(δ/Z)² - σA²/nA]`;
        m2.className = 'info-box ab-test';
        m2.innerHTML = `<strong>💡 均值指标AB测试公式：</strong><br>MDE = Z × √(σA²/nA + σB²/nB)`;
    }
}

function initPageConfigs() {
    for (let mode = 1; mode <= 2; mode++) {
        const gridHtml = PAGES.map(p => `<div><input type="checkbox" id="m${mode}-pg-${p}" class="page-checkbox" onchange="togglePage(${mode},'${p}')"><label for="m${mode}-pg-${p}" class="page-label">${p}<span class="page-full-name">${PAGE_NAMES[p]}</span></label></div>`).join('');
        document.getElementById(`m${mode}-page-grid`).innerHTML = gridHtml;
        
        let configHtml = '';
        for (const p of PAGES) {
            if (scenario === 'ab-test') {
                if (mode === 1) {
                    configHtml += `<div class="page-config" id="m${mode}-cfg-${p}">
                        <div class="page-config-header"><span class="page-badge ${p}">${p}</span><span style="color:var(--text-secondary)">${PAGE_NAMES[p]}</span></div>
                        <div class="form-grid" style="grid-template-columns:repeat(4,1fr);">
                            <div class="form-group"><label>权重 w</label><input type="number" id="m${mode}-${p}-w" placeholder="0.35" step="0.01" min="0" max="1"></div>
                            <div class="form-group"><label>比例 pA</label><div class="input-suffix" data-suffix="%"><input type="number" id="m${mode}-${p}-pA" placeholder="70" step="0.1"></div></div>
                            <div class="form-group"><label>样本量 nA</label><input type="number" id="m${mode}-${p}-nA" placeholder="5000" step="1"></div>
                            <div class="form-group"><label>比例 pB</label><div class="input-suffix" data-suffix="%"><input type="number" id="m${mode}-${p}-pB" placeholder="70" step="0.1"></div></div>
                        </div>
                        <div class="checkbox-row"><input type="checkbox" id="m${mode}-${p}-sync" checked onchange="syncPageP(${mode},'${p}')"><label for="m${mode}-${p}-sync">A/B组预期比例相同</label></div>
                    </div>`;
                } else {
                    configHtml += `<div class="page-config" id="m${mode}-cfg-${p}">
                        <div class="page-config-header"><span class="page-badge ${p}">${p}</span><span style="color:var(--text-secondary)">${PAGE_NAMES[p]}</span></div>
                        <div class="form-grid" style="grid-template-columns:repeat(5,1fr);">
                            <div class="form-group"><label>权重 w</label><input type="number" id="m${mode}-${p}-w" placeholder="0.35" step="0.01" min="0" max="1"></div>
                            <div class="form-group"><label>比例 pA</label><div class="input-suffix" data-suffix="%"><input type="number" id="m${mode}-${p}-pA" placeholder="70" step="0.1"></div></div>
                            <div class="form-group"><label>样本量 nA</label><input type="number" id="m${mode}-${p}-nA" placeholder="5000" step="1"></div>
                            <div class="form-group"><label>比例 pB</label><div class="input-suffix" data-suffix="%"><input type="number" id="m${mode}-${p}-pB" placeholder="70" step="0.1"></div></div>
                            <div class="form-group"><label>样本量 nB</label><input type="number" id="m${mode}-${p}-nB" placeholder="5000" step="1"></div>
                        </div>
                        <div class="checkbox-row"><input type="checkbox" id="m${mode}-${p}-sync" checked onchange="syncPageP(${mode},'${p}')"><label for="m${mode}-${p}-sync">A/B组预期比例相同</label></div>
                    </div>`;
                }
            } else {
                const nLabel = mode === 1 ? '预估样本量 n' : '实际样本量 n';
                configHtml += `<div class="page-config" id="m${mode}-cfg-${p}">
                    <div class="page-config-header"><span class="page-badge ${p}">${p}</span><span style="color:var(--text-secondary)">${PAGE_NAMES[p]}</span></div>
                    <div class="form-grid" style="grid-template-columns:repeat(3,1fr);">
                        <div class="form-group"><label>权重 w</label><input type="number" id="m${mode}-${p}-w" placeholder="0.35" step="0.01" min="0" max="1"></div>
                        <div class="form-group"><label>预期比例 p</label><div class="input-suffix" data-suffix="%"><input type="number" id="m${mode}-${p}-p" placeholder="70" step="0.1"></div></div>
                        <div class="form-group"><label>${nLabel}</label><input type="number" id="m${mode}-${p}-n" placeholder="5000" step="1"></div>
                    </div>
                </div>`;
            }
        }
        document.getElementById(`m${mode}-page-configs`).innerHTML = configHtml;
    }
}

function togglePage(mode, p) {
    const checked = document.getElementById(`m${mode}-pg-${p}`).checked;
    document.getElementById(`m${mode}-cfg-${p}`).classList.toggle('active', checked);
}

function applyPreset(mode, preset) {
    PAGES.forEach(p => {
        document.getElementById(`m${mode}-pg-${p}`).checked = false;
        document.getElementById(`m${mode}-cfg-${p}`).classList.remove('active');
    });
    if (preset === 'all') PAGES.forEach(p => { document.getElementById(`m${mode}-pg-${p}`).checked = true; document.getElementById(`m${mode}-cfg-${p}`).classList.add('active'); });
    else if (preset === 'db') ['D','B'].forEach(p => { document.getElementById(`m${mode}-pg-${p}`).checked = true; document.getElementById(`m${mode}-cfg-${p}`).classList.add('active'); });
}

function setM2PageCsvStatus(msg, cls) {
    const el = document.getElementById('m2-page-csv-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'csv-status' + (cls ? ' ' + cls : '');
}

function applyPageCsvRows(rows) {
    PAGES.forEach(p => {
        document.getElementById(`m2-pg-${p}`).checked = false;
        document.getElementById(`m2-cfg-${p}`).classList.remove('active');
        ['w', 'p', 'n'].forEach(field => {
            const el = document.getElementById(`m2-${p}-${field}`);
            if (el) el.value = '';
        });
    });

    const validated = validatePageCsvRows(rows);
    if (!validated.ok) {
        setM2PageCsvStatus(validated.message, 'err');
        return false;
    }
    const validRows = validated.rows;

    validRows.forEach(({ pageId, w, p, n }) => {
        document.getElementById(`m2-pg-${pageId}`).checked = true;
        document.getElementById(`m2-cfg-${pageId}`).classList.add('active');
        document.getElementById(`m2-${pageId}-w`).value = w;
        document.getElementById(`m2-${pageId}-p`).value = p;
        document.getElementById(`m2-${pageId}-n`).value = n;
    });
    return validRows.length;
}

function handleM2PageCSVText(text, fname) {
    let rows;
    try { rows = parsePageCSV(text); } catch (e) {
        setM2PageCsvStatus('CSV 解析失败：' + e.message, 'err');
        return;
    }
    const count = applyPageCsvRows(rows);
    if (!count) return;
    setM2PageCsvStatus(`已从 ${fname || 'CSV'} 导入 ${count} 个页面`, 'ok');
    calcMode2();
}

function downloadPageCsvTemplate() {
    const csv = buildPageCsvTemplate();
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-size-m2-monitoring-pages-template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function readM2PageCsvFile(file) {
    if (!/\.csv$/i.test(file.name)) { setM2PageCsvStatus('请选择 .csv 文件', 'err'); return; }
    const reader = new FileReader();
    reader.onload = e => handleM2PageCSVText(e.target.result, file.name);
    reader.onerror = () => setM2PageCsvStatus('文件读取失败', 'err');
    reader.readAsText(file, 'UTF-8');
}

function setupM2PageDropzone() {
    const dz = document.getElementById('m2-page-dropzone');
    const fileInput = document.getElementById('m2-page-csv-file');
    if (!dz || !fileInput) return;
    dz.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { if (e.target.files[0]) readM2PageCsvFile(e.target.files[0]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readM2PageCsvFile(f); });
}

function syncPageP(mode, p) {
    const syncCheckbox = document.getElementById(`m${mode}-${p}-sync`);
    if (syncCheckbox && syncCheckbox.checked) {
        const pAEl = document.getElementById(`m${mode}-${p}-pA`);
        const pBEl = document.getElementById(`m${mode}-${p}-pB`);
        if (pAEl && pBEl) pBEl.value = pAEl.value;
    }
}

// Sync handlers
document.addEventListener('input', e => {
    if (e.target.matches('input[type="number"]')) {
        clearFieldError(e.target);
        const modeRoot = e.target.closest('#mode1, #mode2');
        if (modeRoot && !modeRoot.querySelector('input.input-error')) {
            const mode = modeRoot.id === 'mode1' ? 1 : 2;
            const banner = document.getElementById(`m${mode}-validation-banner`);
            if (banner) { banner.hidden = true; banner.innerHTML = ''; }
        }
    }
    // Proportion sync
    if (e.target.id === 'm1-ab-pA' && document.getElementById('m1-ab-sync-p').checked) {
        document.getElementById('m1-ab-pB').value = e.target.value;
    }
    if (e.target.id === 'm2-ab-pA' && document.getElementById('m2-ab-sync-p').checked) {
        document.getElementById('m2-ab-pB').value = e.target.value;
    }
    // Mean sigma sync
    if (e.target.id === 'm1-mean-sigmaA' && document.getElementById('m1-mean-sync-sigma').checked) {
        document.getElementById('m1-mean-sigmaB').value = e.target.value;
    }
    if (e.target.id === 'm2-mean-sigmaA' && document.getElementById('m2-mean-sync-sigma').checked) {
        document.getElementById('m2-mean-sigmaB').value = e.target.value;
    }
    // Page sync
    for (const p of PAGES) {
        for (const mode of [1, 2]) {
            const syncEl = document.getElementById(`m${mode}-${p}-sync`);
            if (e.target.id === `m${mode}-${p}-pA` && syncEl && syncEl.checked) {
                const pBEl = document.getElementById(`m${mode}-${p}-pB`);
                if (pBEl) pBEl.value = e.target.value;
            }
        }
    }
});

function getSelectedPages(mode) {
    const pages = [];
    for (const p of PAGES) {
        if (!document.getElementById(`m${mode}-pg-${p}`).checked) continue;
        const w = parseFloat(document.getElementById(`m${mode}-${p}-w`).value) || 0;
        
        if (scenario === 'ab-test') {
            let pA = (parseFloat(document.getElementById(`m${mode}-${p}-pA`).value) || 0) / 100;
            let pB = (parseFloat(document.getElementById(`m${mode}-${p}-pB`).value) || 0) / 100;
            const syncEl = document.getElementById(`m${mode}-${p}-sync`);
            if (syncEl && syncEl.checked) pB = pA;
            const nA = parseInt(document.getElementById(`m${mode}-${p}-nA`).value) || 0;
            
            if (mode === 1) {
                if (w > 0 && pA > 0 && pB > 0) pages.push({ id: p, w, pA, pB, nA });
            } else {
                const nB = parseInt(document.getElementById(`m${mode}-${p}-nB`).value) || 0;
                if (w > 0 && pA > 0 && pB > 0 && nA > 0 && nB > 0) pages.push({ id: p, w, pA, pB, nA, nB });
            }
        } else {
            const pVal = (parseFloat(document.getElementById(`m${mode}-${p}-p`).value) || 0) / 100;
            const n = parseInt(document.getElementById(`m${mode}-${p}-n`).value) || 0;
            if (w > 0 && pVal > 0) pages.push({ id: p, w, p: pVal, n });
        }
    }
    return pages;
}

function thTip(label, tip) {
    return `${label} <span class="tooltip tip-bottom" data-tip="${tip}">ⓘ</span>`;
}

// ===== CSV 导出 =====
function setDownloadBtnVisible(mode, visible) {
    const btn = document.getElementById(`m${mode}-download-csv`);
    if (btn) btn.style.display = visible ? 'inline-flex' : 'none';
}

function csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function thText(th) {
    return (th.childNodes[0]?.textContent || th.textContent).replace(/ⓘ/g, '').trim();
}

function extractResultSummary(contentId) {
    const el = document.getElementById(contentId);
    if (!el) return [];
    const rows = [];
    el.querySelectorAll('.result-summary').forEach(s => {
        const label = s.querySelector('.result-label')?.textContent.trim();
        const value = s.querySelector('.result-value')?.textContent.trim();
        if (label) rows.push([label, value || '']);
        const note = s.querySelector('.result-note')?.textContent.trim();
        if (note) rows.push(['备注', note]);
    });
    el.querySelectorAll('.ab-result-card').forEach(c => {
        const label = c.querySelector('.ab-result-label')?.textContent.trim();
        const value = c.querySelector('.ab-result-value')?.textContent.trim();
        if (label) rows.push([label, value || '']);
    });
    const abNote = el.querySelector('.result-note')?.textContent.trim();
    if (abNote && !rows.some(r => r[0] === '备注')) rows.push(['备注', abNote]);
    return rows;
}

function extractTable(theadId, tbodyId) {
    const thead = document.getElementById(theadId);
    const tbody = document.getElementById(tbodyId);
    if (!thead || !tbody) return { headers: [], rows: [] };
    const headers = [...thead.querySelectorAll('th')].map(thText);
    const rows = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        if (tr.querySelector('td[colspan]')) return;
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim().replace(/\s+/g, ' '));
        if (cells.length) rows.push(cells);
    });
    return { headers, rows };
}

function extractCiGrid() {
    const grid = document.getElementById('m2-ci-grid');
    if (!grid || !grid.children.length) return [];
    const rows = [['置信水平', '半宽']];
    grid.querySelectorAll('.ci-card').forEach(c => {
        rows.push([
            c.querySelector('.ci-level')?.textContent.trim() || '',
            c.querySelector('.ci-value')?.textContent.trim() || ''
        ]);
    });
    return rows;
}

function getExportMeta() {
    const modeEl = document.querySelector('.switch-btn.active');
    const modeName = modeEl?.textContent.trim() || '';
    const scenarioName = scenario === 'ab-test' ? 'AB测试' : '长期观测';
    const metricName = metricType === 'mean' ? '均值指标' : '比例指标';
    return [
        ['计算器', '最小样本量计算器'],
        ['计算方向', modeName],
        ['场景', scenarioName],
        ['指标类型', scenario === 'ab-test' ? metricName : '比例指标'],
        ['导出时间', new Date().toLocaleString('zh-CN')],
        ['最小样本量阈值', getMinSample()],
    ];
}

function collectCsvSections(mode) {
    const sections = [{ title: '基本信息', rows: getExportMeta() }];
    const contentId = `m${mode}-result-content`;

    const summaryRows = extractResultSummary(contentId);
    if (summaryRows.length) sections.push({ title: '计算结果', rows: [['项目', '值'], ...summaryRows] });

    if (mode === 2) {
        const ciRows = extractCiGrid();
        if (ciRows.length > 1) sections.push({ title: '置信区间半宽', rows: ciRows });
    }

    const pageTitle = document.getElementById(`m${mode}-page-title`);
    const pageTableVisible = pageTitle && getComputedStyle(pageTitle).display !== 'none';
    if (pageTableVisible) {
        const table = extractTable(`m${mode}-thead`, `m${mode}-tbody`);
        if (table.headers.length && table.rows.length) sections.push({ title: '各页面详情', ...table });
    }

    document.getElementById(contentId)?.querySelectorAll('.table-container table').forEach((table, i) => {
        const headers = [...table.querySelectorAll('thead th')].map(th => thText(th));
        const rows = [];
        table.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.querySelector('td[colspan]')) return;
            const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim().replace(/\s+/g, ' '));
            if (cells.length) rows.push(cells);
        });
        if (headers.length && rows.length) {
            sections.push({ title: i === 0 ? '各指标详情' : `各指标详情${i + 1}`, headers, rows });
        }
    });

    return sections;
}

function buildCsvContent(sections) {
    const lines = [];
    sections.forEach((sec, i) => {
        if (i > 0) lines.push('');
        lines.push(csvEscape(sec.title));
        if (sec.headers) {
            lines.push(sec.headers.map(csvEscape).join(','));
            sec.rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
        } else {
            sec.rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
        }
    });
    return '\uFEFF' + lines.join('\r\n');
}

function downloadCsv(mode) {
    const sections = collectCsvSections(mode);
    if (sections.length <= 1 && !sections[0].rows.length) {
        showValidationErrors(mode, [{ message: '暂无可导出的计算结果，请先完成计算' }]);
        return;
    }
    const scenarioTag = scenario === 'ab-test' ? 'AB测试' : '长期观测';
    const modeTag = mode === 1 ? '精度到样本量' : '样本量到精度';
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([buildCsvContent(sections)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `样本量计算_${modeTag}_${scenarioTag}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    trackEvent('download_csv', `mode${mode}`);
}

// ===== Mode 1: 精度 → 样本量 =====
function calcMode1() {
    clearValidation(1);
    let html = '', formula = '';
    
    if (scenario === 'monitoring') {
        // 长期观测 - 比例
        const alpha = parseFloat(document.getElementById('m1-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m1-power').value) || 0.7;
        const k = Math.max(1, parseInt(document.getElementById('m1-k').value) || 1);

        if (k === 1) {
        const p = (parseFloat(document.getElementById('m1-p').value) || 0) / 100;
        const delta = (parseFloat(document.getElementById('m1-delta').value) || 0) / 100;
        const pages = getSelectedPages(1);
        const hasPages = pages.length > 0;
        const pValid = p > 0 && p < 1;

        if (delta <= 0) { return showValidationErrors(1, [{ id: 'm1-delta', message: '请输入有效的 MDE δ' }]); }
        // 总体观测目标 p：分页面信息填写完整时为可选项
        if (!pValid && !hasPages) {
            return showValidationErrors(1, [{ id: 'm1-p', message: '请输入有效的 p 值 (0-100%)，或在下方填写分页面信息' }]);
        }

        const z = getZ(alpha, power);
        const za = normInv(1 - alpha/2), zb = normInv(power);

        if (pValid) {
            const n = calcN_single(p, delta, alpha, power, getMinSample());
            const rawN = calcRawN_single(p, delta, alpha, power);
            const verifyMDE = calcMDE_single(p, n, alpha, power);
            const clampNote = rawN < getMinSample()
                ? `<div style="color:var(--accent-orange);margin-top:8px;">⚠️ 统计计算结果为 ${rawN}，低于最小样本量阈值，已自动补足至 ${getMinSample()}</div>`
                : '';

            html = `<div class="result-summary">
                <div class="result-label">最小样本量（单组）</div>
                <div class="result-value">${n.toLocaleString()}</div>
                <div class="result-note">p=${(p*100).toFixed(1)}%, MDE=${(delta*100).toFixed(2)}%, α=${alpha}, Power=${power}${clampNote}</div>
            </div>`;

            formula = `<strong>公式：</strong>n = Z² × p(1-p) / δ²<br>
                <strong>其中：</strong>Z = Z<sub>α/2</sub> + Z<sub>β</sub> = ${za.toFixed(3)} + ${zb.toFixed(3)} = ${z.toFixed(3)}<br>
                <strong>计算：</strong>n = ${z.toFixed(3)}² × ${p.toFixed(4)} × ${(1-p).toFixed(4)} / ${delta.toFixed(4)}² = ${n.toLocaleString()}<br>
                <strong>验证：</strong>MDE = ${z.toFixed(3)} × √(${p.toFixed(4)}×${(1-p).toFixed(4)}/${n}) = ${(verifyMDE*100).toFixed(4)}%`;
        } else {
            // p 未填写但分页面信息完整：跳过整体单池估算，仅给出提示，分页面表照常计算
            html = `<div class="result-summary">
                <div class="result-label">最小样本量（单组）</div>
                <div class="result-value" style="font-size:1.3rem;color:var(--accent-orange);">需要填写「总体观测目标 p」</div>
                <div class="result-note">未填写总体 p，已跳过整体单池估算；下方各页面详情按整体 δ=${(delta*100).toFixed(2)}% 与各页自身 p 计算。</div>
            </div>`;

            formula = `<strong>说明：</strong>「总体观测目标 p」为空。该项仅用于「整体单池」估算 n = Z²×p(1-p)/δ²；<br>由于分页面信息已填写完整，下方「各页面详情」会按各页自身 p 与整体 δ 反推所需样本量，可不依赖总体 p。`;
        }

        renderMode1PageTable_Monitoring(alpha, power, delta);

        } else {
            // 多指标 Bonferroni 校正
            const alphaAdj = alpha / k;
            const z = getZ(alphaAdj, power);
            const za = normInv(1 - alphaAdj/2), zb = normInv(power);

            const metrics = [];
            const metricErrors = [];
            for (let i = 1; i <= k; i++) {
                const pEl = document.getElementById(`m1-metric-${i}-p`);
                const dEl = document.getElementById(`m1-metric-${i}-delta`);
                if (!pEl || !dEl) {
                    metricErrors.push({ id: 'm1-k', message: '请先设置指标数再计算' });
                    break;
                }
                const p = (parseFloat(pEl.value) || 0) / 100;
                const delta = (parseFloat(dEl.value) || 0) / 100;
                if (p <= 0 || p >= 1) metricErrors.push({ id: `m1-metric-${i}-p`, message: `请输入指标 ${i} 的有效 p 值 (0-100%)` });
                if (delta <= 0) metricErrors.push({ id: `m1-metric-${i}-delta`, message: `请输入指标 ${i} 的有效 δ 值` });
                if (p > 0 && p < 1 && delta > 0) {
                    metrics.push({ i, p, delta, n: calcN_single(p, delta, alphaAdj, power, getMinSample()) });
                }
            }
            if (metricErrors.length) return showValidationErrors(1, metricErrors);

            const maxN = Math.max(...metrics.map(m => m.n));

            const tableRows = metrics.map(m =>
                `<tr>
                    <td>指标 ${m.i}</td>
                    <td>${(m.p*100).toFixed(1)}%</td>
                    <td>${(m.delta*100).toFixed(2)}%</td>
                    <td class="highlight-cell">${m.n.toLocaleString()}</td>
                    <td>${m.n === maxN ? '<span style="color:var(--accent-orange)">决定最终样本量</span>' : ''}</td>
                </tr>`
            ).join('');

            html = `<div class="result-summary">
                <div class="result-label">最终所需样本量（取各指标中最大值）</div>
                <div class="result-value">${maxN.toLocaleString()}</div>
                <div class="result-note">k=${k} 个指标，Bonferroni 校正后 α_adj = ${alpha}/${k} = ${alphaAdj.toFixed(4)}，Power=${power}</div>
            </div>
            <div class="table-container" style="margin-top:16px;">
                <table class="results-table">
                    <thead><tr><th>指标</th><th>p</th><th>δ (MDE)</th><th>所需样本量</th><th>备注</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>`;

            formula = `<strong>Bonferroni 校正：</strong>同时检验 k=${k} 个指标，α_adj = α/k = ${alpha}/${k} = ${alphaAdj.toFixed(4)}<br>
                <strong>Z 值：</strong>Z<sub>α_adj/2</sub> + Z<sub>β</sub> = ${za.toFixed(3)} + ${zb.toFixed(3)} = ${z.toFixed(3)}<br>
                <strong>各指标公式：</strong>n = Z² × p(1-p) / δ²<br>
                <strong>最终样本量：</strong>max(n₁…n<sub>${k}</sub>) = ${maxN.toLocaleString()}`;

            document.getElementById('m1-page-title').style.display = 'none';
            document.getElementById('m1-table-container').style.display = 'none';
        }
        
    } else if (metricType === 'proportion') {
        // AB测试 - 比例
        const delta = (parseFloat(document.getElementById('m1-ab-delta').value) || 0) / 100;
        let pA = (parseFloat(document.getElementById('m1-ab-pA').value) || 0) / 100;
        let pB = document.getElementById('m1-ab-sync-p').checked ? pA : (parseFloat(document.getElementById('m1-ab-pB').value) || 0) / 100;
        const nA = parseInt(document.getElementById('m1-ab-nA').value) || 0;
        const alpha = parseFloat(document.getElementById('m1-ab-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m1-ab-power').value) || 0.7;
        
        const abPropErrors = [];
        if (pA <= 0 || pA >= 1 || pB <= 0 || pB >= 1) abPropErrors.push({ id: 'm1-ab-pA', message: '请输入有效的 p 值 (0-100%)' });
        if (delta <= 0) abPropErrors.push({ id: 'm1-ab-delta', message: '请输入有效的 MDE δ' });
        if (nA <= 0) abPropErrors.push({ id: 'm1-ab-nA', message: '请输入 A 组样本量 nA' });
        if (abPropErrors.length) return showValidationErrors(1, abPropErrors);

        const z = getZ(alpha, power);
        const za = normInv(1 - alpha/2), zb = normInv(power);
        const result = calcNB_given_nA_proportion(pA, nA, pB, delta, alpha, power, getMinSample());
        const nB = result.nB;
        const totalN = nA + nB;
        const actualMDE = calcMDE_ab_proportion(pA, nA, pB, nB, alpha, power);
        
        let warningNote = '';
        if (result.warning) {
            warningNote = `<div style="color:var(--accent-orange);margin-top:12px;">⚠️ A组样本量不足以达到目标MDE，B组已设为最小值${getMinSample()}</div>`;
        }

        html = `<div class="ab-result-grid">
            <div class="ab-result-card"><div class="ab-result-label">A 组样本量 (输入)</div><div class="ab-result-value">${nA.toLocaleString()}</div></div>
            <div class="ab-result-card"><div class="ab-result-label">B 组样本量 (计算)</div><div class="ab-result-value">${nB.toLocaleString()}</div></div>
            <div class="ab-result-card highlight"><div class="ab-result-label">总样本量</div><div class="ab-result-value">${totalN.toLocaleString()}</div></div>
        </div>
        <div class="result-note" style="text-align:center;">
            pA=${(pA*100).toFixed(1)}%, pB=${(pB*100).toFixed(1)}%, 目标MDE=${(delta*100).toFixed(2)}%, 实际MDE=${(actualMDE*100).toFixed(2)}%
            ${warningNote}
        </div>`;

        const targetSE2 = Math.pow(delta/z, 2);
        const varA = variance(pA), varB = variance(pB);
        const remaining = targetSE2 - varA/nA;

        formula = `<strong>原理：</strong>给定A组样本量nA，计算B组所需最小样本量nB<br>
            <strong>公式：</strong>nB = VarB / [(δ/Z)² - VarA/nA]<br>
            <strong>其中：</strong>Z = Z<sub>α/2</sub> + Z<sub>β</sub> = ${za.toFixed(3)} + ${zb.toFixed(3)} = ${z.toFixed(3)}<br>
            <strong>计算：</strong><br>
            &nbsp;&nbsp;目标SE² = (δ/Z)² = (${delta.toFixed(4)}/${z.toFixed(3)})² = ${targetSE2.toFixed(8)}<br>
            &nbsp;&nbsp;VarA/nA = ${varA.toFixed(4)}/${nA} = ${(varA/nA).toFixed(8)}<br>
            &nbsp;&nbsp;剩余 = ${remaining.toFixed(8)}<br>
            &nbsp;&nbsp;nB = ${varB.toFixed(4)} / ${remaining.toFixed(8)} = ${nB.toLocaleString()}<br>
            <strong>验证：</strong>MDE = ${(actualMDE*100).toFixed(4)}%`;

        renderMode1PageTable_AB(alpha, power, delta);
        
    } else {
        // AB测试 - 均值
        const delta = parseFloat(document.getElementById('m1-mean-delta').value) || 0;
        let sigmaA = parseFloat(document.getElementById('m1-mean-sigmaA').value) || 0;
        let sigmaB = document.getElementById('m1-mean-sync-sigma').checked ? sigmaA : (parseFloat(document.getElementById('m1-mean-sigmaB').value) || 0);
        const nA = parseInt(document.getElementById('m1-mean-nA').value) || 0;
        const alpha = parseFloat(document.getElementById('m1-mean-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m1-mean-power').value) || 0.7;
        
        const abMeanErrors = [];
        if (sigmaA <= 0) abMeanErrors.push({ id: 'm1-mean-sigmaA', message: '请输入有效的标准差 σ' });
        if (sigmaB <= 0) abMeanErrors.push({ id: 'm1-mean-sigmaB', message: '请输入有效的标准差 σ' });
        if (delta <= 0) abMeanErrors.push({ id: 'm1-mean-delta', message: '请输入有效的 MDE δ' });
        if (nA <= 0) abMeanErrors.push({ id: 'm1-mean-nA', message: '请输入 A 组样本量 nA' });
        if (abMeanErrors.length) return showValidationErrors(1, abMeanErrors);

        const z = getZ(alpha, power);
        const za = normInv(1 - alpha/2), zb = normInv(power);
        const result = calcNB_given_nA_mean(sigmaA, nA, sigmaB, delta, alpha, power, getMinSample());
        const nB = result.nB;
        const totalN = nA + nB;
        const actualMDE = calcMDE_ab_mean(sigmaA, nA, sigmaB, nB, alpha, power);
        
        let warningNote = '';
        if (result.warning) {
            warningNote = `<div style="color:var(--accent-orange);margin-top:12px;">⚠️ A组样本量不足以达到目标MDE，B组已设为最小值${getMinSample()}</div>`;
        }

        html = `<div class="ab-result-grid">
            <div class="ab-result-card"><div class="ab-result-label">A 组样本量 (输入)</div><div class="ab-result-value">${nA.toLocaleString()}</div></div>
            <div class="ab-result-card"><div class="ab-result-label">B 组样本量 (计算)</div><div class="ab-result-value">${nB.toLocaleString()}</div></div>
            <div class="ab-result-card highlight"><div class="ab-result-label">总样本量</div><div class="ab-result-value">${totalN.toLocaleString()}</div></div>
        </div>
        <div class="result-note" style="text-align:center;">
            σA=${sigmaA}, σB=${sigmaB}, 目标MDE=${delta}, 实际MDE=${actualMDE.toFixed(4)}
            ${warningNote}
        </div>`;
        
        const targetSE2 = Math.pow(delta/z, 2);
        const remaining = targetSE2 - (sigmaA*sigmaA)/nA;
        
        formula = `<strong>原理：</strong>给定A组样本量nA，计算B组所需最小样本量nB（均值指标）<br>
            <strong>公式：</strong>nB = σB² / [(δ/Z)² - σA²/nA]<br>
            <strong>其中：</strong>Z = Z<sub>α/2</sub> + Z<sub>β</sub> = ${za.toFixed(3)} + ${zb.toFixed(3)} = ${z.toFixed(3)}<br>
            <strong>计算：</strong><br>
            &nbsp;&nbsp;目标SE² = (δ/Z)² = (${delta}/${z.toFixed(3)})² = ${targetSE2.toFixed(6)}<br>
            &nbsp;&nbsp;σA²/nA = ${(sigmaA*sigmaA).toFixed(4)}/${nA} = ${((sigmaA*sigmaA)/nA).toFixed(6)}<br>
            &nbsp;&nbsp;剩余 = ${remaining.toFixed(6)}<br>
            &nbsp;&nbsp;nB = ${(sigmaB*sigmaB).toFixed(4)} / ${remaining.toFixed(6)} = ${nB.toLocaleString()}<br>
            <strong>验证：</strong>MDE = ${z.toFixed(3)} × √(${(sigmaA*sigmaA).toFixed(2)}/${nA} + ${(sigmaB*sigmaB).toFixed(2)}/${nB}) = ${actualMDE.toFixed(4)}`;
        
        // Hide page tables for mean
        document.getElementById('m1-page-title').style.display = 'none';
        document.getElementById('m1-table-container').style.display = 'none';
    }

    document.getElementById('m1-result-content').innerHTML = html;
    document.getElementById('m1-formula').innerHTML = formula;
    showResults(1);
    setDownloadBtnVisible(1, true);
    trackEvent('calculate', 'mode1');
}

function renderMode1PageTable_Monitoring(alpha, power, delta) {
    const pages = getSelectedPages(1);
    document.getElementById('m1-page-title').style.display = pages.length ? 'flex' : 'none';
    document.getElementById('m1-table-container').style.display = pages.length ? 'block' : 'none';
    if (!pages.length) return;

    const z = getZ(alpha, power);
    const totalW = pages.reduce((s, pg) => s + pg.w, 0);
    const minS = getMinSample();

    document.getElementById('m1-thead').innerHTML = `<tr>
        <th>${thTip('页面', 'LDBOM 页面标识：L（列表）/ D（详情）/ B（购买）/ O（订单）/ M（我的）。')}</th>
        <th>${thTip('权重 w', '该页对整体指标的权重，反映该页在整体中的占比。建议各页权重之和为 1；若不为 1，合计行会提示整体口径可能失真。')}</th>
        <th>${thTip('比例 p', '该页自身的预期比例（如满意率、转化率），填写在页面配置中。用于反推该页所需样本量，与顶部「总体观测目标 p」相互独立。')}</th>
        <th>${thTip('所需样本量', '在整体目标 δ 下，按权重比例分配方差预算后反推的最小样本量。公式：nᵢ = wᵢ·(Σw)·pᵢ(1-pᵢ)·Z²/δ²。')}</th>
        <th>${thTip('SE', '该页标准误：SE = √(p(1-p)/n)。')}</th>
        <th>${thTip('页面MDE', '以该页所需样本量回算的单页检测精度：MDEᵢ = Z·√(pᵢ(1-pᵢ)/nᵢ)。合计行为加权整体 MDE，回算应≈整体目标 δ。')}</th>
        <th>${thTip('预估样本量', '页面配置中填写的计划或已有样本量（可选）。用于与「所需样本量」对比，判断该页流量是否充足。')}</th>
        <th>${thTip('状态', '预估样本量 ≥ 所需样本量 → 充足；否则 → 不足。未填预估样本量显示 --。合计行汇总各页预估总量。')}</th>
    </tr>`;

    let tbody = '';
    let sumW = 0, sumN = 0, sumEst = 0, varSum = 0;
    let anyEst = false, allSufficient = true;

    for (const pg of pages) {
        const rawN = calcRawPageN_monitoring(pg.w, totalW, pg.p, z, delta);
        const pageN = clampSampleSize(rawN, minS);
        const pageSE = Math.sqrt(variance(pg.p) / pageN);
        const pageMDE = z * pageSE;

        sumW += pg.w;
        sumN += pageN;
        varSum += pg.w * pg.w * variance(pg.p) / pageN;

        let status = '--', statusClass = '';
        if (pg.n > 0) {
            anyEst = true;
            sumEst += pg.n;
            const ok = pg.n >= pageN;
            if (!ok) allSufficient = false;
            status = ok ? '✓ 充足' : '⚠ 不足';
            statusClass = ok ? 'success-cell' : 'warning-cell';
        }
        const nEstDisplay = pg.n > 0 ? pg.n.toLocaleString() : '--';

        tbody += `<tr><td>${pg.id}页</td><td>${pg.w.toFixed(3)}</td><td>${(pg.p*100).toFixed(1)}%</td><td class="highlight-cell">${pageN.toLocaleString()}</td><td>±${(pageSE*100).toFixed(4)}%</td><td>±${(pageMDE*100).toFixed(2)}%</td><td>${nEstDisplay}</td><td class="${statusClass}">${status}</td></tr>`;
    }

    const overallSE = Math.sqrt(varSum);
    const overallMDE = z * overallSE;
    const wOk = Math.abs(sumW - 1) <= 0.01;
    const wNote = wOk ? '' : ` <span style="color:var(--accent-orange);">(权重和≠1，整体口径可能失真)</span>`;
    const estTotalDisplay = anyEst ? sumEst.toLocaleString() : '--';
    const overallStatus = anyEst ? (allSufficient ? '✓ 充足' : '⚠ 不足') : '--';
    const overallStatusClass = anyEst ? (allSufficient ? 'success-cell' : 'warning-cell') : '';

    tbody += `<tr style="border-top:2px solid var(--accent-blue);font-weight:600;background:rgba(59,130,246,0.06);">
        <td>合计</td>
        <td>${sumW.toFixed(3)}${wNote}</td>
        <td>—</td>
        <td class="highlight-cell">${sumN.toLocaleString()}</td>
        <td>±${(overallSE*100).toFixed(4)}%</td>
        <td>±${(overallMDE*100).toFixed(2)}%</td>
        <td>${estTotalDisplay}</td>
        <td class="${overallStatusClass}">${overallStatus}</td>
    </tr>`;

    tbody += `<tr><td colspan="8" style="font-size:0.78rem;color:var(--text-secondary);background:transparent;line-height:1.6;padding-top:12px;">
        分配方法：以整体目标 δ=${(delta*100).toFixed(2)}% 按权重比例分配方差预算（份额 wᵢ/Σw），回算加权整体 MDE ≈ δ。<br>
        各页所需样本量 nᵢ = wᵢ · (Σw) · pᵢ(1-pᵢ) · Z² / δ²；页面MDE = Z·√(pᵢ(1-pᵢ)/nᵢ)；整体MDE = Z·√(Σ wᵢ²·pᵢ(1-pᵢ)/nᵢ)。
    </td></tr>`;

    document.getElementById('m1-tbody').innerHTML = tbody;
}

function renderMode1PageTable_AB(alpha, power, delta) {
    const pages = getSelectedPages(1);
    document.getElementById('m1-page-title').style.display = pages.length ? 'flex' : 'none';
    document.getElementById('m1-table-container').style.display = pages.length ? 'block' : 'none';
    if (!pages.length) return;
    
    document.getElementById('m1-thead').innerHTML = `<tr>
        <th>${thTip('页面', 'LDBOM 页面标识：L/D/B/O/M。')}</th>
        <th>${thTip('权重 w', '该页对整体指标的权重。用于将总体 MDE δ 拆分到各页：页面δ = δ/w。')}</th>
        <th>${thTip('页面δ', '该页需达到的波动精度，由总体 δ 按权重拆分：页面δ = δ/w。权重越大，页面δ 越小，要求越严。')}</th>
        <th>${thTip('比例 pA', '该页 A 组（对照组）的预期比例。')}</th>
        <th>${thTip('比例 pB', '该页 B 组（实验组）的预期比例。')}</th>
        <th>${thTip('样本量 nA', '该页 A 组已确定或计划的样本量（由用户指定）。')}</th>
        <th>${thTip('SE', '该页标准误：SE = √(pA(1-pA)/nA + pB(1-pB)/nB)。')}</th>
        <th>${thTip('所需 nB', '在页面δ 和目标 α、power 下，该页 B 组所需的最小样本量。')}</th>
    </tr>`;
    let tbody = '';
    for (const pg of pages) {
        const pageDelta = delta / pg.w;
        let pageNB = getMinSample();
        if (pg.nA > 0) {
            const result = calcNB_given_nA_proportion(pg.pA, pg.nA, pg.pB, pageDelta, alpha, power, getMinSample());
            pageNB = result.nB;
        }
        const nADisplay = pg.nA > 0 ? pg.nA.toLocaleString() : '--';
        const pageSEDisplay = pg.nA > 0 ? `±${(calcSE_ab_proportion(pg.pA, pg.nA, pg.pB, pageNB)*100).toFixed(4)}%` : '--';
        tbody += `<tr><td>${pg.id}页</td><td>${pg.w.toFixed(3)}</td><td>${(pageDelta*100).toFixed(2)}%</td><td>${(pg.pA*100).toFixed(1)}%</td><td>${(pg.pB*100).toFixed(1)}%</td><td>${nADisplay}</td><td>${pageSEDisplay}</td><td class="highlight-cell">${pageNB.toLocaleString()}</td></tr>`;
    }
    document.getElementById('m1-tbody').innerHTML = tbody;
}

// ===== Mode 2: 样本量 → 精度 =====
function calcMode2() {
    clearValidation(2);
    let mde, se, html = '', formula = '';
    
    if (scenario === 'monitoring') {
        const p = (parseFloat(document.getElementById('m2-p').value) || 0) / 100;
        const n = parseInt(document.getElementById('m2-n').value) || 0;
        const alpha = parseFloat(document.getElementById('m2-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m2-power').value) || 0.7;
        
        const pages = getSelectedPages(2);
        const z = getZ(alpha, power);

        if (pages.length > 0 && pages.every(pg => pg.n > 0)) {
            se = calcWeightedSE_single(pages);
            mde = z * se;
            formula = `<strong>加权SE：</strong>SE = √(Σ wᵢ² × pᵢ(1-pᵢ)/nᵢ) = ${(se*100).toFixed(4)}%<br>
                <strong>MDE：</strong>δ = Z × SE = ${z.toFixed(3)} × ${(se*100).toFixed(4)}% = ${(mde*100).toFixed(4)}%`;
        } else if (n > 0) {
            if (p <= 0 || p >= 1) {
                return showValidationErrors(2, [{ id: 'm2-p', message: '请输入有效的 p 值 (0-100%)' }]);
            }
            se = calcSE_single(p, n);
            mde = calcMDE_single(p, n, alpha, power);
            formula = `<strong>SE：</strong>√(p(1-p)/n) = √(${(p*(1-p)).toFixed(4)}/${n}) = ${(se*100).toFixed(4)}%<br>
                <strong>MDE：</strong>δ = Z × SE = ${z.toFixed(3)} × ${(se*100).toFixed(4)}% = ${(mde*100).toFixed(4)}%`;
        } else {
            return showValidationErrors(2, [{ id: 'm2-n', message: '请输入总样本量 n，或在下方配置分页面参数' }]);
        }
        
        const mdeCard = `<div class="result-summary">
            <div class="result-label">最小可检测效应 (MDE)</div>
            <div class="result-value">±${(mde*100).toFixed(2)}<span class="result-unit">%</span></div>
            <div class="result-note">α=${alpha}, Power=${power}, Z=${z.toFixed(3)}, SE=±${(se*100).toFixed(4)}%</div>
        </div>`;

        let essCard;
        {
            const usePages = pages.length > 0;
            const ess = usePages ? kishESS(pages) : null;
            const valStr = ess != null ? Math.round(ess).toLocaleString() : '—';
            const sumNW = usePages ? pages.reduce((s, pg) => s + pg.n * pg.w, 0) : 0;
            const sumNW2 = usePages ? pages.reduce((s, pg) => s + pg.n * pg.w * pg.w, 0) : 0;
            const note = usePages
                ? `Kish 有效样本量 = (Σ nᵢwᵢ)²/Σ nᵢwᵢ² = ${Math.round(sumNW).toLocaleString()}² / ${Math.round(sumNW2).toLocaleString()}（加权样本的等效样本量，权重越不均衡损失越大）`
                : `需配置分页面权重后计算（Kish ESS 基于加权样本）`;
            essCard = essCardHTML(valStr, note, '等效样本量 (Kish ESS)');
        }
        html = `<div class="result-pair">${mdeCard}${essCard}</div>`;

        renderMode2PageTable_Monitoring(pages, alpha, power);
        
        // CI Grid
        const ci90 = calcCI(se, 0.90), ci95 = calcCI(se, 0.95), ci99 = calcCI(se, 0.99);
        document.getElementById('m2-ci-grid').innerHTML = `
            <div class="ci-card"><div class="ci-level">90% CI</div><div class="ci-value">±${(ci90*100).toFixed(2)}%</div></div>
            <div class="ci-card"><div class="ci-level">95% CI</div><div class="ci-value">±${(ci95*100).toFixed(2)}%</div></div>
            <div class="ci-card primary"><div class="ci-level">99% CI</div><div class="ci-value">±${(ci99*100).toFixed(2)}%</div></div>`;
        document.getElementById('m2-ci-title').style.display = 'flex';
        
    } else if (metricType === 'proportion') {
        let pA = (parseFloat(document.getElementById('m2-ab-pA').value) || 0) / 100;
        let pB = document.getElementById('m2-ab-sync-p').checked ? pA : (parseFloat(document.getElementById('m2-ab-pB').value) || 0) / 100;
        const nA = parseInt(document.getElementById('m2-ab-nA').value) || 0;
        const nB = parseInt(document.getElementById('m2-ab-nB').value) || 0;
        const alpha = parseFloat(document.getElementById('m2-ab-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m2-ab-power').value) || 0.7;
        
        const pages = getSelectedPages(2);
        const z = getZ(alpha, power);

        if (pages.length > 0) {
            se = calcWeightedSE_ab(pages);
            mde = z * se;
            formula = `<strong>加权SE：</strong>SE = √(Σ wᵢ² × [pAᵢ(1-pAᵢ)/nAᵢ + pBᵢ(1-pBᵢ)/nBᵢ]) = ${(se*100).toFixed(4)}%<br>
                <strong>MDE：</strong>δ = Z × SE = ${z.toFixed(3)} × ${(se*100).toFixed(4)}% = ${(mde*100).toFixed(4)}%`;
        } else if (nA > 0 && nB > 0) {
            if (pA <= 0 || pA >= 1 || pB <= 0 || pB >= 1) {
                return showValidationErrors(2, [{ id: 'm2-ab-pA', message: '请输入有效的 p 值 (0-100%)' }]);
            }
            se = calcSE_ab_proportion(pA, nA, pB, nB);
            mde = calcMDE_ab_proportion(pA, nA, pB, nB, alpha, power);
            formula = `<strong>SE：</strong>√(pA(1-pA)/nA + pB(1-pB)/nB) = ${(se*100).toFixed(4)}%<br>
                <strong>MDE：</strong>δ = Z × SE = ${z.toFixed(3)} × ${(se*100).toFixed(4)}% = ${(mde*100).toFixed(4)}%`;
        } else {
            const sampleErrors = [];
            if (nA <= 0) sampleErrors.push({ id: 'm2-ab-nA', message: '请输入 A 组样本量 nA' });
            if (nB <= 0) sampleErrors.push({ id: 'm2-ab-nB', message: '请输入 B 组样本量 nB' });
            if (!sampleErrors.length) sampleErrors.push({ message: '请输入两组样本量，或在下方配置分页面参数' });
            return showValidationErrors(2, sampleErrors);
        }
        
        html = `<div class="result-summary">
            <div class="result-label">最小可检测效应 (MDE)</div>
            <div class="result-value">±${(mde*100).toFixed(2)}<span class="result-unit">%</span></div>
            <div class="result-note">nA=${nA||'加权'}, nB=${nB||'加权'}, α=${alpha}, Power=${power}, Z=${z.toFixed(3)}, SE=±${(se*100).toFixed(4)}%</div>
        </div>`;

        {
            const usePages = pages.length > 0;
            const sumW = usePages ? pages.reduce((s, pg) => s + pg.w, 0) : 0;
            const pARef = usePages ? (sumW > 0 ? pages.reduce((s, pg) => s + pg.w * pg.pA, 0) / sumW : 0) : pA;
            const ess = effectiveSampleSize(variance(pARef), se);
            html += essCardHTML(ess != null ? Math.round(ess).toLocaleString() : '—', `等价于基线 pA=${(pARef*100).toFixed(1)}% 的单样本量：n_eff = pA(1-pA)/SE² = ${variance(pARef).toFixed(4)} / ${(se*se).toFixed(8)}${usePages ? '（基线 pA 为各页加权平均）' : ''}`);
        }

        renderMode2PageTable_AB(pages, alpha, power);
        
        // CI Grid
        const ci90 = calcCI(se, 0.90), ci95 = calcCI(se, 0.95), ci99 = calcCI(se, 0.99);
        document.getElementById('m2-ci-grid').innerHTML = `
            <div class="ci-card"><div class="ci-level">90% CI</div><div class="ci-value">±${(ci90*100).toFixed(2)}%</div></div>
            <div class="ci-card"><div class="ci-level">95% CI</div><div class="ci-value">±${(ci95*100).toFixed(2)}%</div></div>
            <div class="ci-card primary"><div class="ci-level">99% CI</div><div class="ci-value">±${(ci99*100).toFixed(2)}%</div></div>`;
        document.getElementById('m2-ci-title').style.display = 'flex';
        
    } else {
        // AB测试 - 均值
        let sigmaA = parseFloat(document.getElementById('m2-mean-sigmaA').value) || 0;
        let sigmaB = document.getElementById('m2-mean-sync-sigma').checked ? sigmaA : (parseFloat(document.getElementById('m2-mean-sigmaB').value) || 0);
        const nA = parseInt(document.getElementById('m2-mean-nA').value) || 0;
        const nB = parseInt(document.getElementById('m2-mean-nB').value) || 0;
        const alpha = parseFloat(document.getElementById('m2-mean-alpha').value) || 0.2;
        const power = parseFloat(document.getElementById('m2-mean-power').value) || 0.7;
        
        const meanErrors = [];
        if (sigmaA <= 0) meanErrors.push({ id: 'm2-mean-sigmaA', message: '请输入有效的标准差 σ' });
        if (sigmaB <= 0) meanErrors.push({ id: 'm2-mean-sigmaB', message: '请输入有效的标准差 σ' });
        if (nA <= 0) meanErrors.push({ id: 'm2-mean-nA', message: '请输入 A 组样本量 nA' });
        if (nB <= 0) meanErrors.push({ id: 'm2-mean-nB', message: '请输入 B 组样本量 nB' });
        if (meanErrors.length) return showValidationErrors(2, meanErrors);

        const z = getZ(alpha, power);
        se = calcSE_ab_mean(sigmaA, nA, sigmaB, nB);
        mde = calcMDE_ab_mean(sigmaA, nA, sigmaB, nB, alpha, power);
        
        html = `<div class="result-summary">
            <div class="result-label">最小可检测效应 (MDE)</div>
            <div class="result-value">±${mde.toFixed(4)}</div>
            <div class="result-note">σA=${sigmaA}, σB=${sigmaB}, nA=${nA.toLocaleString()}, nB=${nB.toLocaleString()}, α=${alpha}, Power=${power}, Z=${z.toFixed(3)}, SE=${se.toFixed(6)}</div>
        </div>`;

        {
            const ess = effectiveSampleSize(sigmaA * sigmaA, se);
            html += essCardHTML(ess != null ? Math.round(ess).toLocaleString() : '—', `等价于基线 σA=${sigmaA} 的单样本量：n_eff = σA²/SE² = ${(sigmaA*sigmaA).toFixed(2)} / ${(se*se).toFixed(8)}`);
        }

        formula = `<strong>SE：</strong>√(σA²/nA + σB²/nB) = √(${(sigmaA*sigmaA).toFixed(2)}/${nA} + ${(sigmaB*sigmaB).toFixed(2)}/${nB}) = ${se.toFixed(6)}<br>
            <strong>MDE：</strong>δ = Z × SE = ${z.toFixed(3)} × ${se.toFixed(6)} = ${mde.toFixed(4)}`;
        
        // CI Grid for mean (absolute values, not percentage)
        const ci90 = calcCI(se, 0.90), ci95 = calcCI(se, 0.95), ci99 = calcCI(se, 0.99);
        document.getElementById('m2-ci-grid').innerHTML = `
            <div class="ci-card"><div class="ci-level">90% CI</div><div class="ci-value">±${ci90.toFixed(4)}</div></div>
            <div class="ci-card"><div class="ci-level">95% CI</div><div class="ci-value">±${ci95.toFixed(4)}</div></div>
            <div class="ci-card primary"><div class="ci-level">99% CI</div><div class="ci-value">±${ci99.toFixed(4)}</div></div>`;
        document.getElementById('m2-ci-title').style.display = 'flex';
        
        // Hide page tables
        document.getElementById('m2-page-title').style.display = 'none';
        document.getElementById('m2-table-container').style.display = 'none';
    }

    document.getElementById('m2-result-content').innerHTML = html;
    document.getElementById('m2-formula').innerHTML = formula;
    showResults(2);
    setDownloadBtnVisible(2, true);
    trackEvent('calculate', 'mode2');
}

function renderMode2PageTable_Monitoring(pages, alpha, power) {
    const z = getZ(alpha, power);
    document.getElementById('m2-page-title').style.display = pages.length ? 'flex' : 'none';
    document.getElementById('m2-table-container').style.display = pages.length ? 'block' : 'none';
    if (!pages.length) return;
    
    document.getElementById('m2-thead').innerHTML = `<tr>
        <th>${thTip('页面', 'LDBOM 页面标识：L/D/B/O/M。')}</th>
        <th>${thTip('权重 w', '该页对整体指标的权重，用于加权计算整体 MDE：SE = √(Σ wᵢ²·pᵢ(1-pᵢ)/nᵢ)。')}</th>
        <th>${thTip('比例 p', '该页的预期比例（满意率、转化率等）。')}</th>
        <th>${thTip('样本量 n', '该页的实际或计划单组样本量。')}</th>
        <th>${thTip('等效样本量', 'Kish 有效样本量为加权样本的整组聚合指标：ESS = (Σ nᵢwᵢ)²/Σ nᵢwᵢ²，无逐页值，逐页显示 —，汇总行展示整体 ESS。')}</th>
        <th>${thTip('SE', '该页标准误：SE = √(p(1-p)/n)。')}</th>
        <th>${thTip('页面MDE', '该页在 α、power 下可检测的最小波动：MDE = Z·√(p(1-p)/n)。')}</th>
        <th>${thTip('90%CI', '该页在 90% 置信水平下的精度半宽：Z₀.₉₀·SE。')}</th>
        <th>${thTip('95%CI', '该页在 95% 置信水平下的精度半宽：Z₀.₉₅·SE。')}</th>
        <th>${thTip('99%CI', '该页在 99% 置信水平下的精度半宽：Z₀.₉₉·SE。')}</th>
    </tr>`;
    let tbody = '';
    const cnt = pages.length;
    let sumW = 0, sumWP = 0, sumN = 0;
    for (const pg of pages) {
        const pgSE = calcSE_single(pg.p, pg.n);
        const pgMDE = calcMDE_single(pg.p, pg.n, alpha, power);
        const pgCI90 = calcCI(pgSE, 0.90), pgCI95 = calcCI(pgSE, 0.95), pgCI99 = calcCI(pgSE, 0.99);
        sumW += pg.w; sumWP += pg.w * pg.p; sumN += pg.n;
        tbody += `<tr><td>${pg.id}页</td><td>${pg.w.toFixed(3)}</td><td>${(pg.p*100).toFixed(1)}%</td><td>${pg.n.toLocaleString()}</td><td>—</td><td>±${(pgSE*100).toFixed(4)}%</td><td class="highlight-cell">±${(pgMDE*100).toFixed(2)}%</td><td>±${(pgCI90*100).toFixed(2)}%</td><td>±${(pgCI95*100).toFixed(2)}%</td><td>±${(pgCI99*100).toFixed(2)}%</td></tr>`;
    }
    if (cnt > 0) {
        const wAvgP = sumW > 0 ? sumWP / sumW : 0;
        const overallSE = calcWeightedSE_single(pages);
        const overallMDE = z * overallSE;
        const kEss = kishESS(pages);
        tbody += `<tr style="border-top:2px solid var(--accent-blue);font-weight:600;background:rgba(59,130,246,0.06);">
            <td>汇总</td>
            <td>${sumW.toFixed(3)}</td>
            <td>${(wAvgP*100).toFixed(1)}%</td>
            <td>${sumN.toLocaleString()}</td>
            <td class="highlight-cell">${kEss != null ? Math.round(kEss).toLocaleString() : '—'}</td>
            <td>±${(overallSE*100).toFixed(4)}%</td>
            <td class="highlight-cell">±${(overallMDE*100).toFixed(2)}%</td>
            <td>±${(calcCI(overallSE,0.90)*100).toFixed(2)}%</td>
            <td>±${(calcCI(overallSE,0.95)*100).toFixed(2)}%</td>
            <td>±${(calcCI(overallSE,0.99)*100).toFixed(2)}%</td>
        </tr>`;
    }
    document.getElementById('m2-tbody').innerHTML = tbody;
}

function renderMode2PageTable_AB(pages, alpha, power) {
    const z = getZ(alpha, power);
    document.getElementById('m2-page-title').style.display = pages.length ? 'flex' : 'none';
    document.getElementById('m2-table-container').style.display = pages.length ? 'block' : 'none';
    if (!pages.length) return;
    
    document.getElementById('m2-thead').innerHTML = `<tr>
        <th>${thTip('页面', 'LDBOM 页面标识：L/D/B/O/M。')}</th>
        <th>${thTip('权重 w', '该页对整体指标的权重，用于加权计算整体 MDE。')}</th>
        <th>${thTip('比例 pA', '该页 A 组（对照组）的预期比例。')}</th>
        <th>${thTip('样本量 nA', '该页 A 组的实际或计划样本量。')}</th>
        <th>${thTip('比例 pB', '该页 B 组（实验组）的预期比例。')}</th>
        <th>${thTip('样本量 nB', '该页 B 组的实际或计划样本量。')}</th>
        <th>${thTip('SE', '该页标准误：SE = √(pA(1-pA)/nA + pB(1-pB)/nB)。')}</th>
        <th>${thTip('页面MDE', '该页可检测的最小效应：MDE = Z·√(pA(1-pA)/nA + pB(1-pB)/nB)。')}</th>
    </tr>`;
    let tbody = '';
    for (const pg of pages) {
        const pgSE = calcSE_ab_proportion(pg.pA, pg.nA, pg.pB, pg.nB);
        const pgMDE = z * pgSE;
        tbody += `<tr><td>${pg.id}页</td><td>${pg.w.toFixed(3)}</td><td>${(pg.pA*100).toFixed(1)}%</td><td>${pg.nA.toLocaleString()}</td><td>${(pg.pB*100).toFixed(1)}%</td><td>${pg.nB.toLocaleString()}</td><td>±${(pgSE*100).toFixed(4)}%</td><td class="highlight-cell">±${(pgMDE*100).toFixed(2)}%</td></tr>`;
    }
    document.getElementById('m2-tbody').innerHTML = tbody;
}

function resetMode(mode) {
    if (mode === 1) {
        ['m1-p', 'm1-delta', 'm1-ab-pA', 'm1-ab-pB', 'm1-ab-delta', 'm1-ab-nA', 'm1-mean-delta', 'm1-mean-sigmaA', 'm1-mean-sigmaB', 'm1-mean-nA'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['m1-alpha', 'm1-ab-alpha', 'm1-mean-alpha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0.2'; });
        ['m1-power', 'm1-ab-power', 'm1-mean-power'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0.7'; });
        const kEl = document.getElementById('m1-k');
        if (kEl) { kEl.value = '1'; updateMetricInputs(); }
    } else {
        ['m2-p', 'm2-n', 'm2-ab-pA', 'm2-ab-pB', 'm2-ab-nA', 'm2-ab-nB', 'm2-mean-sigmaA', 'm2-mean-sigmaB', 'm2-mean-nA', 'm2-mean-nB'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['m2-alpha', 'm2-ab-alpha', 'm2-mean-alpha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0.2'; });
        ['m2-power', 'm2-ab-power', 'm2-mean-power'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0.7'; });
    }
    PAGES.forEach(p => {
        const pg = document.getElementById(`m${mode}-pg-${p}`);
        const cfg = document.getElementById(`m${mode}-cfg-${p}`);
        if (pg) pg.checked = false;
        if (cfg) cfg.classList.remove('active');
    });
    document.getElementById(`m${mode}-results`).classList.remove('visible');
    clearValidation(mode);
    setDownloadBtnVisible(mode, false);
    if (mode === 2) setM2PageCsvStatus('', '');
}

function initTableHeaderTooltips() {
    let tipEl = document.getElementById('float-tip');
    if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'float-tip';
        document.body.appendChild(tipEl);
    }

    function showFloatTip(target) {
        const text = target.getAttribute('data-tip');
        if (!text) return;
        tipEl.textContent = text;
        tipEl.style.display = 'block';

        const rect = target.getBoundingClientRect();
        const margin = 12;
        const gap = 8;
        const tw = tipEl.offsetWidth;
        const th = tipEl.offsetHeight;

        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.bottom + gap;

        if (left < margin) left = margin;
        if (left + tw > window.innerWidth - margin) left = window.innerWidth - tw - margin;
        if (top + th > window.innerHeight - margin) top = rect.top - th - gap;

        tipEl.style.left = left + 'px';
        tipEl.style.top = top + 'px';
    }

    function hideFloatTip() { tipEl.style.display = 'none'; }

    document.addEventListener('mouseover', e => {
        const t = e.target.closest('.results-table th .tooltip');
        if (t) showFloatTip(t);
    });
    document.addEventListener('mouseout', e => {
        const t = e.target.closest('.results-table th .tooltip');
        if (t && !t.contains(e.relatedTarget)) hideFloatTip();
    });
    window.addEventListener('scroll', hideFloatTip, true);
    window.addEventListener('resize', hideFloatTip);
}

document.addEventListener('DOMContentLoaded', () => { 
    updateInputVisibility();
    updateInfoBoxes(); 
    initPageConfigs();
    initTableHeaderTooltips();
    setupM2PageDropzone();
});

// 供 index.html inline onclick 使用
Object.assign(window, {
    switchScenario, switchMode, switchMetric, updateMetricInputs, updateBonferroniInfo,
    togglePage, applyPreset, downloadPageCsvTemplate, downloadCsv,
    calcMode1, calcMode2, resetMode, syncPageP,
});
