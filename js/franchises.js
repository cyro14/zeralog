// Franquias: progresso, lista de jogos (sanfona) e sugestão de mais jogos da série via RAWG.
import { appData, saveData } from './store.js';
import { esc, searchGames, searchFranchiseGames, getGameSeries, resizeUrl, describeError } from './gameApi.js';
import { autoVerticalCover } from './covers.js';
import { icon } from './icons.js';
import { platformLabel } from './platforms.js';
import { openShare } from './share.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let openKey = null;              // franquia aberta (uma por vez)
const suggestions = new Map();   // key -> { status, items, msg }

export function getFranchiseStats() {
    const map = new Map();
    const touch = name => {
        const k = norm(name);
        if (!map.has(k)) map.set(k, { key: k, name: name.trim(), total: 0, done: 0, playing: 0, wish: 0, games: [], wishItems: [], earliestReleased: null, earliestGame: null });
        return map.get(k);
    };
    appData.games.forEach(g => {
        if (g.continuous || !g.franchise || !g.franchise.trim()) return;
        const f = touch(g.franchise);
        f.total++; f.games.push(g);
        if (g.state === 'finished') f.done++;
        if (g.state === 'playing') f.playing++;
        // Track the game with the earliest release date in this franchise
        if (!f.earliestGame || (g.released && g.released < f.earliestGame.released)) {
            f.earliestGame = g;
            f.earliestReleased = g.released || null;
        }
    });
    (appData.wishlist || []).forEach(w => {
        if (!w.franchise || !w.franchise.trim()) return;
        const f = touch(w.franchise);
        f.total++;   // o total da franquia conta também os jogos que estão na wishlist
        f.wish++; f.wishItems.push(w);
    });
    // Ordenar jogos de cada franquia pela data de lançamento (mais antigo primeiro)
    map.forEach(f => {
        f.games.sort((a, b) => {
            const aDate = a.released || '';
            const bDate = b.released || '';
            if (aDate && bDate) return aDate.localeCompare(bDate);
            if (aDate && !bDate) return -1;
            if (!aDate && bDate) return 1;
            return 0;
        });
        // wishItems mantêm ordem de adição
    });
    const pct = f => f.total ? f.done / f.total : 0;
    // Ordenar franças pelas datas de lançamento mais antigas primeiro, depois por percentual de conclusão, total de jogos e nome
    return [...map.values()].sort((a, b) => {
        const aDate = a.earliestReleased || '';
        const bDate = b.earliestReleased || '';
        if (aDate && bDate) {
            return aDate.localeCompare(bDate);
        }
        return pct(b) - pct(a) || b.total - a.total || a.name.localeCompare(b.name);
    });
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

const SUG_PAGE = 6;   // quantos jogos novos aparecem por página

function suggestionHtml(k) {
    const s = suggestions.get(k);
    if (!s) return '';
    if (s.status === 'loading') return '<div class="rawg-msg">Procurando mais jogos da série...</div>';
    if (s.status === 'error') return `<div class="rawg-msg rawg-err">${esc(s.msg)}</div>`;
    if (!s.items.length) return '<div class="rawg-msg">Nenhum jogo novo encontrado para essa franquia. Tente adicionar manualmente.</div>';
    const pages = Math.max(1, Math.ceil(s.items.length / SUG_PAGE));
    const page = Math.min(s.page || 0, pages - 1);
    const slice = s.items.slice(page * SUG_PAGE, (page + 1) * SUG_PAGE);
    const nav = (pages > 1 || s.more) ? `<div class="fr-sug-nav">
        <button type="button" class="pill-btn" data-act="sugprev" ${page === 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
        <small>${page + 1}/${s.more ? pages + '…' : pages}</small>
        <button type="button" class="pill-btn" data-act="sugnext" ${(!s.more && page >= pages - 1) ? 'disabled' : ''} aria-label="Próxima página">›</button>
    </div>` : '';
    return `<div class="fr-sug-title">Toque em um jogo para adicionar</div><ul class="fr-sug-list">${slice.map((it, i) => `
        <li class="fr-sug" data-act="add" data-i="${page * SUG_PAGE + i}" role="button" tabindex="0">
            <span class="fr-thumb">${it.image ? `<img src="${esc(resizeUrl(it.image, 200))}" alt="" loading="lazy">` : '<span>?</span>'}</span>
            <span class="fr-info"><strong>${esc(it.title)}</strong><small>${[it.released ? it.released.slice(0, 4) : '', (it.genres || []).slice(0, 2).join(', ')].filter(Boolean).map(esc).join(' · ')}</small></span>
            <button type="button" class="pill-btn" data-act="wish" data-i="${page * SUG_PAGE + i}">+ Desejo</button>
        </li>`).join('')}</ul>${nav}`;
}

function panelHtml(f) {
    const rows = f.games.map(gameRow).join('') + f.wishItems.map(wishRow).join('');
    return `<div class="fr-panel">
        ${rows ? `<ul class="fr-games">${rows}</ul>` : '<div class="rawg-msg">Nenhum jogo cadastrado nessa franquia ainda.</div>'}
        <div class="fr-actions">
            <button type="button" class="pill-btn primary" data-act="search">Procurar mais jogos</button>
            <button type="button" class="pill-btn" data-act="filter">Ver na lista</button>
            <button type="button" class="pill-btn fr-share" data-act="share">${icon('share2', { size: '1em' })} Compartilhar</button>
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
    sum.innerHTML = `<span>Progresso geral nas franquias: <strong>${totalAll ? Math.round(doneAll / totalAll * 100) : 0}%</strong></span><span>Franquias completas: <strong>${complete} de ${withGames.length}</strong></span>`;
    box.innerHTML = stats.map(f => {
        const p = f.total ? Math.round(f.done / f.total * 100) : 0;
        const full = f.total >= 2 && f.done === f.total;
        const isOpen = f.key === openKey;
        const extra = [f.playing ? `${f.playing} jogando` : '', f.wish ? `+${f.wish} na wishlist` : ''].filter(Boolean).join(' · ');
        return `<div class="fr-item ${full ? 'complete' : ''} ${isOpen ? 'open' : ''}" data-key="${esc(f.key)}">
            <button type="button" class="fr-toggle" data-act="toggle" aria-expanded="${isOpen}">
                <span class="fr-head">
                    ${f.earliestGame && f.earliestGame.image ? `<span class="fr-cover"><img src="${esc(resizeUrl(f.earliestGame.image, 80))}" alt="${esc(f.name)} cover" loading="lazy"></span>` : ''}
                    <strong>${esc(f.name)}${full ? '<span class="fr-done">Completa</span>' : ''}</strong>
                    <span>${f.total ? `${f.done}/${f.total} · ${p}%` : 'só na wishlist'}</span>
                </span>
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
            searchFranchiseGames(f.name, 1, 10)   // exclude_additions: sem DLCs/complementos
        ]);
        const have = new Set([...appData.games, ...(appData.wishlist || [])].map(g => norm(g.title)));
        const haveIds = new Set([...appData.games, ...(appData.wishlist || [])].map(g => g.rawgId).filter(Boolean));
        const seen = new Set();
        const keep = x => {
            if (!x || seen.has(x.rawgId) || haveIds.has(x.rawgId) || have.has(norm(x.title))) return false;
            seen.add(x.rawgId);
            return true;
        };
        const items = [...series.filter(keep), ...(found.items || []).filter(x => norm(x.title).includes(f.key)).filter(keep)];
        suggestions.set(k, { status: 'done', items, page: 0, rawgPage: 1, more: !!found.more });
    } catch (e) {
        console.error(e);
        suggestions.set(k, { status: 'error', msg: describeError(e) });
    }
    if (openKey === k) renderFranchiseStats();
}

