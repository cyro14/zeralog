// ================= Aba Desejos: duas telas no mesmo lugar =================
// A aba Desejos tem um submenu com duas telas:
//   • "Wish list"   — a lista do jogador (js/ui.js desenha os itens e o resumo);
//   • "Lançamentos" — a mesma vitrine da categoria Lançamentos do Explorar
//                     (os mais esperados, do maior hype para o menor, dos
//                     últimos meses até 3 anos à frente), aqui dentro para não
//                     obrigar a trocar de aba para descobrir um jogo e mandá-lo
//                     para a wish list com um toque.
// Os filtros e as ordenações são os MESMOS do Explorar (js/gamematch.js exporta as
// regras), mas o estado é próprio: filtrar aqui não mexe na aba GameMatch.
import { appData, saveData } from './store.js';
import { listGames, esc, normText, resizeUrl, describeError } from './gameApi.js';
import {
    exploreById, exploreParams, gmIsClean, matchScore, gmXOpen, gmBuy, gmExploreWish,
    X_SORTS, applyFilterParams, sortBy, gmGenreMatch, gmPlatMatch, sortPanelHtml,
    genreOptionsHtml, platformOptionsHtml, setupCompanyFilter, paintFilterWidget, inReleaseWindow
} from './gamematch.js';
import { icon } from './icons.js';
import { countdownText, daysUntil, fmtDate } from './releases.js';

const DEPS = { toast: msg => console.log(msg) };   // injetado por initWishView (main.js)
const toast = msg => DEPS.toast(msg);

export const WISH_SUBS = ['list', 'releases'];
const isSub = v => WISH_SUBS.includes(v);

// Tela ativa (fica salva nas preferências: quem fecha no Lançamentos volta nele)
export const wishSub = () => (isSub(appData.settings.wishSub) ? appData.settings.wishSub : 'list');

// Estado da grade de lançamentos (independente da aba Explorar)
const rel = { page: 0, items: [], more: true, loaded: false, busy: false, again: false, error: '' };
export const wishReleasesState = () => rel;

// Filtros/ordenação da tela de lançamentos — cópia própria dos do Explorar
const wf = { genre: '', plat: '', devId: 0, devName: '', pubId: 0, pubName: '' };
let wSort = '';   // '' = ordem da categoria (hype da RAWG)
export const wishFiltersState = () => wf;
export const wishSortState = () => wSort;
const WISH_FILTER_IDS = { chips: 'wish-filter-chips', badge: 'wish-filter-badge', btn: 'wish-filter-btn', clear: 'wish-filter-clear', foot: 'wish-filter-foot' };
const hasWishFilters = () => !!(wf.genre || wf.plat || wf.devId || wf.pubId);

/* ---------------- as duas telas ---------------- */
function paintWishSub() {
    const releases = wishSub() === 'releases';
    [['wish-pane-list', !releases], ['wish-pane-releases', releases]].forEach(([id, on]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', on);
    });
    [['wish-sub-list', !releases], ['wish-sub-releases', releases]].forEach(([id, on]) => {
        const el = document.getElementById(id);
        if (el) { el.classList.toggle('active', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); }
    });
    // Os Lançamentos não usam a busca nem os filtros de plataforma do topo (são do app inteiro)
    const tab = document.getElementById('tab-wish');
    const active = !tab || (tab.classList && tab.classList.contains('active'));
    document.body.classList.toggle('wish-rel-tab', releases && active);
    paintWishTools();
}

// O botão do submenu troca de tela sem sair da aba
export function wishSubShow(name) {
    const sub = isSub(name) ? name : 'list';
    if (appData.settings.wishSub !== sub) { appData.settings.wishSub = sub; saveData(); }
    paintWishSub();
    if (sub === 'releases') wishReleasesLoad();
    return sub;
}

// Chamado ao abrir a aba (e no boot): pinta a tela salva e busca os lançamentos se for a vez dela
export function syncWishView() {
    paintWishSub();
    const tab = document.getElementById('tab-wish');
    const visible = !tab || (tab.classList && tab.classList.contains('active'));
    if (visible && wishSub() === 'releases') wishReleasesLoad();
}

