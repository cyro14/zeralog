// Buscador de capas verticais. Reúne candidatas de várias fontes e deixa você escolher:
//  - Wikipédia (EN/PT): capa do artigo do jogo (pageimages com licença "any")
//  - Steam: capa vertical 600x900, achada pelo link da loja que a RAWG informa
//  - SteamGridDB: capas da comunidade para qualquer plataforma (precisa de chave gratuita)
//  - RAWG: artes horizontais (último recurso)
import { searchGames, getGameStores, getGameDetails, coverToDataURL, esc } from './gameApi.js';

const SGDB_KEY = 'zeralog_sgdb_key';
export const getSgdbKey = () => { try { return (localStorage.getItem(SGDB_KEY) || '').trim(); } catch (e) { return ''; } };
export function saveSgdbKey(v) { try { v.trim() ? localStorage.setItem(SGDB_KEY, v.trim()) : localStorage.removeItem(SGDB_KEY); } catch (e) {} }

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const $ = id => document.getElementById(id);
let state = { onPick: null, rawgId: null, cands: [], token: 0 };

async function getJson(url, headers) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
        const res = await fetch(url, { signal: ctrl.signal, headers });
        if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
        return await res.json();
    } finally { clearTimeout(t); }
}

async function wikipedia(title) {
    const out = [];
    for (const [lang, hint, label] of [['en', 'video game', 'Wikipedia (EN)'], ['pt', 'jogo eletrônico', 'Wikipédia (PT)']]) {
        try {
            const q = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${title} ${hint}`, gsrlimit: 4, gsrnamespace: 0, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 500, pilicense: 'any', redirects: 1, format: 'json', formatversion: 2, origin: '*' });
            const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`);
            const pages = ((data.query && data.query.pages) || []).filter(p => p.thumbnail).sort((a, b) => a.index - b.index);
            const want = norm(title);
            pages.forEach(p => {
                const base = norm(p.title.replace(/\s*\([^)]*\)\s*$/, ''));
                if (base && want && (base.includes(want) || want.includes(base))) out.push({ url: p.thumbnail.source, source: label, label: p.title, vertical: p.thumbnail.height >= p.thumbnail.width });
            });
        } catch (e) { /* fonte indisponível: segue com as outras */ }
    }
    return out;
}

async function steam(title, rawgId) {
    let id = rawgId;
    if (!id) { const r = await searchGames(title, 1); id = r[0] && r[0].rawgId; }
    if (!id) return [];
    const stores = await getGameStores(id);
    const out = [];
    stores.forEach(s => {
        const m = String(s.url || '').match(/store\.steampowered\.com\/app\/(\d+)/);
        if (m) out.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${m[1]}/library_600x900.jpg`, source: 'Steam', label: 'Capa vertical 600×900', vertical: true });
    });
    return out;
}

async function sgdb(title) {
    const key = getSgdbKey();
    if (!key) return [];
    const headers = { Authorization: `Bearer ${key}` };
    const found = await getJson(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`, headers);
    const games = ((found && found.data) || []).slice(0, 2);
    const out = [];
    for (const g of games) {
        const grids = await getJson(`https://www.steamgriddb.com/api/v2/grids/game/${g.id}?dimensions=600x900,342x482&types=static&limit=6`, headers);
        ((grids && grids.data) || []).forEach(x => out.push({ url: x.url, thumb: x.thumb || x.url, source: 'SteamGridDB', label: g.name, vertical: true }));
    }
    return out;
}

async function rawgArt(title, rawgId) {
    let id = rawgId;
    if (!id) { const r = await searchGames(title, 1); id = r[0] && r[0].rawgId; }
    if (!id) return [];
    const d = await getGameDetails(id);
    return [d.image, d.imageExtra].filter(Boolean).map((url, i) => ({ url, source: 'RAWG', label: i ? 'Arte extra' : 'Arte principal', vertical: false }));
}

function paint() {
    const grid = $('cv-grid');
    grid.innerHTML = state.cands.map((c, i) => `
        <button type="button" class="cv-item ${c.vertical ? 'v' : 'h'}" data-i="${i}" title="${esc(c.source + ' · ' + c.label)}">
            <img src="${esc(c.thumb || c.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
            <span class="cv-src">${esc(c.source)}</span>
        </button>`).join('');
}

export async function coversSearch() {
    const title = $('cv-title').value.trim();
    if (!title) return;
    const token = ++state.token;
    state.cands = [];
    paint();
    const status = $('cv-status');
    status.textContent = 'Procurando capas...';
    const key = !!getSgdbKey();
    $('cv-hint').textContent = key ? '' : 'Dica: com uma chave gratuita do SteamGridDB (Configurações) aparecem capas verticais de qualquer plataforma, inclusive consoles.';
    const sources = [wikipedia(title), steam(title, state.rawgId), sgdb(title), rawgArt(title, state.rawgId)];
    let pending = sources.length;
    const failures = [];
    sources.forEach((p, idx) => p.then(list => {
        if (token !== state.token) return;
        state.cands.push(...list);
        state.cands.sort((a, b) => Number(b.vertical) - Number(a.vertical));
        paint();
    }).catch(() => { failures.push(idx); }).finally(() => {
        if (token !== state.token) return;
        if (--pending === 0) {
            status.textContent = state.cands.length
                ? 'Toque na capa que você quer usar.'
                : 'Nenhuma capa encontrada. Tente outro nome (em inglês costuma ajudar) ou envie uma foto.';
            if (failures.includes(2) && key) status.textContent += ' O SteamGridDB não respondeu (chave inválida ou acesso bloqueado pelo navegador).';
        }
    }));
}

export function openCoverPicker({ title, rawgId, onPick }) {
    state = { onPick, rawgId: rawgId || null, cands: [], token: 0 };
    $('cv-title').value = title || '';
    $('cv-grid').innerHTML = '';
    $('cv-status').textContent = '';
    $('cv-hint').textContent = '';
    $('modal-covers').showModal();
    if (title) coversSearch();
}

async function pick(i) {
    const c = state.cands[i];
    if (!c || !state.onPick) return;
    $('cv-status').textContent = 'Baixando e reduzindo a capa...';
    const data = await coverToDataURL(c.url);
    $('modal-covers').close();
    state.onPick(data);
}

function init() {
    const grid = $('cv-grid');
    if (!grid) return;
    grid.addEventListener('click', e => { const b = e.target.closest('.cv-item'); if (b) pick(+b.dataset.i); });
    grid.addEventListener('error', e => { const b = e.target.closest && e.target.closest('.cv-item'); if (b && e.target.tagName === 'IMG') b.remove(); }, true);   // imagem quebrada some da grade
    $('cv-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); coversSearch(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
