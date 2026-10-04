// Ícones Phosphor (https://phosphoricons.com, licença MIT) via fonte oficial na CDN do jsDelivr.
// Guardamos só {name, weight}; o CSS do peso usado é carregado sob demanda.
// Sem internet na primeira vez, o ícone não aparece (e o nome da categoria continua visível).
import { esc } from './gameApi.js';

const VERSION = '2.1.2';
const BASE = `https://cdn.jsdelivr.net/npm/@phosphor-icons/web@${VERSION}/src`;
export const WEIGHTS = [['regular', 'Regular'], ['bold', 'Negrito'], ['fill', 'Preenchido'], ['duotone', 'Duotone'], ['light', 'Leve'], ['thin', 'Fino']];
const CATALOG_KEY = 'zeralog_ph_catalog';
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Sugestões úteis para jogos (usadas quando a busca está vazia)
export const SUGGESTED = ['game-controller', 'joystick', 'sword', 'shield', 'skull', 'ghost', 'rocket-launch', 'crown', 'trophy', 'medal', 'star', 'heart', 'lightning', 'fire', 'puzzle-piece', 'car', 'motorcycle', 'airplane', 'boat', 'soccer-ball', 'basketball', 'mountains', 'planet', 'castle-turret', 'knife', 'bomb', 'crosshair', 'target', 'dice-five', 'cards', 'sparkle', 'magic-wand', 'flask', 'tree', 'cactus', 'fish', 'paw-print', 'alien', 'robot', 'sneaker', 'barbell', 'headphones', 'music-notes', 'book-open', 'compass', 'map-trifold', 'house', 'buildings', 'brain', 'atom', 'lightbulb', 'key', 'gift', 'flag', 'hammer', 'wrench', 'bug', 'monitor', 'device-mobile', 'television'];

const loaded = new Set();
const cls = w => (w === 'regular' ? 'ph' : `ph-${w}`);
const validWeight = w => WEIGHTS.some(x => x[0] === w) ? w : 'regular';

export function ensurePhosphorCss(weight = 'regular') {
    const w = validWeight(weight);
    if (loaded.has(w)) return;
    loaded.add(w);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${BASE}/${w}/style.css`;
    link.onerror = () => { loaded.delete(w); document.documentElement.classList.add('ph-offline'); };
    link.onload = () => document.documentElement.classList.remove('ph-offline');
    document.head.appendChild(link);
}

// HTML do ícone a partir de {name, weight}
export function phHtml(ic) {
    if (!ic || !NAME_RE.test(String(ic.name || ''))) return '';
    const w = validWeight(ic.weight);
    ensurePhosphorCss(w);
    return `<i class="ph-ico ${cls(w)} ph-${ic.name}" aria-hidden="true"></i>`;
}

// Garante o CSS de ícones Phosphor que já estão salvos (categorias e plataformas)
export function ensureForData(appData) {
    (appData.categories || []).forEach(c => { if (c.icon) ensurePhosphorCss(c.icon.weight); });
    (appData.platforms || []).forEach(p => {
        const m = String(p.icon || '').match(/class="ph-ico (ph(?:-(?:thin|light|bold|fill|duotone))?) /);
        if (m) ensurePhosphorCss(m[1] === 'ph' ? 'regular' : m[1].slice(3));
    });
}

// ---------- catálogo (nomes de todos os ícones) ----------
let catalog = null;
async function loadCatalog() {
    if (catalog) return catalog;
    try { const c = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); if (Array.isArray(c) && c.length > 100) { catalog = c; return catalog; } } catch (e) {}
    try {
        const res = await fetch(`${BASE}/regular/style.css`);
        if (!res.ok) throw new Error('http');
        const css = await res.text();
        const names = [...new Set([...css.matchAll(/\.ph-([a-z0-9-]+):{1,2}before/g)].map(m => m[1]))].sort();
        if (names.length > 100) {
            catalog = names;
            try { localStorage.setItem(CATALOG_KEY, JSON.stringify(names)); } catch (e) {}
        }
    } catch (e) { /* sem catálogo: usa só as sugestões */ }
    return catalog;
}

// ---------- seletor ----------
const $ = id => document.getElementById(id);
const PAGE = 90;
let S = { onPick: null, weight: 'regular', list: [], shown: 0, token: 0 };

function paintGrid(append = false) {
    const grid = $('ic-grid');
    const slice = S.list.slice(append ? S.shown : 0, (append ? S.shown : 0) + PAGE);
    const html = slice.map(n => `<button type="button" class="ic-item" data-name="${esc(n)}" title="${esc(n)}"><i class="ph-ico ${cls(S.weight)} ph-${esc(n)}" aria-hidden="true"></i><span>${esc(n)}</span></button>`).join('');
    if (append) grid.insertAdjacentHTML('beforeend', html); else grid.innerHTML = html;
    S.shown = (append ? S.shown : 0) + slice.length;
    $('ic-more').style.display = S.shown < S.list.length ? '' : 'none';
    $('ic-status').textContent = S.list.length
        ? `${S.list.length} ${S.list.length === 1 ? 'ícone' : 'ícones'}${$('ic-query').value.trim() ? '' : ' sugeridos para jogos (busque por qualquer nome em inglês)'}`
        : 'Nenhum ícone encontrado. Tente um termo em inglês (ex.: sword, ghost, car).';
}

export async function iconSearch() {
    const token = ++S.token;
    const q = $('ic-query').value.trim().toLowerCase().replace(/\s+/g, '-');
    const cat = await loadCatalog();
    if (token !== S.token) return;
    if (!q) S.list = cat ? SUGGESTED.filter(n => cat.includes(n)) : SUGGESTED;
    else if (cat) {
        const starts = cat.filter(n => n.startsWith(q)), has = cat.filter(n => !n.startsWith(q) && n.includes(q));
        S.list = [...starts, ...has];
    } else S.list = SUGGESTED.filter(n => n.includes(q));
    paintGrid();
    if (!cat) $('ic-status').textContent += ' (catálogo completo indisponível: verifique a internet)';
}

export function iconWeightChange(w) {
    S.weight = validWeight(w);
    ensurePhosphorCss(S.weight);
    paintGrid();
}

export function openIconPicker({ current, onPick }) {
    S = { onPick, weight: validWeight(current && current.weight), list: [], shown: 0, token: 0 };
    ensurePhosphorCss(S.weight);
    $('ic-weight').innerHTML = WEIGHTS.map(([v, l]) => `<option value="${v}" ${v === S.weight ? 'selected' : ''}>${l}</option>`).join('');
    $('ic-query').value = '';
    $('modal-icons').showModal();
    iconSearch();
}

export function iconMore() { paintGrid(true); }

function init() {
    const grid = $('ic-grid');
    if (!grid) return;
    grid.addEventListener('click', e => {
        const b = e.target.closest('.ic-item');
        if (!b || !S.onPick) return;
        const pick = S.onPick;
        $('modal-icons').close();
        pick({ name: b.dataset.name, weight: S.weight });
    });
    let t;
    $('ic-query').addEventListener('input', () => { clearTimeout(t); t = setTimeout(iconSearch, 180); });
    $('ic-query').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); iconSearch(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