export function initWishView(deps = {}) {
    Object.assign(DEPS, deps);
    document.addEventListener('zeralog:tab-changed', e => {
        if (e.detail && e.detail.tab === 'wish') syncWishView();
        else document.body.classList.remove('wish-rel-tab');   // saiu da aba: a busca do topo volta
    });
    // Painéis de filtros/ordenação: fecham no X, no clique fora e no Esc (como no Explorar)
    document.addEventListener('click', e => {
        const { fp, sp, open } = wishPanels();
        if (!open) return;
        const t = e.target;
        if (t && t.closest && t.closest('[data-x-close]')) { wishClosePanels(); return; }
        if (t && t.closest && (t.closest('#wish-x-tools') || t.closest('.gm-co-list'))) return;
        wishClosePanels();
    }, true);
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (wishPanels().open) { wishClosePanels(); e.stopPropagation(); }   // Esc fecha o painel, não a tela
    }, true);
    syncWishView();
}

/* ---------------- filtros e ordenação (os mesmos do Explorar) ---------------- */
function wishPanels() {
    const fp = document.getElementById('wish-x-filter-panel');
    const sp = document.getElementById('wish-x-sort-panel');
    return { fp, sp, open: !!((fp && !fp.hidden) || (sp && !sp.hidden)) };
}

export function wishClosePanels() {
    for (const [pid, bid] of [['wish-x-filter-panel', 'wish-filter-btn'], ['wish-x-sort-panel', 'wish-sort-btn']]) {
        const panel = document.getElementById(pid);
        if (panel) panel.hidden = true;
        const btn = document.getElementById(bid);
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }
}

// Monta os campos uma vez só (selects de gênero/plataforma e os buscadores de estúdio)
function fillWishFilters() {
    const panel = document.getElementById('wish-x-filter-panel');
    if (panel && !panel.dataset.ready) { panel.dataset.ready = '1'; panel.hidden = true; }
    const sortPanel = document.getElementById('wish-x-sort-panel');
    if (sortPanel && !sortPanel.dataset.ready) { sortPanel.dataset.ready = '1'; sortPanel.hidden = true; }
    const gs = document.getElementById('wish-x-genre');
    if (gs && !gs.dataset.ready) { gs.dataset.ready = '1'; gs.innerHTML = genreOptionsHtml(); }
    const ps = document.getElementById('wish-x-plat');
    if (ps && !ps.dataset.ready) { ps.dataset.ready = '1'; ps.innerHTML = platformOptionsHtml(); }
    setupCompanyFilter(document.getElementById('wish-dev-filter'), 'developers', {
        name: () => wf.devName,
        set: (id, name) => { wf.devId = id; wf.devName = name; paintWishFilterState(); wishReleasesLoad(true); },
    });
    setupCompanyFilter(document.getElementById('wish-pub-filter'), 'publishers', {
        name: () => wf.pubName,
        set: (id, name) => { wf.pubId = id; wf.pubName = name; paintWishFilterState(); wishReleasesLoad(true); },
    });
}

function paintWishFilterState() {
    paintFilterWidget(WISH_FILTER_IDS, wf, 'wishFilterRemove');
}

function paintWishSortButton() {
    const btn = document.getElementById('wish-sort-btn');
    if (btn) btn.classList.toggle('on', !!wSort);
    const label = document.getElementById('wish-sort-label');
    if (label) {
        const opt = X_SORTS.find(s => s[0] === wSort) || X_SORTS[0];
        label.textContent = opt[1] === 'Padrão' ? 'Ordenar' : opt[1];
    }
}

function paintWishTools() {
    paintWishSortButton();
    paintWishFilterState();
}

