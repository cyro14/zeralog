// Filtros universais: o usuário escolhe qualquer variável do app (gênero, data de lançamento, emulado, console...)
// e a própria tela mostra só os jogos que combinam. Funciona na Fila, nos Zerados e nos Desejos, e na
// prateleira o resultado vira uma prateleira nova. Vários filtros se combinam (todos precisam valer).
import { appData, saveData } from './store.js';
import { esc } from './gameApi.js';
import { hoursOf } from './quickmatch.js';
import { todayISO } from './releases.js';

export const TAB_NAMES = { home: 'Fila', finished: 'Zerados', wish: 'Desejos' };
const DIFF = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', extreme: 'Extremo' };
const NONE = '__none__';
const pad = n => String(n).padStart(2, '0');
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };
const brToISO = s => { const m = String(s || '').match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/); if (!m) return /^\d{4}-\d{2}-\d{2}/.test(s || '') ? String(s).slice(0, 10) : null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(m[2])}-${pad(m[1])}`; };
const catName = g => { const c = appData.categories.find(x => x.id === g.catId); return c ? c.name : null; };
const statusOf = g => g.continuous ? 'Contínuo' : g.state === 'finished' ? 'Zerado' : g.state === 'playing' ? 'Jogando' : 'Na fila';
const ALL = ['home', 'finished', 'wish'];

// type: enum | bool | range | date | text
export const FIELDS = [
    { id: 'platform', label: 'Plataforma', type: 'enum', tabs: ALL, get: g => g.platform },
    { id: 'genre', label: 'Gênero', type: 'enum', tabs: ALL, get: g => g.genres || [] },
    { id: 'franchise', label: 'Franquia', type: 'enum', tabs: ALL, get: g => g.franchise },
    { id: 'category', label: 'Categoria', type: 'enum', tabs: ['home', 'finished'], get: catName },
    { id: 'status', label: 'Status', type: 'enum', tabs: ['home'], get: statusOf },
    { id: 'difficulty', label: 'Dificuldade', type: 'enum', tabs: ALL, get: g => DIFF[g.difficulty] },
    { id: 'emulated', label: 'Emulado', type: 'bool', tabs: ALL, get: g => !!g.emulated },
    { id: 'console', label: 'Console original (emulado)', type: 'enum', tabs: ALL, get: g => (g.emulated ? g.originalConsole : null) },
    { id: 'portable', label: 'Ideal para portáteis', type: 'bool', tabs: ALL, get: g => !!g.isPortable },
    { id: 'continuous', label: 'Jogo contínuo', type: 'bool', tabs: ['home'], get: g => !!g.continuous },
    { id: 'is100', label: '100% concluído', type: 'bool', tabs: ['finished'], get: g => !!g.is100 },
    { id: 'hasCover', label: 'Tem capa', type: 'bool', tabs: ALL, get: g => !!g.image },
    { id: 'hasJournal', label: 'Tem diário de bordo', type: 'bool', tabs: ['home', 'finished'], get: g => !!(g.journalNotes && String(g.journalNotes).trim()) },
    { id: 'hasWiki', label: 'Wiki vinculada', type: 'bool', tabs: ALL, get: g => !!g.wiki },
    { id: 'released', label: 'Data de lançamento', type: 'date', tabs: ALL, get: g => brToISO(g.released) },
    { id: 'upcoming', label: 'Ainda não lançado', type: 'bool', tabs: ['wish'], get: g => !!(g.released && g.released > todayISO()) },
    { id: 'notify', label: 'Avisar quando lançar', type: 'bool', tabs: ['wish'], get: g => !!g.notifyRelease },
    { id: 'finishedOn', label: 'Data em que zerou', type: 'date', tabs: ['finished'], get: g => brToISO(g.dateFinished) },
    { id: 'metacritic', label: 'Nota Metacritic', type: 'range', tabs: ALL, get: g => num(g.metacritic) },
    { id: 'rating', label: 'Minha nota', type: 'range', tabs: ['finished'], get: g => num(g.userRating) },
    { id: 'estTime', label: 'Tempo estimado (horas)', type: 'range', tabs: ALL, get: g => hoursOf(g.meta) },
    { id: 'played', label: 'Horas jogadas', type: 'range', tabs: ['home', 'finished'], get: g => num(g.hoursPlayed) },
    { id: 'title', label: 'Título contém', type: 'text', tabs: ALL, get: g => g.title },
    { id: 'text', label: 'Descrição, diário ou review contém', type: 'text', tabs: ALL, get: g => [g.description, g.journalNotes, g.review].filter(Boolean).join(' ') }
];
const byId = id => FIELDS.find(f => f.id === id);
let hooks = { render() {} };
let current = 'home';   // aba aberta no painel
let seq = 0;

const store = () => appData.settings.filters;
export const getConds = tab => store()[tab] || [];
const setConds = (tab, list) => { store()[tab] = list; };

export function isActive(c) {
    const v = c.value;
    switch ((byId(c.field) || {}).type) {
        case 'enum': return Array.isArray(v) && v.length > 0;
        case 'bool': return v === true || v === false;
        case 'range': return !!v && (num(v.min) !== null || num(v.max) !== null);
        case 'date': return !!v && !!(v.from || v.to);
        case 'text': return typeof v === 'string' && v.trim() !== '';
        default: return false;
    }
}

function matches(item, c) {
    const f = byId(c.field);
    if (!f) return true;
    const raw = f.get(item);
    switch (f.type) {
        case 'enum': {
            const vals = (Array.isArray(raw) ? raw : [raw]).filter(x => x !== null && x !== undefined && x !== '').map(norm);
            const want = c.value.map(norm);
            return vals.length ? vals.some(x => want.includes(x)) : want.includes(NONE);
        }
        case 'bool': return !!raw === c.value;
        case 'range': {
            const n = typeof raw === 'number' ? raw : num(raw);
            if (n === null) return false;
            const lo = num(c.value.min), hi = num(c.value.max);
            return (lo === null || n >= lo) && (hi === null || n <= hi);
        }
        case 'date': {
            if (!raw) return false;
            return (!c.value.from || raw >= c.value.from) && (!c.value.to || raw <= c.value.to);
        }
        case 'text': return norm(raw).includes(norm(c.value));
    }
    return true;
}

export function applyFilters(tab, items) {
    const active = getConds(tab).filter(isActive);
    return active.length ? items.filter(it => active.every(c => matches(it, c))) : items;
}
export const activeCount = tab => getConds(tab).filter(isActive).length;

function valueText(c) {
    const f = byId(c.field), v = c.value;
    switch (f.type) {
        case 'enum': return v.map(x => x === NONE ? '(sem valor)' : x).join(', ');
        case 'bool': return v ? 'sim' : 'não';
        case 'range': return `${num(v.min) !== null ? 'de ' + num(v.min) : ''}${num(v.min) !== null && num(v.max) !== null ? ' ' : ''}${num(v.max) !== null ? 'até ' + num(v.max) : ''}`;
        case 'date': return `${v.from ? 'de ' + v.from.split('-').reverse().join('/') : ''}${v.from && v.to ? ' ' : ''}${v.to ? 'até ' + v.to.split('-').reverse().join('/') : ''}`;
        default: return `"${v}"`;
    }
}
export const filterSummary = tab => getConds(tab).filter(isActive).map(c => `${byId(c.field).label}: ${valueText(c)}`);

// ---------- itens de cada aba (para as opções e a contagem) ----------
const tabItems = tab => tab === 'wish' ? (appData.wishlist || []) : tab === 'finished' ? appData.games.filter(g => g.state === 'finished') : appData.games.filter(g => g.state !== 'finished');

function enumOptions(f, items) {
    const map = new Map();
    let none = 0;
    items.forEach(it => {
        const vals = (Array.isArray(f.get(it)) ? f.get(it) : [f.get(it)]).filter(x => x !== null && x !== undefined && x !== '');
        if (!vals.length) { none++; return; }
        [...new Set(vals.map(String))].forEach(v => { const k = norm(v); const e = map.get(k) || { key: v, label: v, count: 0 }; e.count++; map.set(k, e); });
    });
    const list = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (none) list.push({ key: NONE, label: '(sem valor)', count: none });
    return list;
}

// ---------- painel ----------
const $ = id => document.getElementById(id);

function condHtml(c) {
    const f = byId(c.field);
    const items = tabItems(current);
    let body = '';
    if (f.type === 'enum') {
        const sel = (c.value || []).map(norm);
        body = `<div class="flt-opts">${enumOptions(f, items).map(o => `<label class="flt-opt ${sel.includes(norm(o.key)) ? 'on' : ''}"><input type="checkbox" data-id="${c.id}" data-opt="${esc(o.key)}" ${sel.includes(norm(o.key)) ? 'checked' : ''}>${esc(o.label)} <small>${o.count}</small></label>`).join('') || '<small>Nenhum valor cadastrado ainda.</small>'}</div>`;
    } else if (f.type === 'bool') {
        body = `<div class="view-toggle flt-bool"><button type="button" data-id="${c.id}" data-bool="true" class="${c.value === true ? 'active' : ''}">Sim</button><button type="button" data-id="${c.id}" data-bool="false" class="${c.value === false ? 'active' : ''}">Não</button></div>`;
    } else if (f.type === 'range') {
        const v = c.value || {};
        body = `<div class="flt-range"><input type="number" inputmode="decimal" data-id="${c.id}" data-k="min" placeholder="mínimo" value="${esc(v.min ?? '')}"><span>até</span><input type="number" inputmode="decimal" data-id="${c.id}" data-k="max" placeholder="máximo" value="${esc(v.max ?? '')}"></div>`;
    } else if (f.type === 'date') {
        const v = c.value || {};
        body = `<div class="flt-range"><input type="date" data-id="${c.id}" data-k="from" value="${esc(v.from || '')}"><span>até</span><input type="date" data-id="${c.id}" data-k="to" value="${esc(v.to || '')}"></div>
            <div class="flt-quick">${[['year', 'Este ano'], ['12m', 'Últimos 12 meses'], ['future', 'Futuros'], ['past', 'Já passou']].map(([q, l]) => `<button type="button" class="pill-btn" data-id="${c.id}" data-q="${q}">${l}</button>`).join('')}</div>`;
    } else {
        body = `<input type="text" data-id="${c.id}" data-k="text" placeholder="Digite um trecho" value="${esc(c.value || '')}">`;
    }
    return `<div class="flt-cond" data-cid="${c.id}"><div class="flt-head"><strong>${esc(f.label)}</strong><button type="button" class="icon-btn" data-rm="${c.id}" aria-label="Remover filtro">×</button></div>${body}</div>`;
}

function paintPanel() {
    const conds = getConds(current);
    const used = new Set(conds.map(c => c.field));
    const avail = FIELDS.filter(f => f.tabs.includes(current) && !used.has(f.id));
    $('filters-title').textContent = `Filtros · ${TAB_NAMES[current]}`;
    $('filters-body').innerHTML = (conds.length ? conds.map(condHtml).join('') : '<div class="rawg-msg">Nenhum filtro. Escolha uma variável abaixo para começar: gênero, data de lançamento, emulado, nota, tempo...</div>')
        + `<select id="flt-add" class="flt-add"><option value="">+ Adicionar filtro...</option>${avail.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select>`;
    const saved = (appData.savedFilters || []).filter(s => s.tab === current);
    $('filters-saved').innerHTML = saved.length ? `<span class="qm-label">Meus filtros</span><div class="qm-chips">${saved.map(s => `<span class="flt-chip saved"><button type="button" data-apply="${esc(s.id)}">${esc(s.name)}</button><button type="button" data-del="${esc(s.id)}" aria-label="Apagar">×</button></span>`).join('')}</div>` : '';
    updateCount();
}

function updateCount() {
    const items = tabItems(current);
    $('filters-count').textContent = `${applyFilters(current, items).length} de ${items.length} jogos combinam`;
}

function commit() {
    saveData(null);
    updateCount();
    hooks.render();
}

export function renderFilterBars() {
    ALL.forEach(tab => {
        const n = activeCount(tab);
        const badge = $(`fb-${tab}`);
        if (badge) { badge.textContent = n || ''; badge.style.display = n ? '' : 'none'; }
        const bar = $(`fc-${tab}`);
        if (!bar) return;
        const act = getConds(tab).filter(isActive);
        bar.innerHTML = act.length ? act.map(c => `<span class="flt-chip"><button type="button" data-open="${tab}">${esc(byId(c.field).label)}: ${esc(valueText(c))}</button><button type="button" data-rmchip="${c.id}" data-tab="${tab}" aria-label="Remover">×</button></span>`).join('') + `<button type="button" class="pill-btn" data-clear="${tab}">Limpar filtros</button>` : '';
        bar.style.display = act.length ? '' : 'none';
    });
}

export function openFilters(tab) {
    current = tab;
    paintPanel();
    $('modal-filters').showModal();
}

export function filtersClear(tab = current) { setConds(tab, []); if ($('modal-filters').open) paintPanel(); commit(); renderFilterBars(); }

export function filtersSaveCurrent() {
    const act = getConds(current).filter(isActive);
    if (!act.length) return;
    const name = (prompt('Nome para este filtro:', '') || '').trim();
    if (!name) return;
    appData.savedFilters = appData.savedFilters || [];
    appData.savedFilters.push({ id: 's' + Date.now(), name, tab: current, conds: JSON.parse(JSON.stringify(act)) });
    saveData(null);
    paintPanel();
}

const quickDates = q => {
    const t = new Date(); const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (q === 'year') return { from: `${t.getFullYear()}-01-01`, to: `${t.getFullYear()}-12-31` };
    if (q === '12m') { const a = new Date(t); a.setFullYear(a.getFullYear() - 1); return { from: iso(a), to: iso(t) }; }
    if (q === 'future') { const a = new Date(t); a.setDate(a.getDate() + 1); return { from: iso(a), to: '' }; }
    return { from: '', to: iso(new Date(t.getTime() - 86400000)) };
};

function onPanelEvent(e) {
    const t = e.target;
    if (t.id === 'flt-add' && t.value) {
        const f = byId(t.value);
        const init = f.type === 'enum' ? [] : f.type === 'bool' ? true : f.type === 'text' ? '' : {};
        setConds(current, [...getConds(current), { id: 'c' + (++seq) + Date.now(), field: f.id, value: init }]);
        paintPanel(); commit(); renderFilterBars();
        return;
    }
    const c = t.dataset && t.dataset.id ? getConds(current).find(x => x.id === t.dataset.id) : null;
    if (!c) return;
    if (t.dataset.opt !== undefined && e.type === 'change') {
        const set = new Set(c.value.map(String));
        t.checked ? set.add(t.dataset.opt) : set.delete(t.dataset.opt);
        c.value = [...set];
        t.closest('.flt-opt').classList.toggle('on', t.checked);
        commit(); renderFilterBars();
    } else if (t.dataset.k && (e.type === 'input' || e.type === 'change')) {
        if (t.dataset.k === 'text') c.value = t.value;
        else c.value = { ...(c.value || {}), [t.dataset.k]: t.value };
        commit(); renderFilterBars();
    }
}

function onPanelClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm) { setConds(current, getConds(current).filter(c => c.id !== b.dataset.rm)); paintPanel(); commit(); renderFilterBars(); }
    else if (b.dataset.bool !== undefined) { const c = getConds(current).find(x => x.id === b.dataset.id); if (c) { c.value = b.dataset.bool === 'true'; paintPanel(); commit(); renderFilterBars(); } }
    else if (b.dataset.q) { const c = getConds(current).find(x => x.id === b.dataset.id); if (c) { c.value = quickDates(b.dataset.q); paintPanel(); commit(); renderFilterBars(); } }
    else if (b.dataset.apply) { const s = (appData.savedFilters || []).find(x => x.id === b.dataset.apply); if (s) { setConds(current, JSON.parse(JSON.stringify(s.conds)).map(c => ({ ...c, id: 'c' + (++seq) + Date.now() }))); paintPanel(); commit(); renderFilterBars(); } }
    else if (b.dataset.del) { appData.savedFilters = (appData.savedFilters || []).filter(x => x.id !== b.dataset.del); saveData(null); paintPanel(); }
}

function onBarClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) openFilters(b.dataset.open);
    else if (b.dataset.clear) filtersClear(b.dataset.clear);
    else if (b.dataset.rmchip) { const tab = b.dataset.tab; setConds(tab, getConds(tab).filter(c => c.id !== b.dataset.rmchip)); commit(); renderFilterBars(); }
}

export function initFilters(h) {
    hooks = h;
    const body = $('filters-body');
    if (!body) return;
    body.addEventListener('change', onPanelEvent);
    body.addEventListener('input', onPanelEvent);
    body.addEventListener('click', onPanelClick);
    $('filters-saved').addEventListener('click', onPanelClick);
    ALL.forEach(tab => { const bar = $(`fc-${tab}`); if (bar) bar.addEventListener('click', onBarClick); });
}
