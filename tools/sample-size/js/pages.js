/**
 * LDBOM 分页面常量与 CSV 解析（无 DOM 依赖部分）
 */

export const PAGES = ['L', 'D', 'B', 'O', 'M'];

export const PAGE_NAMES = {
    L: 'List 列表页',
    D: 'Detail 详情页',
    B: 'Booking 预订页',
    O: 'Order 订单页',
    M: 'Message 订后短信',
};

export const PAGE_CSV_SAMPLE = [
    { page_id: 'L', w: 0.20, p: 70, n: 4000 },
    { page_id: 'D', w: 0.25, p: 72, n: 3500 },
    { page_id: 'B', w: 0.25, p: 68, n: 5200 },
    { page_id: 'O', w: 0.20, p: 75, n: 2800 },
    { page_id: 'M', w: 0.10, p: 65, n: 1500 },
];

export function normalizePageId(raw, pages = PAGES) {
    const s = String(raw || '').trim().toUpperCase();
    if (pages.includes(s)) return s;
    const first = s.charAt(0);
    if (pages.includes(first)) return first;
    return null;
}

export function parsePageCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split('\n')
        .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
    if (!lines.length) return [];

    const splitLine = l => l.split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
    const header = splitLine(lines[0]).map(h => h.toLowerCase());
    const alias = {
        page_id: ['page_id', 'page', 'id', '页面', '页面id', '页面_id'],
        w: ['w', 'weight', '权重', '页面权重'],
        p: ['p', 'proportion', 'rate', '预期比例', '比例'],
        n: ['n', 'sample', 'samples', '样本量', '实际样本量', '样本'],
    };
    const findIdx = keys => {
        for (const k of keys) {
            const i = header.indexOf(k);
            if (i !== -1) return i;
        }
        return -1;
    };
    const needed = ['page_id', 'w', 'p', 'n'];
    const idx = {};
    needed.forEach(k => { idx[k] = findIdx(alias[k]); });
    const headerMatched = needed.every(k => idx[k] !== -1);

    let dataLines = lines;
    if (headerMatched) {
        dataLines = lines.slice(1);
    } else {
        needed.forEach((k, i) => { idx[k] = i; });
        const firstCells = splitLine(lines[0]);
        if (normalizePageId(firstCells[0]) === null) dataLines = lines.slice(1);
    }

    const out = [];
    dataLines.forEach(line => {
        const cells = splitLine(line);
        const obj = {};
        for (const k of needed) {
            const i = idx[k];
            obj[k] = (i !== -1 && cells[i] !== undefined) ? cells[i] : '';
        }
        if (obj.page_id !== '' || obj.w !== '' || obj.p !== '' || obj.n !== '') out.push(obj);
    });
    return out;
}

/**
 * 校验 CSV 行数据，返回 { ok: true, rows } 或 { ok: false, message }
 */
export function validatePageCsvRows(rows, pages = PAGES) {
    const seen = new Set();
    const validRows = [];

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const pageId = normalizePageId(r.page_id, pages);
        if (!pageId) {
            return { ok: false, message: `第 ${i + 1} 行页面 ID「${r.page_id}」无效，请使用 L/D/B/O/M` };
        }
        if (seen.has(pageId)) {
            return { ok: false, message: `页面 ${pageId} 在 CSV 中重复出现` };
        }
        const w = parseFloat(r.w);
        const p = parseFloat(r.p);
        const n = parseInt(r.n, 10);
        if (!(w > 0)) {
            return { ok: false, message: `第 ${i + 1} 行（${pageId}）的权重无效，需为正数` };
        }
        if (!(p > 0 && p < 100)) {
            return { ok: false, message: `第 ${i + 1} 行（${pageId}）的预期比例无效，需在 0–100% 之间` };
        }
        if (!(n > 0)) {
            return { ok: false, message: `第 ${i + 1} 行（${pageId}）的样本量无效，需为正整数` };
        }
        seen.add(pageId);
        validRows.push({ pageId, w, p, n });
    }

    if (!validRows.length) {
        return { ok: false, message: '未在文件中找到有效数据行' };
    }
    return { ok: true, rows: validRows };
}

export function buildPageCsvTemplate(sample = PAGE_CSV_SAMPLE) {
    return 'page_id,w,p,n\n' + sample.map(r => `${r.page_id},${r.w},${r.p},${r.n}`).join('\n') + '\n';
}
