// Quick Match: filtros de humor para escolher o que jogar (e alimentar a roleta).
import { appData } from './store.js';
import { esc } from './gameApi.js';

const F = { time: null, genre: null, portable: false, diff: null, emulated: false };
const DIFF = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', extreme: 'Extremo' };
const TIME = {
    fast: ['Rápido (< 5h)', h => h < 5],
    mid: ['Médio (5–20h)', h => h >= 5 && h < 20],
    long: ['Denso (20h+)', h => h >= 20]
};
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function hoursOf(meta) {
    if (!meta) return null;
    let v = parseFloat(String(meta).replace(',', '.'));
    if (isNaN(v)) return null;
    if (String(meta).includes('m')) v /= 60;
    return v;
}

function hasGenre(g, genre) {
    const want = norm(genre);
    if ((g.genres || []).some(x => norm(x) === want)) return true;
    if (want === 'rpg') {   // categoria "RPG" também vale
        const cat = appData.categories.find(c => c.id === g.catId);
        return !!(cat && /rpg/i.test(cat.name));
    }
    return false;
}

export const filtersActive = () => !!(F.time || F.genre || F.portable || F.diff || F.emulated);

export function getMatches() {
    return appData.games.filter(g => g.state === null && !g.continuous).filter(g => {
        if (F.portable && !g.isPortable) return false;
        if (F.time) {
            const h = hoursOf(g.meta);
            if (h === null || !TIME[F.time][1](h)) return false;
        }
        if (F.genre && !hasGenre(g, F.genre)) return false;
        if (F.diff && g.difficulty !== F.diff) return false;
        if (F.emulated && !g.emulated) return false;
        return true;
    });
}

export function describeFilters() {
    const parts = [];
    if (F.time) parts.push(TIME[F.time][0]);
    if (F.genre) parts.push(F.genre);
    if (F.portable) parts.push('ideal para portátil');
    if (F.diff) parts.push(`dificuldade ${DIFF[F.diff].toLowerCase()}`);
    if (F.emulated) parts.push('emulado');
    return parts.join(' + ');
}

function backlogGenres() {
    const map = new Map();
    appData.games.filter(g => g.state === null && !g.continuous).forEach(g => (g.genres || []).forEach(x => { if (x && !map.has(norm(x))) map.set(norm(x), x); }));
    return [...map.values()].sort((a, b) => a.localeCompare(b));
}

export function renderQuickMatch() {
    const body = document.getElementById('qm-body');
    if (!body) return;
    const backlog = appData.games.filter(g => g.state === null && !g.continuous);
    const matches = getMatches();
    const active = filtersActive();
    document.getElementById('qm-count').textContent = active ? `${matches.length} combinam` : `${backlog.length} na fila`;

    const chip = (label, on, fn) => `<button type="button" class="qm-chip ${on ? 'active' : ''}" onclick="${fn}">${label}</button>`;
    const genres = backlogGenres();
    if (F.genre && !genres.some(x => norm(x) === norm(F.genre))) genres.push(F.genre);

    const noTime = backlog.filter(g => hoursOf(g.meta) === null).length;
    const sorted = [...matches].sort((a, b) => (hoursOf(a.meta) ?? 1e9) - (hoursOf(b.meta) ?? 1e9));
    const rows = sorted.slice(0, 6).map(g => `<li><span class="qm-title">${esc(g.title)}</span><span class="qm-meta">${esc(g.meta ? (String(g.meta).endsWith('m') ? String(g.meta).slice(0, -1) + ' min' : g.meta) : 'sem tempo')}</span><button type="button" class="pill-btn primary" onclick="toggleState('${g.id}', 'playing')">Jogar</button></li>`).join('');

    body.innerHTML = `
        <div class="qm-group"><span class="qm-label">Duração</span><div class="qm-chips">
            ${Object.entries(TIME).map(([k, [label]]) => chip(label, F.time === k, `qmSetTime('${k}')`)).join('')}
        </div></div>
        <div class="qm-group"><span class="qm-label">Dificuldade</span><div class="qm-chips">
            ${Object.entries(DIFF).map(([k, label]) => chip(label, F.diff === k, `qmSetDiff('${k}')`)).join('')}
        </div></div>
        <div class="qm-group"><span class="qm-label">Estilo</span><div class="qm-chips">
            ${chip('RPG', F.genre && norm(F.genre) === 'rpg', "qmSetGenre('RPG', true)")}
            ${chip('Ideal para portátil', F.portable, 'qmTogglePortable()')}
            ${chip('Emulado', F.emulated, 'qmToggleEmulated()')}
            <select class="qm-select" onchange="qmSetGenre(this.value)" aria-label="Gênero">
                <option value="">Qualquer gênero</option>
                ${genres.map(x => `<option value="${esc(x)}" ${F.genre && norm(F.genre) === norm(x) ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
            ${active ? '<button type="button" class="pill-btn" onclick="qmReset()">Limpar</button>' : ''}
        </div></div>
        ${matches.length ? `<ul class="qm-list">${rows}</ul>${matches.length > 6 ? `<small class="qm-note">+${matches.length - 6} outros</small>` : ''}
            <button type="button" class="pill-btn primary qm-roll" onclick="spinRoulette()">Sortear entre ${matches.length === 1 ? 'esse jogo' : `os ${matches.length}`}</button>`
            : `<div class="qm-empty">${backlog.length ? 'Nenhum jogo da fila combina com esses filtros.' : 'Sua fila está vazia.'}</div>`}
        ${F.time && noTime ? `<small class="qm-note">${noTime} ${noTime === 1 ? 'jogo' : 'jogos'} sem tempo estimado ficam de fora dos filtros de duração.</small>` : ''}`;
}

export function qmSetTime(k) { F.time = F.time === k ? null : k; renderQuickMatch(); }
export function qmSetGenre(v, toggle = false) {
    if (toggle && F.genre && norm(F.genre) === norm(v)) F.genre = null; else F.genre = v || null;
    renderQuickMatch();
}
export function qmTogglePortable() { F.portable = !F.portable; renderQuickMatch(); }
export function qmSetDiff(k) { F.diff = F.diff === k ? null : k; renderQuickMatch(); }
export function qmToggleEmulated() { F.emulated = !F.emulated; renderQuickMatch(); }
export function qmReset() { F.time = null; F.genre = null; F.portable = false; F.diff = null; F.emulated = false; renderQuickMatch(); }
