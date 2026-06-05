(function () {
    const script = document.currentScript;
    const pageId = script?.dataset.page || 'home';
    const base = script?.dataset.base || '';
    const jsonUrl = base + 'assets/changelog.json';

    let data = null;

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderGroups(groups, useScopeLabel, scopeLabel) {
        if (useScopeLabel) {
            const items = groups.flatMap(g => g.items);
            if (!items.length) return '';
            return `<div class="changelog-group">
                <div class="changelog-group-label">${esc(scopeLabel)}</div>
                <ul class="changelog-list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>`;
        }
        return groups.map(g => `<div class="changelog-group">
            <div class="changelog-group-label">${esc(g.group)}</div>
            <ul class="changelog-list">${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>`).join('');
    }

    function getReleasesForPage() {
        if (!data?.releases) return [];
        const isHome = pageId === 'home';
        return data.releases.filter(rel => {
            const changes = rel.changes || {};
            if (isHome) {
                return Object.keys(changes).some(k => changes[k]?.length);
            }
            return changes[pageId]?.length;
        });
    }

    function renderRelease(rel) {
        const changes = rel.changes || {};
        const isHome = pageId === 'home';
        let groupsHtml = '';

        if (isHome) {
            for (const [scope, groups] of Object.entries(changes)) {
                if (!groups?.length) continue;
                const label = data.scopes?.[scope] || scope;
                groupsHtml += renderGroups(groups, true, label);
            }
        } else {
            groupsHtml = renderGroups(changes[pageId] || [], false);
        }

        if (!groupsHtml) return '';
        return `<div class="changelog-version">
            <div class="changelog-version-header">
                <span class="changelog-ver-tag">${esc(rel.version)}</span>
                <span class="changelog-date">${esc(rel.date)}</span>
            </div>
            ${groupsHtml}
        </div>`;
    }

    function renderChangelog() {
        const body = document.getElementById('changelog-body');
        if (!body) return;
        const html = getReleasesForPage().map(renderRelease).filter(Boolean).join('');
        body.innerHTML = html || '<div class="changelog-empty">暂无更新记录</div>';
    }

    function updateWatermark() {
        const btn = document.getElementById('changelog-watermark');
        if (btn && data?.version) {
            btn.textContent = `URS数据科学团队 © 2026 | ${data.version}`;
        }
    }

    function updateTitle() {
        const el = document.getElementById('changelog-title');
        if (!el) return;
        const name = pageId === 'home'
            ? 'URS DS Tools'
            : (data?.scopes?.[pageId] || pageId);
        el.textContent = `📋 更新日志 · ${name}`;
    }

    async function loadData() {
        try {
            const res = await fetch(jsonUrl);
            if (!res.ok) throw new Error(res.statusText);
            data = await res.json();
            updateWatermark();
            updateTitle();
            renderChangelog();
        } catch (e) {
            console.error('Changelog load failed:', e);
            const body = document.getElementById('changelog-body');
            if (body) body.innerHTML = '<div class="changelog-empty">更新日志加载失败</div>';
        }
    }

    window.openChangelog = function () {
        document.getElementById('changelog-overlay')?.classList.add('open');
        document.body.style.overflow = 'hidden';
    };
    window.closeChangelog = function () {
        document.getElementById('changelog-overlay')?.classList.remove('open');
        document.body.style.overflow = '';
    };
    window.closeChangelogOnOverlay = function (e) {
        if (e.target.id === 'changelog-overlay') closeChangelog();
    };

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeChangelog(); });
    document.addEventListener('DOMContentLoaded', loadData);
})();
