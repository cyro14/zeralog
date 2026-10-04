// Conquistas orientadas a dados: cada uma é calculada ao vivo a partir do appData.
// Os contadores (sessões, desejos realizados) ficam em appData.counters.
import { appData } from './store.js';
import { icon } from './icons.js';
import { hoursOf } from './quickmatch.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const hoursNum = h => { const n = parseFloat(String(h || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
const DIARY_LINE = /^\[\d{1,2}\/\d{1,2}\/\d{4}\]/;

export function buildContext() {
    const all = appData.games;
    const regular = all.filter(g => !g.continuous);
    const finished = regular.filter(g => g.state === 'finished');
    const fr = new Map();
    regular.forEach(g => {
        if (!g.franchise || !g.franchise.trim()) return;
        const k = norm(g.franchise);
        const f = fr.get(k) || { total: 0, done: 0 };
        f.total++; if (g.state === 'finished') f.done++;
        fr.set(k, f);
    });
    const c = appData.counters || {};
    return {
        finished: finished.length,
        count100: finished.filter(g => g.is100).length,
        allCovers: regular.length > 0 && regular.every(g => !!g.image),
        platforms: new Set(regular.map(g => g.platform)).size,
        estHours: regular.reduce((a, g) => a + (hoursOf(g.meta) || 0), 0),
        rated: regular.filter(g => g.userRating).length,
        wishCount: (appData.wishlist || []).length,
        wishMoved: c.wishMoved || 0,
        sessions: c.sessions || 0,
        sessionMinutes: c.sessionMinutes || 0,
        contHours: all.filter(g => g.continuous).reduce((a, g) => a + hoursNum(g.hoursPlayed), 0),
        diary: all.reduce((a, g) => a + String(g.journalNotes || '').split('\n').filter(l => DIARY_LINE.test(l.trim())).length, 0),
        completeFranchise: [...fr.values()].some(f => f.total >= 3 && f.done === f.total),
        emulated: all.filter(g => g.emulated).length,
        hardDone: finished.filter(g => g.difficulty === 'hard' || g.difficulty === 'extreme').length,
        wikis: all.filter(g => g.wiki).length,
        genresDone: new Set(finished.flatMap(g => (g.genres || []).map(norm)).filter(Boolean)).size,
        shelfCovers: finished.filter(g => !!g.image).length
    };
}

export const ACHIEVEMENTS = [
    { id: 'ach-1', name: 'Primeiro Passo', desc: 'Zerou seu primeiro jogo!', icon: 'flag', test: c => c.finished >= 1 },
    { id: 'ach-5', name: 'Embalado', desc: 'Zerou 5 jogos.', icon: 'flame', test: c => c.finished >= 5 },
    { id: 'ach-10', name: 'Mestre do Backlog', desc: 'Zerou 10 jogos no total.', icon: 'crown', test: c => c.finished >= 10 },
    { id: 'ach-covers', name: 'Colecionador', desc: 'Todos os jogos possuem capa.', icon: 'image', test: c => c.allCovers },
    { id: 'ach-platforms', name: 'Multipotencial', desc: 'Jogos em 3+ plataformas.', icon: 'layers', test: c => c.platforms >= 3 },
    { id: 'ach-marathon', name: 'Maratonista', desc: '100h+ de jogos na lista.', icon: 'activity', test: c => c.estHours >= 100 },
    { id: 'ach-critic', name: 'Crítico de Arte', desc: 'Avaliou 10 jogos zerados.', icon: 'pen', test: c => c.rated >= 10 },
    { id: 'ach-perfectionist', name: 'Perfeccionista', desc: 'Fez 100% em 1 jogo.', icon: 'gem', test: c => c.count100 >= 1 },
    { id: 'ach-legend', name: 'Lendário', desc: 'Fez 100% em 5 jogos.', icon: 'award', test: c => c.count100 >= 5 },
    // Novas, ligadas às funcionalidades recentes
    { id: 'ach-wish-5', name: 'Sonhador', desc: '5 jogos na wishlist.', icon: 'bookmark', test: c => c.wishCount >= 5 },
    { id: 'ach-wish-moved', name: 'Desejo Realizado', desc: 'Moveu um jogo da wishlist para a biblioteca.', icon: 'star', test: c => c.wishMoved >= 1 },
    { id: 'ach-session-1', name: 'Hora de Jogar', desc: 'Registrou sua primeira sessão de jogo.', icon: 'clock', test: c => c.sessions >= 1 },
    { id: 'ach-session-10h', name: 'Dedicação Total', desc: '10h somadas em sessões de jogo.', icon: 'target', test: c => c.sessionMinutes >= 600 },
    { id: 'ach-endless', name: 'Sem Fim', desc: '100h em jogos contínuos.', icon: 'infinity', test: c => c.contHours >= 100 },
    { id: 'ach-diary', name: 'Cronista de Bordo', desc: '10 entradas no Diário de Bordo.', icon: 'book', test: c => c.diary >= 10 },
    { id: 'ach-franchise', name: 'Completista', desc: 'Zerou todos os jogos de uma franquia (3+ jogos).', icon: 'library', test: c => c.completeFranchise },
    { id: 'ach-retro', name: 'Retrô', desc: '3 jogos marcados como emulados.', icon: 'gamepad', test: c => c.emulated >= 3 },
    { id: 'ach-hard', name: 'Sobrevivente', desc: 'Zerou um jogo em dificuldade Difícil ou Extremo.', icon: 'shield', test: c => c.hardDone >= 1 },
    { id: 'ach-explorer', name: 'Explorador de Wikis', desc: 'Vinculou wikis a 5 jogos.', icon: 'compass', test: c => c.wikis >= 5 },
    { id: 'ach-eclectic', name: 'Eclético', desc: 'Zerou jogos de 5 gêneros diferentes.', icon: 'shapes', test: c => c.genresDone >= 5 },
    { id: 'ach-shelf', name: 'Prateleira Cheia', desc: '15 jogos zerados com capa na estante.', icon: 'archive', test: c => c.shelfCovers >= 15 }
];

const safe = (a, ctx) => { try { return !!a.test(ctx); } catch (e) { return false; } };

// Retorna as conquistas recém-desbloqueadas. Na primeira execução (ou após a atualização)
// apenas registra o que já estava cumprido, sem disparar uma enxurrada de avisos.
export function detectNewAchievements() {
    if (!Array.isArray(appData.unlockedAchievements)) appData.unlockedAchievements = [];
    const ctx = buildContext();
    const fresh = ACHIEVEMENTS.filter(a => safe(a, ctx) && !appData.unlockedAchievements.includes(a.id));
    const seeding = !appData.achSeeded;
    if (!fresh.length && !seeding) return [];
    fresh.forEach(a => appData.unlockedAchievements.push(a.id));
    appData.achSeeded = true;
    return seeding ? [] : fresh;
}

export function renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;
    const ctx = buildContext();
    let done = 0;
    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const ok = safe(a, ctx);
        if (ok) done++;
        return `<div class="badge ${ok ? '' : 'locked'}" id="${a.id}"><span class="badge-icon">${icon(a.icon, { size: '1em' })}</span><div class="badge-title">${a.name}</div><div class="badge-desc">${a.desc}</div></div>`;
    }).join('');
    const label = document.getElementById('ach-progress');
    if (label) label.textContent = `${done}/${ACHIEVEMENTS.length}`;
    const sn = document.getElementById('sn-ach');
    if (sn) sn.textContent = `${done}/${ACHIEVEMENTS.length}`;
}
