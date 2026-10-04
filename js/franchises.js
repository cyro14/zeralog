// Franquias: progresso, lista de jogos (sanfona) e sugestão de mais jogos da série via RAWG.
import { appData } from './store.js';
import { esc, searchGames, getGameSeries, resizeUrl, describeError } from './gameApi.js';
import { icon } from './icons.js';
import { platformLabel } from './platforms.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let openKey = null;              // franquia aberta (uma por vez)
const suggestions = new Map();   // key -> { status, items, msg }

export function getFranchiseStats() {
    const map = new Map();
    const touch = name => {
        const k = norm(name);
        if (!map.has(k)) map.set(k, { key: k, name: name.trim(), total: 0, done: 0, playing: 0, wish: 0, games: [], wishItems: [] });
        return map.get(k);
    };
    appData.games.forEach(g => {
        if (g.continuous || !g.franchise || !g.franchise.trim()) return;
        const f = touch(g.franchise);
        f.total++; f.games.push(g);
        if (g.state === 'finished') f.done++;
        if (g.state === 'playing') f.playing++;
    });
    (appData.wishlist || []).forEach(w => {
        if (!w.franchise || !w.franchise.trim()) return;
        const f = touch(w.franchise);
        f.wish++; f.wishItems.push(w);
    });
    const pct = f => f.total ? f.done / f.total : 0;
    return [...map.values()].sort((a, b) => pct(b) - pct(a) || b.total - a.total || a.name.localeCompare(b.name));
}

const statusOf = g => g.state === 'finished' ? ['Zerado', 'ok'] : g.state === 'playing' ? ['Jogando', 'play'] : ['Na fila', ''];

function gameRow(g) {
    const [label, cls] = statusOf(g);
    const thumb = g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : `<span>${esc((g.title.trim()[0] || '?').toUpperCase())}</span>`;
    const meta = [g.platform ? platformLabel(g.platform) : '', g.released ? esc(g.released.slice(0, 4)) : ''].filter(Boolean).join(' · ');
    return `<li class="fr-game" data-act="game" data-id="${esc(g.id)}" role="button" tabindex="0">
        <span class="fr-thumb">${thumb}</span>
        <span class="fr-info"><strong>${esc(g.title)}</strong><small>${meta}</small></span>
        <span class="fr-tags">${g.userRating && g.state === 'finished' ? `<span class="chip chip-gold">${esc(g.userRating)}</span>` : ''}<span class="chip fr-st ${cls}">${label}</span></span>
    </li>`;
}

function wishRow(w) {
    const thumb = w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy">` : `<span>${esc((w.title.trim()[0] || '?').toUpperCase())}</span>`;
    return `<li class="fr-game" data-act="wishitem" data-id="${esc(w.id)}" role="button" tabindex="0">
        <span class="fr-thumb">${thumb}</span>
        <span class="fr-info"><strong>${esc(w.title)}</strong><small>${w.platform ? platformLabel(w.platform) : ''}</small></span>
        <span class="fr-tags"><span class="chip fr-st wish">Desejo</span></span>
    </li>`;
}

function suggestionHtml(k) {
    const s = suggestions.get(k);
    if (!s) return '';
    if (s.status === 'loading') return '<div class="rawg-msg">Procurando mais jogos da série...</div>';
    if (s.status === 'error') return `<div class="rawg-msg rawg-err">${esc(s.msg)}</div>`;
    if (!s.items.length) return '<div class="rawg-msg">Nenhum jogo novo encontrado para essa franquia. Tente adicionar manualmente.</div>';
    return `<div class="fr-sug-title">Toque em um jogo para adicionar</div><ul class="fr-sug-list">${s.items.map((it, i) => `
        <li class="fr-sug" data-act="add" data-i="${i}" role="button" tabindex="0">
            <span class="fr-thumb">${it.image ? `<img src="${esc(resizeUrl(it.image, 200))}" alt="" loading="lazy">` : '<span>?</span>'}</span>
            <span class="fr-info"><strong>${esc(it.title)}</strong><small>${[it.released ? it.released.slice(0, 4) : '', (it.genres || []).slice(0, 2).join(', ')].filter(Boolean).map(esc).join(' · ')}</small></span>
            <button type="button" class="pill-btn" data-act="wish" data-i="${i}">+ Desejo</button>
        </li>`).join('')}</ul>`;
}

function panelHtml(f) {
    const rows = f.games.map(gameRow).join('') + f.wishItems.map(wishRow).join('');
    return `<div class="fr-panel">
        ${rows ? `<ul class="fr-games">${rows}</ul>` : '<div class="rawg-msg">Nenhum jogo cadastrado nessa franquia ainda.</div>'}
        <div class="fr-actions">
            <button type="button" class="pill-btn primary" data-act="search">Procurar mais jogos</button>
            <button type="button" class="pill-btn" data-act="filter">Ver na lista</button>
        </div>
        <div class="fr-suggest">${suggestionHtml(f.key)}</div>
    </div>`;
}

