// Capas verticais. Duas formas de uso:
//  1) automática: autoVerticalCover() tenta Steam (capa 600x900) e Wikipédia (capa do artigo);
//  2) manual: o buscador mostra as candidatas e, se a escolhida for horizontal, abre o recorte.
// Fontes sem chave: Wikipédia (pageimages, licença "any"), Steam (via link da loja na RAWG) e artes da RAWG.
import { searchGames, getGameStores, getGameDetails, fetchImageBlob, blobToSmallJpeg, imageSize, isVerticalSize, esc } from './gameApi.js';
import { openCropper } from './crop.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const $ = id => document.getElementById(id);
let state = { onPick: null, rawgId: null, cands: [], token: 0 };

async function getJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
        return await res.json();
    } finally { clearTimeout(t); }
}

async function wikipedia(title) {
    const out = [];
    for (const [lang, hint, label] of [['en', 'video game', 'Wikipedia (EN)'], ['pt', 'jogo eletrônico', 'Wikipédia (PT)']]) {
        try {
            const q = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${title} ${hint}`, gsrlimit: 4, gsrnamespace: 0, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 600, pilicense: 'any', redirects: 1, format: 'json', formatversion: 2, origin: '*' });
            const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`);
            const pages = ((data.query && data.query.pages) || []).filter(p => p.thumbnail).sort((a, b) => a.index - b.index);
            const want = norm(title);
            pages.forEach(p => {
                const base = norm(p.title.replace(/\s*\([^)]*\)\s*$/, ''));
                if (base && want && (base.includes(want) || want.includes(base))) out.push({ url: p.thumbnail.source, source: label, label: p.title, vertical: p.thumbnail.height >= p.thumbnail.width * 1.1 });
            });
        } catch (e) { /* fonte indisponível: segue com as outras */ }
    }
    return out;
}

// Acha o jogo na RAWG com cuidado para não pegar um homônimo
async function findRawgId(title, rawgId) {
    if (rawgId) return rawgId;
    const res = await searchGames(title, 5);
    const want = norm(title);
    const hit = res.find(r => norm(r.title) === want) || res.find(r => norm(r.title).startsWith(want));
    return hit ? hit.rawgId : null;
}

async function steam(title, rawgId) {
    const id = await findRawgId(title, rawgId);
    if (!id) return { id: null, list: [] };
    const stores = await getGameStores(id);
    const list = [];
    stores.forEach(s => {
        const m = String(s.url || '').match(/store\.steampowered\.com\/app\/(\d+)/);
        if (m) list.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${m[1]}/library_600x900.jpg`, source: 'Steam', label: 'Capa vertical 600×900', vertical: true });
    });
    return { id, list };
}

async function rawgArt(title, rawgId) {
    const id = await findRawgId(title, rawgId);
    if (!id) return [];
    const d = await getGameDetails(id);
    return [d.image, d.imageExtra].filter(Boolean).map((url, i) => ({ url, source: 'RAWG', label: i ? 'Arte extra' : 'Arte principal', vertical: false }));
}

// ---------- automático: sempre tenta a capa vertical ----------
// Retorna { data (JPEG pequeno), source, rawgId } ou null
export async function autoVerticalCover(title, rawgId) {
    if (!title) return null;
    let id = rawgId || null;
    const cands = [];
    const [st, wp] = await Promise.allSettled([steam(title, rawgId), wikipedia(title)]);
    if (st.status === 'fulfilled') { id = st.value.id || id; cands.push(...st.value.list); }
    if (wp.status === 'fulfilled') cands.push(...wp.value.filter(c => c.vertical));
    for (const c of cands) {
        const blob = await fetchImageBlob(c.url);
        if (!blob) continue;
        const size = await imageSize(blob);
        if (!isVerticalSize(size)) continue;
        try { return { data: await blobToSmallJpeg(blob), source: c.source, rawgId: id }; } catch (e) { /* tenta a próxima */ }
    }
    return null;
}

// ---------- em lote: biblioteca inteira ----------
let batchStop = false;
export const stopCoverUpgrade = () => { batchStop = true; };

export async function upgradeAllCovers({ games, onProgress, onGame }) {
    batchStop = false;
    const todo = [];
    for (const g of games) {
        if (g.image) { const size = await imageSize(g.image); if (isVerticalSize(size)) continue; }
        todo.push(g);
    }
    let done = 0, updated = 0;
    for (const g of todo) {
        if (batchStop) break;
        onProgress && onProgress({ done, total: todo.length, title: g.title, updated });
        try {
            const r = await autoVerticalCover(g.title, g.rawgId);
            if (r) { onGame(g, r); updated++; }
        } catch (e) { /* segue para o próximo */ }
        done++;
        await new Promise(res => setTimeout(res, 250));   // não sobrecarrega as APIs
    }
    onProgress && onProgress({ done, total: todo.length, title: '', updated, finished: true, stopped: batchStop });
    return { total: todo.length, updated, stopped: batchStop };
}

// ---------- buscador manual ----------
function paint() {
    $('cv-grid').innerHTML = state.cands.map((c, i) => `
        <button type="button" class="cv-item ${c.vertical ? 'v' : 'h'}" data-i="${i}" title="${esc(c.source + ' · ' + c.label)}">
            <img src="${esc(c.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
            <span class="cv-src">${esc(c.source)}${c.vertical ? '' : ' · recortar'}</span>
        </button>`).join('');
}

export async function coversSearch() {
    const title = $('cv-title').value.trim();
    if (!title) return;
    const token = ++state.token;
    state.cands = [];
    paint();
    $('cv-status').textContent = 'Procurando capas...';
    const sources = [wikipedia(title), steam(title, state.rawgId).then(r => r.list), rawgArt(title, state.rawgId)];
    let pending = sources.length;
    sources.forEach(p => p.then(list => {
        if (token !== state.token) return;
        state.cands.push(...list);
        state.cands.sort((a, b) => Number(b.vertical) - Number(a.vertical));
        paint();
    }).catch(() => {}).finally(() => {
        if (token !== state.token) return;
        if (--pending === 0) $('cv-status').textContent = state.cands.length
            ? 'Toque na capa que você quer usar. As horizontais abrem o recorte.'
            : 'Nenhuma capa encontrada. Tente outro nome (em inglês costuma ajudar) ou envie uma foto.';
    }));
}

export function openCoverPicker({ title, rawgId, onPick }) {
    state = { onPick, rawgId: rawgId || null, cands: [], token: 0 };
    $('cv-title').value = title || '';
    $('cv-grid').innerHTML = '';
    $('cv-status').textContent = '';
    $('modal-covers').showModal();
    if (title) coversSearch();
}

async function pick(i) {
    const c = state.cands[i];
    if (!c || !state.onPick) return;
    $('cv-status').textContent = 'Baixando a imagem...';
    const blob = await fetchImageBlob(c.url);
    if (!blob) { $('cv-status').textContent = 'Essa imagem foi bloqueada pelo site. Tente outra.'; return; }
    const onPick = state.onPick;
    $('modal-covers').close();
    const size = await imageSize(blob);
    if (isVerticalSize(size)) onPick(await blobToSmallJpeg(blob));
    else openCropper({ blob, onDone: onPick });   // arte horizontal: recorta para vertical
}

function init() {
    const grid = $('cv-grid');
    if (!grid) return;
    grid.addEventListener('click', e => { const b = e.target.closest('.cv-item'); if (b) pick(+b.dataset.i); });
    grid.addEventListener('error', e => { const b = e.target.closest && e.target.closest('.cv-item'); if (b && e.target.tagName === 'IMG') b.remove(); }, true);
    $('cv-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); coversSearch(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
