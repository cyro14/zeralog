// Quick Match: filtros de humor para escolher o que jogar (e alimentar a roleta).
import { appData } from './store.js';
import { esc } from './gameApi.js';
import { icon } from './icons.js';

const F = { time: null, genre: null, portable: false, diff: null, emulated: false, platform: null, franchise: null, minScore: null };
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

export const filtersActive = () => !!(F.time || F.genre || F.portable || F.diff || F.emulated || F.platform || F.franchise || F.minScore);

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
        if (F.platform && norm(g.platform) !== norm(F.platform)) return false;
        if (F.franchise && norm(g.franchise) !== norm(F.franchise)) return false;
        if (F.minScore && !(parseFloat(g.metacritic) >= F.minScore)) return false;
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
    if (F.platform) parts.push(F.platform);
    if (F.franchise) parts.push(`franquia ${F.franchise}`);
    if (F.minScore) parts.push(`nota ${F.minScore}+ no Metacritic`);
    return parts.join(' + ');
}

function backlogGenres() {
    const map = new Map();
    appData.games.filter(g => g.state === null && !g.continuous).forEach(g => (g.genres || []).forEach(x => { if (x && !map.has(norm(x))) map.set(norm(x), x); }));
    return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function backlogEnum(field) {   // plataformas ou franquias presentes na fila
    const map = new Map();
    appData.games.filter(g => g.state === null && !g.continuous).forEach(g => {
        const v = (g[field] || '').trim();
        if (v && !map.has(norm(v))) map.set(norm(v), v);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
}

// ================= Carrossel: uma pergunta por vez =================
// Ao clicar em "Sortear", abre um questionário estilo carrossel: cada tela traz
// UMA pergunta com a opção padrão já marcada — o usuário troca ou avança, e o
// botão de CONFIRMAR o sorteio só aparece no final. Nada de lista grande nem
// botão "Sortear agora!" em cima.
let qmStep = 0;
const QM_STEPS = ['time', 'diff', 'style', 'genre', 'platform', 'franchise', 'score'];
let qmWired = false;

const qmChip = (label, on, fn) => `<button type="button" class="qm-chip ${on ? 'active' : ''}" onclick="${fn}">${esc(label)}</button>`;
const qmQuote = v => String(v).replace(/'/g, "\\'");

function qmQuestion(step) {
    switch (step) {
        case 'time': return {
            q: 'Quanto tempo você tem?',
            chips: qmChip('Qualquer duração', !F.time, 'qmSetTime(null)')
                + Object.entries(TIME).map(([k, [label]]) => qmChip(label, F.time === k, `qmSetTime('${k}')`)).join('')
        };
        case 'diff': return {
            q: 'Qual dificuldade?',
            chips: qmChip('Qualquer dificuldade', !F.diff, 'qmSetDiff(null)')
                + Object.entries(DIFF).map(([k, label]) => qmChip(label, F.diff === k, `qmSetDiff('${k}')`)).join('')
        };
        case 'style': return {
            q: 'Algum estilo especial?',
            hint: 'Pode marcar mais de um — ou nenhum.',
            chips: qmChip('RPG', !!F.genre && norm(F.genre) === 'rpg', "qmSetGenre('RPG', true)")
                + qmChip('Ideal para portátil', F.portable, 'qmTogglePortable()')
                + qmChip('Emulado', F.emulated, 'qmToggleEmulated()')
        };
        case 'genre': return {
            q: 'Qual gênero?',
            chips: qmChip('Qualquer gênero', !F.genre, 'qmSetGenre(null)')
                + backlogGenres().map(x => qmChip(x, !!F.genre && norm(F.genre) === norm(x), `qmSetGenre('${qmQuote(x)}', true)`)).join('')
        };
        case 'platform': return {
            q: 'Onde você quer jogar?',
            chips: qmChip('Qualquer plataforma', !F.platform, 'qmSetPlatform(null)')
                + backlogEnum('platform').map(x => qmChip(x, !!F.platform && norm(F.platform) === norm(x), `qmSetPlatform('${qmQuote(x)}')`)).join('')
        };
        case 'franchise': return {
            q: 'Alguma franquia em mente?',
            chips: qmChip('Qualquer franquia', !F.franchise, 'qmSetFranchise(null)')
                + backlogEnum('franchise').map(x => qmChip(x, !!F.franchise && norm(F.franchise) === norm(x), `qmSetFranchise('${qmQuote(x)}')`)).join('')
        };
        case 'score': return {
            q: 'Nota mínima no Metacritic?',
            chips: qmChip('Qualquer nota', !F.minScore, "qmSetScore('')")
                + [60, 75, 85].map(n => qmChip(`${n} ou mais`, F.minScore === n, `qmSetScore(${n})`)).join('')
        };
    }
}

function qmConfirmHtml() {
    const matches = getMatches();
    const summary = describeFilters();
    const backlog = appData.games.filter(g => g.state === null && !g.continuous);
    const chips = summary
        ? summary.split(' + ').map(p => `<span class="qm-chip active">${esc(p)}</span>`).join('')
        : `<span class="qm-chip active">Sem filtros — a fila inteira entra no sorteio</span>`;
    return `
        <div class="qm-question">Tudo pronto pra sortear!</div>
        <div class="qm-chips qm-summary">${chips}</div>
        ${matches.length
            ? `<div class="qm-ready">${matches.length} ${matches.length === 1 ? 'jogo combina' : 'jogos combinam'} — é só confirmar.</div>
                <button type="button" class="pill-btn primary qm-roll" onclick="qmConfirmSorteio()">${icon('dice', { size: '1em' })} Confirmar sorteio</button>`
            : `<div class="qm-empty">${backlog.length ? 'Nenhum jogo da fila combina com esses filtros — volte e ajuste.' : 'Sua fila está vazia. Adicione jogos pra sortear!'}</div>`}`;
}

export function renderQuickMatch() {
    const body = document.getElementById('qm-body');
    if (!body) return;
    // ao (re)abrir o painel, o carrossel volta pra primeira pergunta
    const box = document.getElementById('quick-match');
    if (box && !qmWired) {
        qmWired = true;
        box.addEventListener('toggle', () => { if (box.open) { qmStep = 0; renderQuickMatch(); } });
    }
    const last = qmStep >= QM_STEPS.length;
    const dots = Array.from({ length: QM_STEPS.length + 1 }, (_, i) => `<i class="${i === qmStep ? 'on' : ''}"></i>`).join('');
    let inner;
    if (last) inner = qmConfirmHtml();
    else {
        const { q, hint, chips } = qmQuestion(QM_STEPS[qmStep]);
        inner = `<div class="qm-question">${esc(q)}</div>${hint ? `<small class="qm-note">${hint}</small>` : ''}<div class="qm-chips">${chips}</div>`;
    }
    body.innerHTML = `
        <div class="qm-dots" aria-hidden="true">${dots}</div>
        <small class="qm-step-num">${last ? 'Confirmar' : `Pergunta ${qmStep + 1} de ${QM_STEPS.length}`}</small>
        ${inner}
        <div class="qm-nav">
            ${qmStep > 0 ? `<button type="button" class="pill-btn" onclick="qmPrev()">‹ Voltar</button>` : ''}
            ${last && summaryActive() ? `<button type="button" class="pill-btn" onclick="qmReset()">Limpar filtros</button>` : ''}
            ${!last ? `<button type="button" class="pill-btn primary" onclick="qmNext()">Avançar ›</button>` : ''}
        </div>`;
}
const summaryActive = () => filtersActive();

export function qmNext() { qmStep = Math.min(QM_STEPS.length, qmStep + 1); renderQuickMatch(); }
export function qmPrev() { qmStep = Math.max(0, qmStep - 1); renderQuickMatch(); }

// Confirma no final do carrossel: fecha o painel e roda a roleta (modal do sorteio)
export function qmConfirmSorteio() {
    const box = document.getElementById('quick-match');
    if (box) box.open = false;
    if (typeof window.spinRoulette === 'function') window.spinRoulette();
}

export function qmSetTime(k) { F.time = F.time === k ? null : k; renderQuickMatch(); }
export function qmSetGenre(v, toggle = false) {
    if (toggle && F.genre && norm(F.genre) === norm(v)) F.genre = null; else F.genre = v || null;
    renderQuickMatch();
}
export function qmTogglePortable() { F.portable = !F.portable; renderQuickMatch(); }
export function qmSetDiff(k) { F.diff = F.diff === k ? null : k; renderQuickMatch(); }
export function qmToggleEmulated() { F.emulated = !F.emulated; renderQuickMatch(); }
export function qmSetPlatform(v) { F.platform = v || null; renderQuickMatch(); }
export function qmSetFranchise(v) { F.franchise = v || null; renderQuickMatch(); }
export function qmSetScore(v) { F.minScore = parseInt(v, 10) || null; renderQuickMatch(); }
export function qmReset() { F.time = null; F.genre = null; F.portable = false; F.diff = null; F.emulated = false; F.platform = null; F.franchise = null; F.minScore = null; renderQuickMatch(); }
