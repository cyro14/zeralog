// ================= Aba Desejos: duas telas no mesmo lugar =================
// A aba Desejos tem um submenu com duas telas:
//   • "Wish list"   — a lista do jogador (js/ui.js desenha os itens e o resumo);
//   • "Lançamentos" — a mesma vitrine da categoria Lançamentos do Explorar
//                     (os mais esperados, do maior hype para o menor), aqui
//                     dentro para não obrigar a trocar de aba para descobrir
//                     um jogo e mandá-lo para a wish list com um toque.
// O estado da tela de lançamentos é próprio: os filtros do Explorar não mexem nela.
import { appData, saveData } from './store.js';
import { listGames, esc, normText, resizeUrl, describeError } from './gameApi.js';
import { exploreById, exploreParams, gmIsClean, matchScore, gmXOpen, gmBuy, gmExploreWish } from './gamematch.js';
import { icon } from './icons.js';
import { countdownText, daysUntil, fmtDate } from './releases.js';

const DEPS = { toast: msg => console.log(msg) };   // injetado por initWishView (main.js)
const toast = msg => DEPS.toast(msg);

export const WISH_SUBS = ['list', 'releases'];
const isSub = v => WISH_SUBS.includes(v);

// Tela ativa (fica salva nas preferências: quem fecha no Lançamentos volta nele)
export const wishSub = () => (isSub(appData.settings.wishSub) ? appData.settings.wishSub : 'list');

// Estado da grade de lançamentos (independente da aba Explorar)
const rel = { page: 0, items: [], more: true, loaded: false, busy: false, error: '' };
export const wishReleasesState = () => rel;

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
    syncWishView();
}

/* ---------------- lançamentos ---------------- */
// Só o que ainda vai lançar (hoje até 3 anos à frente), fora de conteúdo adulto e com capa
function keepUpcoming(g) {
    const today = new Date().getFullYear();
    const year = g.released ? +String(g.released).slice(0, 4) : 0;
    const left = daysUntil(g.released);
    return !!g.released && year >= today && year <= today + 3 && left !== null && left >= 0;
}

async function fetchWishReleases(page) {
    const res = await listGames(exploreParams('releases', page));   // -added: os mais esperados primeiro
    const items = res.items.filter(g => gmIsClean(g) && g.image && keepUpcoming(g));
    // A página do jogo (gmXOpen) e o botão da capa usam este mapa — o item daqui precisa estar nele
    items.forEach(g => exploreById.set(g.rawgId, g));
    return { items, more: res.more };
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
            <span class="gm-match gm-match-${m >= 90 ? 'hi' : m >= 70 ? 'mid' : 'lo'}">${m}%</span>
        </div>
        <div class="gm-x-actions">
            ${action}
            <button type="button" class="icon-btn xl" title="Comprar na Amazon" onclick="event.stopPropagation();gmBuy(${g.rawgId})">${icon('cart', { size: '1.1em' })}</button>
        </div>
    </div>`;
}

function paintWishReleases() {
    const grid = document.getElementById('wish-releases-grid');
    if (!grid) return;
    if (rel.error) {
        grid.innerHTML = `<div class="gm-empty"><p>${esc(rel.error)}</p><button type="button" class="gm-cta" onclick="wishReleasesLoad(true)">Tentar de novo</button></div>`;
        return;
    }
    if (!rel.loaded) { grid.innerHTML = '<div class="gm-loading">Buscando os lançamentos...</div>'; return; }
    if (!rel.items.length) {
        grid.innerHTML = '<div class="gm-empty"><p>Nenhum lançamento para mostrar agora.</p><button type="button" class="gm-cta" onclick="wishReleasesLoad(true)">Tentar de novo</button></div>';
        return;
    }
    const foot = rel.more
        ? '<div class="gm-x-more"><button type="button" class="gm-cta" onclick="wishReleasesMore()">Carregar mais lançamentos</button></div>'
        : '<div class="gm-x-more gm-note">Esses são os lançamentos de agora — volte depois para ver as novidades.</div>';
    grid.innerHTML = rel.items.map(releaseCard).join('') + foot;
}

export async function wishReleasesLoad(force = false) {
    if (rel.busy) return;
    if (rel.loaded && !force) { paintWishReleases(); return; }
    rel.busy = true;
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