// Paginação das sugestões: avança nas já carregadas e baixa mais páginas da RAWG quando precisa
async function sugPage(k, dir) {
    const s = suggestions.get(k);
    if (!s || s.status !== 'done') return;
    const next = (s.page || 0) + dir;
    if (next < 0) return;
    const totalPages = Math.ceil(s.items.length / SUG_PAGE);
    if (next >= totalPages) {
        if (!s.more || s.loadingMore) return;
        const f = getFranchiseStats().find(x => x.key === k);
        if (!f) return;
        s.loadingMore = true;
        renderFranchiseStats();
        try {
            const more = await searchFranchiseGames(f.name, s.rawgPage + 1, 10);
            const have = new Set([...appData.games, ...(appData.wishlist || [])].map(g => norm(g.title)));
            const haveIds = new Set([...appData.games, ...(appData.wishlist || [])].map(g => g.rawgId).filter(Boolean));
            const seen = new Set(s.items.map(x => x.rawgId));
            const fresh = (more.items || []).filter(x => norm(x.title).includes(f.key) && !seen.has(x.rawgId) && !haveIds.has(x.rawgId) && !have.has(norm(x.title)));
            s.items = s.items.concat(fresh);
            s.rawgPage++;
            s.more = !!more.more;
            s.loadingMore = false;
        } catch (e) { s.loadingMore = false; }
    }
    s.page = next;
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
        case 'sugprev': sugPage(k, -1); break;
        case 'sugnext': sugPage(k, 1); break;
        case 'filter': { const f = getFranchiseStats().find(x => x.key === k); if (f) window.filterByFranchise(f.name); break; }
        case 'share': {
            const f = getFranchiseStats().find(x => x.key === k);
            if (!f) break;
            // Zerados primeiro (coloridos); o resto (jogando, fila e desejos) sai em tom de cinza
            const games = [...f.games].sort((a, b) => (b.state === 'finished') - (a.state === 'finished'));
            const items = [...games, ...f.wishItems];
            if (!items.length) break;
            const pct = f.total ? Math.round(f.done / f.total * 100) : 0;
            const sub = f.total ? `${f.done} de ${f.total} zerados · ${pct}%${f.wish ? ` · ${f.wish} na wishlist` : ''}` : 'Jogos que ainda faltam na coleção';
            openShare({ items, mode: 'franchise', title: `Franquia ${f.name}`, subtitle: sub, style: 'shelf', gray: 'todo' });
            break;
        }
        case 'add': {
            const f = getFranchiseStats().find(x => x.key === k);
            const s = suggestions.get(k);
            const it = s && s.items && s.items[+t.dataset.i];
            if (f && it) window.openAddFromSuggestion('game', it, f.name);
            break;
        }
        case 'wish': {
            // Cadastro direto, estilo GameMatch: entra na wishlist já com a franquia
            // e na mesma categoria dos outros jogos da franquia (abertas pelo usuário no filtro depois)
            const f = getFranchiseStats().find(x => x.key === k);
            const s = suggestions.get(k);
            const it = s && s.items && s.items[+t.dataset.i];
            if (!f || !it) break;
            if (appData.wishlist.some(w => norm(w.title) === norm(it.title))) { window.triggerToast && window.triggerToast('Esse jogo já está na wishlist.'); break; }
            const counts = {};
            f.games.forEach(g => { if (g.catId) counts[g.catId] = (counts[g.catId] || 0) + 1; });
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            const catId = best ? best[0] : (appData.categories[0] && appData.categories[0].id) || '';
            const item = {
                id: 'w' + Date.now(), title: it.title, platform: (it.platforms && it.platforms[0]) || '',
                rawgId: it.rawgId, genres: it.genres || [], released: it.released || '', tba: !!it.tba,
                metacritic: it.metacritic || null, image: resizeUrl(it.image, 640) || null, wideCover: true,
                catId, franchise: f.name, note: `Sugestão da franquia ${f.name}`, addedAt: Date.now(), notifyRelease: false
            };
            appData.wishlist.push(item);
            saveData();
            window.triggerToast && window.triggerToast(`${it.title} adicionado à wishlist na franquia ${f.name}!`);
            // some da lista de sugestões e tenta trocar a arte pela capa retrato
            s.items.splice(+t.dataset.i, 1);
            autoVerticalCover(it.title, it.rawgId).then(r => { if (r && r.data) { item.image = r.data; item.wideCover = false; saveData(); } }).catch(() => {});
            renderFranchiseStats();
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
