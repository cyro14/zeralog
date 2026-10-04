// Estatísticas de gênero: gráfico de pizza (Chart.js) com legenda em HTML.
// Se o Chart.js não carregar (offline), desenha uma pizza em SVG como alternativa.
import { appData } from './store.js';
import { esc } from './gameApi.js';

const S = { base: 'played', year: 'all' };
let chart = null;
const PALETTE = ['#4f8cff', '#ff7a59', '#35c48b', '#f5c542', '#b57bff', '#26c6da', '#ef5350'];
const GREY = '#8d9db6';
const MAX_SLICES = 6;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function yearOf(g) {
    const m = String(g.dateFinished || '').match(/(\d{4})\s*$/) || String(g.dateFinished || '').match(/^(\d{4})-/);
    return m ? m[1] : null;
}

function selectGames() {
    const regular = appData.games.filter(g => !g.continuous);
    if (S.base === 'all') return regular;
    if (S.base === 'finished') return regular.filter(g => g.state === 'finished' && (S.year === 'all' || yearOf(g) === S.year));
    return regular.filter(g => g.state === 'finished' || g.state === 'playing');
}

export function genreData() {
    const games = selectGames();
    const map = new Map();
    let none = 0;
    games.forEach(g => {
        const gs = [...new Set((g.genres || []).map(x => String(x).trim()).filter(Boolean))];
        if (!gs.length) { none++; return; }
        gs.forEach(name => {
            const k = norm(name);
            const e = map.get(k) || { name, count: 0 };
            e.count++; map.set(k, e);
        });
    });
    let list = [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (list.length > MAX_SLICES) {
        const rest = list.slice(MAX_SLICES).reduce((a, e) => a + e.count, 0);
        list = list.slice(0, MAX_SLICES).concat([{ name: 'Outros', count: rest, other: true }]);
    }
    const slices = list.map((e, i) => ({ ...e, color: e.other ? '#6b7a90' : PALETTE[i % PALETTE.length] }));
    if (none) slices.push({ name: 'Sem gênero', count: none, color: GREY, none: true });
    const total = slices.reduce((a, s) => a + s.count, 0);
    slices.forEach(s => { s.pct = total ? Math.round(s.count / total * 100) : 0; });
    return { slices, total, games: games.length, none };
}

function svgPie(slices, total) {
    if (slices.length === 1) return `<svg viewBox="-1.05 -1.05 2.1 2.1" class="genre-svg"><circle r="1" fill="${slices[0].color}"/><circle r="0.55" fill="var(--card-bg)"/></svg>`;
    let acc = 0;
    const paths = slices.map(s => {
        const a0 = acc / total * 2 * Math.PI, a1 = (acc + s.count) / total * 2 * Math.PI;
        acc += s.count;
        const p = a => `${Math.sin(a).toFixed(4)} ${(-Math.cos(a)).toFixed(4)}`;
        return `<path d="M0 0 L${p(a0)} A1 1 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${s.color}" stroke="var(--card-bg)" stroke-width="0.02"/>`;
    }).join('');
    return `<svg viewBox="-1.05 -1.05 2.1 2.1" class="genre-svg">${paths}<circle r="0.55" fill="var(--card-bg)"/></svg>`;
}

export function renderGenreStats() {
    const box = document.getElementById('genre-stats');
    if (!box) return;
    const years = [...new Set(appData.games.filter(g => !g.continuous && g.state === 'finished').map(yearOf).filter(Boolean))].sort().reverse();
    if (S.year !== 'all' && !years.includes(S.year)) S.year = 'all';
    const { slices, total, games, none } = genreData();
    if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }

    const controls = `<div class="genre-controls">
        <select id="genre-base" onchange="genreSetBase(this.value)" aria-label="Base do gráfico">
            <option value="played" ${S.base === 'played' ? 'selected' : ''}>Jogados (zerados + jogando)</option>
            <option value="finished" ${S.base === 'finished' ? 'selected' : ''}>Só zerados</option>
            <option value="all" ${S.base === 'all' ? 'selected' : ''}>Biblioteca inteira</option>
        </select>
        <select id="genre-year" onchange="genreSetYear(this.value)" aria-label="Ano" ${S.base === 'finished' ? '' : 'disabled'}>
            <option value="all">Todos os anos</option>
            ${years.map(y => `<option value="${y}" ${S.year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
    </div>`;

    if (!total) {
        box.innerHTML = controls + '<div class="franchise-summary">Sem dados de gênero ainda. Use a busca automática (RAWG) ou preencha "Mais detalhes → Gêneros" nos jogos para ver o gráfico.</div>';
        return;
    }
    const legend = slices.map(s => `<li><span class="genre-dot" style="background:${s.color}"></span><span class="genre-name">${esc(s.name)}</span><span class="genre-val">${s.count} · ${s.pct}%</span></li>`).join('');
    box.innerHTML = `${controls}
        <div class="genre-body">
            <div class="genre-chart-wrap"><canvas id="genreChart" aria-label="Gráfico de gêneros" role="img"></canvas></div>
            <ul class="genre-legend">${legend}</ul>
        </div>
        <small class="genre-note">${games} ${games === 1 ? 'jogo' : 'jogos'}; quem tem vários gêneros conta em cada um.${none ? ` ${none} sem gênero definido.` : ''} Jogos contínuos ficam de fora.</small>`;

    const wrap = box.querySelector('.genre-chart-wrap');
    let drawn = false;
    if (typeof Chart !== 'undefined') {
        try {
            chart = new Chart(wrap.querySelector('canvas').getContext('2d'), {
                type: 'doughnut',
                data: { labels: slices.map(s => s.name), datasets: [{ data: slices.map(s => s.count), backgroundColor: slices.map(s => s.color), borderColor: getComputedStyle(document.body).getPropertyValue('--card-bg').trim() || '#1e1e1e', borderWidth: 2 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '55%',
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${slices[ctx.dataIndex].pct}%)` } } }
                }
            });
            drawn = true;
        } catch (e) { console.error(e); chart = null; }
    }
    if (!drawn) wrap.innerHTML = svgPie(slices, total);
}

export function genreSetBase(v) { S.base = v; renderGenreStats(); }
export function genreSetYear(v) { S.year = v; renderGenreStats(); }