export function renderFranchiseStats() {
    const box = document.getElementById('franchise-stats');
    const sum = document.getElementById('franchise-summary');
    if (!box || !sum) return;
    const stats = getFranchiseStats();
    const nav = document.getElementById('sn-franchises');
    if (nav) nav.textContent = stats.length || '';
    if (openKey && !stats.some(f => f.key === openKey)) openKey = null;
    if (!stats.length) {
        sum.textContent = 'Defina a franquia dos jogos (ex.: Zelda, Metroid, Dark Souls) para acompanhar o progresso de cada coleção.';
        box.innerHTML = '';
        return;
    }
    const withGames = stats.filter(f => f.total > 0);
    const totalAll = withGames.reduce((a, f) => a + f.total, 0);
    const doneAll = withGames.reduce((a, f) => a + f.done, 0);
    const complete = withGames.filter(f => f.done === f.total).length;
    sum.innerHTML = `Progresso geral nas franquias: <strong>${totalAll ? Math.round(doneAll / totalAll * 100) : 0}%</strong> &nbsp;·&nbsp; Franquias completas: <strong>${complete} de ${withGames.length}</strong>`;
    box.innerHTML = stats.map(f => {
        const p = f.total ? Math.round(f.done / f.total * 100) : 0;
        const full = f.total >= 2 && f.done === f.total;
        const isOpen = f.key === openKey;
        const extra = [f.playing ? `${f.playing} jogando` : '', f.wish ? `+${f.wish} na wishlist` : ''].filter(Boolean).join(' · ');
        return `<div class="fr-item ${full ? 'complete' : ''} ${isOpen ? 'open' : ''}" data-key="${esc(f.key)}">
            <button type="button" class="fr-toggle" data-act="toggle" aria-expanded="${isOpen}">
                <span class="fr-head"><strong>${esc(f.name)}${full ? '<span class="fr-done">Completa</span>' : ''}</strong><span>${f.total ? `${f.done}/${f.total} · ${p}%` : 'só na wishlist'}</span></span>
                <span class="fr-chevron">${icon('chevron', { size: '1em' })}</span>
            </button>
            <div class="gi-bar"><span style="width:${p}%"></span></div>
            ${extra ? `<small class="fr-extra">${esc(extra)}</small>` : ''}
            ${isOpen ? panelHtml(f) : ''}
        </div>`;
    }).join('');
}

async function search(k) {
    const f = getFranchiseStats().find(x => x.key === k);
    if (!f) return;
    suggestions.set(k, { status: 'loading' });
    renderFranchiseStats();
    try {
        const ids = f.games.map(g => g.rawgId).filter(Boolean).slice(0, 2);
        const [series, found] = await Promise.all([
            Promise.all(ids.map(id => getGameSeries(id).catch(() => []))).then(r => r.flat()),
            searchGames(f.name, 15)
        ]);
        const have = new Set([...appData.games, ...(appData.wishlist || [])].map(g => norm(g.title)));
        const haveIds = new Set([...appData.games, ...(appData.wishlist || [])].map(g => g.rawgId).filter(Boolean));
        const seen = new Set();
        const items = [...series, ...found.filter(x => norm(x.title).includes(f.key))].filter(x => {
            if (seen.has(x.rawgId) || haveIds.has(x.rawgId) || have.has(norm(x.title))) return false;
            seen.add(x.rawgId);
            return true;
        }).slice(0, 15);
        suggestions.set(k, { status: 'done', items });
    } catch (e) {
        console.error(e);
        suggestions.set(k, { status: 'error', msg: describeError(e) });
    }
    if (openKey === k) renderFranchiseStats();
}

function onAction(t, ev) {
    const item = t.closest('.fr-item');
    const k = item && item.dataset.key;
    switch (t.dataset.act) {
        case 'toggle': openKey = openKey === k ? null : k; renderFranchiseStats(); break;
        case 'game': window.openShelfDetail(t.dataset.id); break;
        case 'wishitem': window.openEditWishModal(t.dataset.id); break;
        case 'search': search(k); break;
        case 'filter': { const f = getFranchiseStats().find(x => x.key === k); if (f) window.filterByFranchise(f.name); break; }
        case 'add': case 'wish': {
            const f = getFranchiseStats().find(x => x.key === k);
            const s = suggestions.get(k);
            const it = s && s.items && s.items[+t.dataset.i];
            if (f && it) window.openAddFromSuggestion(t.dataset.act === 'wish' ? 'wish' : 'game', it, f.name);
            break;
        }
    }
}

function init() {
    const box = document.getElementById('franchise-stats');
    if (!box) return;
    box.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && box.contains(t)) onAction(t, e); });
    box.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-act]')) { e.preventDefault(); onAction(e.target, e); }
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