export function wishFilterToggle() {
    fillWishFilters();
    const panel = document.getElementById('wish-x-filter-panel');
    if (!panel) return;
    const open = panel.hidden;
    wishClosePanels();
    panel.hidden = !open;
    const btn = document.getElementById('wish-filter-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
}

export function wishSortToggle() {
    fillWishFilters();
    const panel = document.getElementById('wish-x-sort-panel');
    if (!panel) return;
    const open = panel.hidden;
    wishClosePanels();
    if (open) panel.innerHTML = sortPanelHtml(wSort, 'wishSort', 'Ordenar por', 'wishClosePanels');
    panel.hidden = !open;
    const btn = document.getElementById('wish-sort-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
}

// Filtrar é consulta ao servidor: volta para a 1ª página com o filtro aplicado
export function wishFilterGenre(v) {
    wf.genre = v || '';
    const el = document.getElementById('wish-x-genre');
    if (el) el.value = wf.genre;
    paintWishFilterState();
    wishReleasesLoad(true);
}

export function wishFilterPlat(v) {
    wf.plat = v || '';
    const el = document.getElementById('wish-x-plat');
    if (el) el.value = wf.plat;
    paintWishFilterState();
    wishReleasesLoad(true);
}

export function wishFilterRemove(kind) {
    if (kind === 'genre') { wf.genre = ''; const el = document.getElementById('wish-x-genre'); if (el) el.value = ''; }
    if (kind === 'plat') { wf.plat = ''; const el = document.getElementById('wish-x-plat'); if (el) el.value = ''; }
    if (kind === 'dev') { wf.devId = 0; wf.devName = ''; const el = document.querySelector('#wish-dev-filter input'); if (el) el.value = ''; }
    if (kind === 'pub') { wf.pubId = 0; wf.pubName = ''; const el = document.querySelector('#wish-pub-filter input'); if (el) el.value = ''; }
    paintWishFilterState();
    wishReleasesLoad(true);
}

export function wishFilterClear() {
    wf.genre = ''; wf.plat = ''; wf.devId = 0; wf.devName = ''; wf.pubId = 0; wf.pubName = '';
    const gs = document.getElementById('wish-x-genre'); if (gs) gs.value = '';
    const ps = document.getElementById('wish-x-plat'); if (ps) ps.value = '';
    const di = document.querySelector('#wish-dev-filter input'); if (di) di.value = '';
    const pi = document.querySelector('#wish-pub-filter input'); if (pi) pi.value = '';
    paintWishFilterState();
    wishReleasesLoad(true);
}

// Ordenar é no cliente, sobre o que já está na grade (não gasta requisição)
export function wishSort(kind) {
    wSort = X_SORTS.some(s => s[0] === kind) ? kind : '';
    const panel = document.getElementById('wish-x-sort-panel');
    if (panel) panel.hidden = true;
    const btn = document.getElementById('wish-sort-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    paintWishReleases();
}

/* ---------------- lançamentos ---------------- */
// O corte é o mesmo da consulta (js/gamematch.js, releaseWindow/inReleaseWindow):
// dos últimos meses (o que acabou de sair) até 3 anos à frente. Só o futuro deixava
// a tela com 5 cartões no Switch — a RAWG quase não tem jogo com data futura, e
// jogo sem data fixa (tba) nem pode ser listado por lá.
async function fetchWishReleases(page) {
    const params = exploreParams('releases', page);   // -added: os mais esperados primeiro
    applyFilterParams(params, wf);                    // gênero/plataforma/estúdio vão na consulta
    const res = await listGames(params);
    const items = res.items.filter(g => gmIsClean(g) && g.image && inReleaseWindow(g));
    // A página do jogo (gmXOpen) e o botão da capa usam este mapa — o item daqui precisa estar nele
    items.forEach(g => exploreById.set(g.rawgId, g));
    return { items, more: res.more };
}

// Filtro local (acompanha o do servidor) + ordenação escolhida
function shownReleases() {
    const byGenre = wf.genre ? rel.items.filter(g => gmGenreMatch(g, wf.genre)) : rel.items;
    const byPlat = wf.plat ? byGenre.filter(g => gmPlatMatch(g, wf.plat)) : byGenre;
    return sortBy(byPlat, wSort);
}

const inWishlist = g => (appData.wishlist || []).some(w =>
    (g.rawgId && w.rawgId === g.rawgId) || normText(w.title) === normText(g.title));

function releaseCard(g) {
    const img = g.image ? resizeUrl(g.image, 420) : null;
    const m = g._match ?? matchScore(g);
    const year = g.released ? String(g.released).slice(0, 4) : '';
    const sub = [(g.genres || []).slice(0, 2).join(' · '), year].filter(Boolean).join(' · ');
    const have = inWishlist(g);
    const action = have
        ? `<span class="wish-rel-in" title="Já está na sua Wish list">${icon('check', { size: '1em' })} Na wish list</span>`
        : `<button type="button" class="icon-btn xl" title="Adicionar à wish list" onclick="event.stopPropagation();wishReleasesAdd(${g.rawgId})">${icon('bookmark', { size: '1.1em' })}</button>`;
    return `
    <div class="gm-x-card wish-rel-card" role="button" tabindex="0" onclick="gmXOpen(${g.rawgId})" onkeydown="if(event.key==='Enter')gmXOpen(${g.rawgId})" title="Abrir ${esc(g.title)}">
        <div class="gm-x-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="gm-cover-empty">${esc(String(g.title).slice(0, 2))}</div>`}</div>
        <div class="gm-x-body">
            <strong>${esc(g.title)}</strong>
            <small>${esc(sub)}</small>
            <span class="wish-rel-when" title="${esc(fmtDate(g.released, true))}">${icon('calendar', { size: '1em' })} ${esc(countdownText(g))}</span>
        </div>
        <div class="gm-x-actions">
            <span class="gm-match gm-match-${m >= 90 ? 'hi' : m >= 70 ? 'mid' : 'lo'}">${m}%</span>
            ${action}
            <button type="button" class="icon-btn xl" title="Comprar na Amazon" onclick="event.stopPropagation();gmBuy(${g.rawgId})">${icon('cart', { size: '1.1em' })}</button>
        </div>
    </div>`;
}

function paintWishReleases() {
    paintWishTools();
    const grid = document.getElementById('wish-releases-grid');
    if (!grid) return;
    if (rel.error) {
        grid.innerHTML = `<div class="gm-empty"><p>${esc(rel.error)}</p><button type="button" class="gm-cta" onclick="wishReleasesLoad(true)">Tentar de novo</button></div>`;
        return;
    }
    if (!rel.loaded) { grid.innerHTML = '<div class="gm-loading">Buscando os lançamentos...</div>'; return; }
    const items = shownReleases();
    if (!items.length) {
        // Com filtro ativo a saída é limpá-los; sem filtro, é tentar de novo
        grid.innerHTML = hasWishFilters()
            ? '<div class="gm-empty"><p>Nenhum lançamento com esses filtros.</p><button type="button" class="gm-cta" onclick="wishFilterClear()">Limpar filtros</button></div>'
            : '<div class="gm-empty"><p>Nenhum lançamento para mostrar agora.</p><button type="button" class="gm-cta" onclick="wishReleasesLoad(true)">Tentar de novo</button></div>';
        return;
    }
    const foot = rel.more
        ? '<div class="gm-x-more"><button type="button" class="gm-cta" onclick="wishReleasesMore()">Carregar mais lançamentos</button></div>'
        : '<div class="gm-x-more gm-note">Esses são os lançamentos de agora — volte depois para ver as novidades.</div>';
    grid.innerHTML = items.map(releaseCard).join('') + foot;
}

export async function wishReleasesLoad(force = false) {
    // trocou de filtro no meio de uma busca: refaz assim que a atual terminar (senão o filtro se perdia)
    if (rel.busy) { if (force) rel.again = true; return; }
    if (rel.loaded && !force) { paintWishReleases(); return; }
    rel.busy = true;
    rel.again = false;
    rel.error = '';
    rel.loaded = false;
    paintWishReleases();   // "Buscando os lançamentos..."
    try {
        const res = await fetchWishReleases(1);
        rel.page = 1;
        rel.items = res.items;
        rel.more = res.more;
        rel.loaded = true;
    } catch (e) {
        rel.error = describeError(e);
        rel.items = [];
        rel.more = false;
    } finally {
        rel.busy = false;
        paintWishReleases();
        if (rel.again) { rel.again = false; wishReleasesLoad(true); }
    }
}

export async function wishReleasesMore() {
    if (rel.busy || !rel.more) return;
    rel.busy = true;
    const btn = document.querySelector('#wish-releases-grid .gm-x-more button');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
    try {
        const res = await fetchWishReleases(rel.page + 1);
        rel.page++;
        rel.items = rel.items.concat(res.items);
        rel.more = res.more;
    } catch (e) {
        rel.more = false;                                   // sem rede: mantém o que já apareceu
        toast('Não consegui carregar mais lançamentos agora.');
    } finally {
        rel.busy = false;
        paintWishReleases();
    }
}

// "+ wish list" no cartão: entra já com o aviso de lançamento ligado (é um jogo que ainda vai sair)
export function wishReleasesAdd(rawgId) {
    const g = exploreById.get(rawgId);
    if (!g) return false;
    const left = daysUntil(g.released);
    const future = left !== null && left >= 0;
    const ok = gmExploreWish(rawgId, future ? { notifyRelease: true, note: 'Descoberto nos lançamentos' } : { note: 'Descoberto nos lançamentos' });
    paintWishReleases();   // o cartão vira "Na wish list" na hora
    return ok;
}
