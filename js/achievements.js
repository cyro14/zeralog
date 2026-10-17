// Conquistas orientadas a dados: cada uma é calculada ao vivo a partir do appData.
// Cada conquista vale XP — o total de XP define o NÍVEL do jogador (aba Perfil e
// no Gamer ID compartilhável). Os contadores ficam em appData.counters.
import { appData } from './store.js';
import { icon } from './icons.js';
import { esc } from './gameApi.js';
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
    const gm = appData.gamematch || {};
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
        shelfCovers: finished.filter(g => !!g.image).length,
        // Novos indicadores para as conquistas da gamificação
        playing: regular.filter(g => g.state === 'playing').length,
        backlog: regular.filter(g => g.state !== 'finished' && g.state !== 'playing').length,
        userShots: all.filter(g => (g.userShots || []).length > 0).length,
        banners: all.filter(g => !!g.userBanner).length,
        matches: ((gm.likes && gm.likes.length) || 0) + ((gm.favorites && gm.favorites.length) || 0),
        franchises: [...fr.keys()].length,
        categories: (appData.categories || []).length,
        photo: !!(appData.settings.userPhoto || (appData.settings.steam || {}).avatar),
        bio: !!(appData.settings.profileBio || '').trim()
    };
}

// ---------- Nível: XP vem das conquistas; a curva sobe +50 XP por nível ----------
export const RANKS = ['Novato', 'Aventureiro', 'Explorador', 'Veterano', 'Ardiloso', 'Estrategista', 'Mestre', 'Colecionador', 'Lenda', 'Imortal'];
export const rankOf = level => RANKS[Math.max(0, Math.min(RANKS.length - 1, level - 1))];

export function levelFromXp(xp) {
    let level = 1, need = 100, base = 0;
    while (xp >= base + need) { base += need; level++; need = 100 + (level - 1) * 50; }
    const into = xp - base;
    return { level, into, need, pct: Math.max(0, Math.min(100, Math.round(into / need * 100))) };
}

export function gamerXp() {
    const un = Array.isArray(appData.unlockedAchievements) ? appData.unlockedAchievements : [];
    return ACHIEVEMENTS.filter(a => un.includes(a.id)).reduce((s, a) => s + (a.xp || 0), 0);
}

// Cada conquista tem "how": as instruções de COMO desbloquear, mostradas ao
// clicar no card dela (o "desc" é a frase de comemoração, o "how" é o passo a passo).
export const ACHIEVEMENTS = [
    // Zerar jogos
    { id: 'ach-1', name: 'Primeiro Passo', desc: 'Zerou seu primeiro jogo!', icon: 'flag', xp: 25, test: c => c.finished >= 1, how: 'Marque qualquer jogo como zerado: no card dele, use "Marcar como zerado" e preencha a conclusão.' },
    { id: 'ach-5', name: 'Embalado', desc: 'Zerou 5 jogos.', icon: 'flame', xp: 50, test: c => c.finished >= 5, how: 'Zere 5 jogos — vale qualquer plataforma, inclusive emulados.' },
    { id: 'ach-10', name: 'Mestre do Backlog', desc: 'Zerou 10 jogos no total.', icon: 'crown', xp: 75, test: c => c.finished >= 10, how: 'Zere 10 jogos no total. A contagem aparece na aba Zerados.' },
    { id: 'ach-20', name: 'Fenômeno', desc: 'Zerou 20 jogos no total.', icon: 'trophy', xp: 150, test: c => c.finished >= 20, how: 'Zere 20 jogos no total.' },
    { id: 'ach-50', name: 'Imparável', desc: 'Zerou 50 jogos no total. Respeito.', icon: 'gem', xp: 300, test: c => c.finished >= 50, how: 'Zere 50 jogos no total. Um de cada vez.' },
    // Biblioteca e colecionismo
    { id: 'ach-covers', name: 'Colecionador', desc: 'Todos os jogos possuem capa.', icon: 'image', xp: 50, test: c => c.allCovers, how: 'Dê uma capa a TODOS os jogos da biblioteca: "Trocar capa" no card de cada jogo (a busca automática da RAWG resolve rápido).' },
    { id: 'ach-platforms', name: 'Multipotencial', desc: 'Jogos em 3+ plataformas.', icon: 'layers', xp: 50, test: c => c.platforms >= 3, how: 'Tenha jogos cadastrados em 3 plataformas diferentes (PC, consoles, portáteis...).' },
    { id: 'ach-platforms-5', name: 'Cidadão do Mundo', desc: 'Jogos em 5 plataformas diferentes.', icon: 'globe', xp: 75, test: c => c.platforms >= 5, how: 'Tenha jogos em 5 plataformas diferentes.' },
    { id: 'ach-marathon', name: 'Maratonista', desc: '100h+ de jogos na lista.', icon: 'activity', xp: 75, test: c => c.estHours >= 100, how: 'Some 100h+ de tempo estimado nos jogos da lista — o total aparece na aba Status.' },
    { id: 'ach-hours-500', name: 'Escala Épica', desc: '500h+ somadas na lista.', icon: 'clock', xp: 100, test: c => c.estHours >= 500, how: 'Some 500h+ de tempo estimado na lista inteira.' },
    { id: 'ach-backlog-20', name: 'Caixa de Pendências', desc: '20 jogos esperando na fila.', icon: 'archive', xp: 50, test: c => c.backlog >= 20, how: 'Mantenha 20 jogos com status "Na fila" ao mesmo tempo.' },
    { id: 'ach-playing-3', name: 'Três Frentes', desc: '3 jogos marcados como jogando ao mesmo tempo.', icon: 'layers', xp: 50, test: c => c.playing >= 3, how: 'Marque 3 jogos como "Jogando" ao mesmo tempo (checkbox no card ou "Marcar como jogando").' },
    // Avaliações e perfeição
    { id: 'ach-critic', name: 'Crítico de Arte', desc: 'Avaliou 10 jogos zerados.', icon: 'pen', xp: 75, test: c => c.rated >= 10, how: 'Dê sua nota de 0 a 10 ao finalizar: preencha "Sua nota" ao editar a conclusão de 10 jogos zerados.' },
    { id: 'ach-rated-25', name: 'Connoisseur', desc: 'Avaliou 25 jogos zerados.', icon: 'star', xp: 100, test: c => c.rated >= 25, how: 'Avalie 25 jogos zerados com sua nota pessoal.' },
    { id: 'ach-perfectionist', name: 'Perfeccionista', desc: 'Fez 100% em 1 jogo.', icon: 'gem', xp: 50, test: c => c.count100 >= 1, how: 'Ao editar a conclusão de um jogo zerado, marque o checkbox "100%".' },
    { id: 'ach-legend', name: 'Lendário', desc: 'Fez 100% em 5 jogos.', icon: 'award', xp: 150, test: c => c.count100 >= 5, how: 'Marque "100%" na conclusão de 5 jogos zerados.' },
    { id: 'ach-hard', name: 'Sobrevivente', desc: 'Zerou um jogo em dificuldade Difícil ou Extremo.', icon: 'shield', xp: 75, test: c => c.hardDone >= 1, how: 'Escolha dificuldade "Difícil" ou "Extremo" nos dados de um jogo e zere-o.' },
    // Wishlist
    { id: 'ach-wish-5', name: 'Sonhador', desc: '5 jogos na wishlist.', icon: 'bookmark', xp: 25, test: c => c.wishCount >= 5, how: 'Adicione 5 jogos na aba Desejos (o botão "+ Desejo" busca na RAWG).' },
    { id: 'ach-wish-20', name: 'Arquiteto de Desejos', desc: '20 jogos na wishlist.', icon: 'heart', xp: 75, test: c => c.wishCount >= 20, how: 'Tenha 20 jogos na wishlist.' },
    { id: 'ach-wish-moved', name: 'Desejo Realizado', desc: 'Moveu um jogo da wishlist para a biblioteca.', icon: 'star', xp: 25, test: c => c.wishMoved >= 1, how: 'Na aba Desejos, use "Para a fila" num jogo — ou "Jogar agora" para começar na hora.' },
    // Sessões e tempo
    { id: 'ach-session-1', name: 'Hora de Jogar', desc: 'Registrou sua primeira sessão de jogo.', icon: 'clock', xp: 25, test: c => c.sessions >= 1, how: 'No card de um jogo, use "Iniciar sessão" e finalize com "Finalizar" na barra do topo.' },
    { id: 'ach-session-10h', name: 'Dedicação Total', desc: '10h somadas em sessões de jogo.', icon: 'target', xp: 50, test: c => c.sessionMinutes >= 600, how: 'Some 10h em sessões registradas (o cronômetro da barra de sessão conta sozinho).' },
    { id: 'ach-session-50h', name: 'Maratona de Sessões', desc: '50h somadas em sessões de jogo.', icon: 'activity', xp: 100, test: c => c.sessionMinutes >= 3000, how: 'Some 50h em sessões registradas.' },
    { id: 'ach-endless', name: 'Sem Fim', desc: '100h em jogos contínuos.', icon: 'infinity', xp: 75, test: c => c.contHours >= 100, how: 'Some 100h jogadas em jogos marcados como Contínuos (as horas vão no card deles).' },
    // Diário, franquias e organização
    { id: 'ach-diary', name: 'Cronista de Bordo', desc: '10 entradas no Diário de Bordo.', icon: 'book', xp: 50, test: c => c.diary >= 10, how: 'Escreva 10 entradas no diário: botão "Anotar no diário" dentro da seção do diário, na tela de um jogo.' },
    { id: 'ach-franchise', name: 'Completista', desc: 'Zerou todos os jogos de uma franquia (3+ jogos).', icon: 'library', xp: 100, test: c => c.completeFranchise, how: 'Preencha o campo "Franquia" nos jogos de uma série com 3+ títulos e zere todos eles.' },
    { id: 'ach-franchises-5', name: 'Arquivista', desc: 'Organizou seus jogos em 5 franquias diferentes.', icon: 'library', xp: 75, test: c => c.franchises >= 5, how: 'Preencha o campo "Franquia" de jogos de 5 séries diferentes (a busca automática já sugere).' },
    { id: 'ach-retro', name: 'Retrô', desc: '3 jogos marcados como emulados.', icon: 'gamepad', xp: 50, test: c => c.emulated >= 3, how: 'Marque 3 jogos como emulados (checkbox "Emulado" + console original nos dados do jogo).' },
    { id: 'ach-explorer', name: 'Explorador de Wikis', desc: 'Vinculou wikis a 5 jogos.', icon: 'compass', xp: 50, test: c => c.wikis >= 5, how: 'Na tela de um jogo, use "Wiki" para vincular a página da Wikipedia/Fandom dele — 5 jogos e pronto.' },
    { id: 'ach-eclectic', name: 'Eclético', desc: 'Zerou jogos de 5 gêneros diferentes.', icon: 'shapes', xp: 75, test: c => c.genresDone >= 5, how: 'Zere jogos de 5 gêneros diferentes (os gêneros vêm da busca automática ou do preenchimento manual).' },
    { id: 'ach-genres-10', name: 'Poliglota de Gêneros', desc: 'Zerou jogos de 10 gêneros diferentes.', icon: 'shapes', xp: 100, test: c => c.genresDone >= 10, how: 'Zere jogos de 10 gêneros diferentes.' },
    { id: 'ach-shelf', name: 'Prateleira Cheia', desc: '15 jogos zerados com capa na estante.', icon: 'archive', xp: 100, test: c => c.shelfCovers >= 15, how: 'Zere 15 jogos que tenham capa — a estante da aba Zerados fica cheia.' },
    // Personalização e GameMatch
    { id: 'ach-shots', name: 'Fotógrafo de Tela', desc: 'Enviou uma screenshot própria num jogo.', icon: 'image', xp: 50, test: c => c.userShots >= 1, how: 'Na tela de um jogo, seção "Suas screenshots": envie a primeira imagem.' },
    { id: 'ach-banner', name: 'Cenógrafo', desc: 'Colocou um fundo personalizado na página de um jogo.', icon: 'image', xp: 50, test: c => c.banners >= 1, how: 'Na tela de um jogo, toque no banner do topo e escolha "Enviar imagem" para o fundo.' },
    { id: 'ach-match-10', name: 'Cupido de Jogos', desc: '10 matches no GameMatch (curtidas ou favoritos).', icon: 'heart', xp: 50, test: c => c.matches >= 10, how: 'No GameMatch, curta (→) ou favorite (⭐) 10 jogos no deck de Descobrir.' },
    { id: 'ach-photo', name: 'Rosto Marcado', desc: 'Definiu sua foto de perfil.', icon: 'user', xp: 25, test: c => c.photo, how: 'Na aba Perfil, use "Enviar foto" (ou conecte sua conta da Steam para puxar o avatar).' },
    { id: 'ach-bio', name: 'Cronista Pessoal', desc: 'Escreveu uma descrição no seu perfil.', icon: 'pen', xp: 25, test: c => c.bio, how: 'Na aba Perfil, escreva uma descrição sobre você e salve.' }
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
    const cards = ACHIEVEMENTS.map(a => {
        const ok = safe(a, ctx);
        if (ok) done++;
        // cada conquista é clicável: abre o passo a passo de como desbloquear
        return `<div class="badge ${ok ? '' : 'locked'}" id="${a.id}" role="button" tabindex="0" onclick="openAchDetail('${a.id}')" onkeydown="if(event.key==='Enter')openAchDetail('${a.id}')" title="Ver como conquistar" aria-label="Como conquistar: ${esc(a.name)}"><span class="badge-icon">${icon(a.icon, { size: '1em' })}</span><div class="badge-title">${esc(a.name)}</div><div class="badge-desc">${esc(a.desc)}</div><div class="badge-xp">+${a.xp} XP</div></div>`;
    }).join('');
    // PLATINA: desbloqueou tudo — o troféu máximo, no topo da grade
    const all = ACHIEVEMENTS.length > 0 && done >= ACHIEVEMENTS.length;
    const platina = all
        ? `<div class="badge platinum"><span class="badge-icon">${icon('trophy', { size: '1em' })}</span><div class="badge-title">Platina do ZeraLog</div><div class="badge-desc">Você desbloqueou TODAS as ${ACHIEVEMENTS.length} conquistas. Isso é história!</div><div class="badge-xp">∞ XP</div></div>`
        : '';
    grid.innerHTML = platina + cards;
    const label = document.getElementById('ach-progress');
    if (label) label.textContent = all ? `${done}/${ACHIEVEMENTS.length} · PLATINA!` : `${done}/${ACHIEVEMENTS.length}`;
    const sn = document.getElementById('sn-ach');
    if (sn) sn.textContent = `${done}/${ACHIEVEMENTS.length}`;
}

// Detalhe da conquista: comemoração, XP, status e o COMO conquistar
export function openAchDetail(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    const un = (Array.isArray(appData.unlockedAchievements) ? appData.unlockedAchievements : []).includes(id);
    const box = document.getElementById('ach-detail');
    if (!box) return;
    box.innerHTML = `
        <div class="ach-head">
            <span class="badge-icon big ${un ? '' : 'locked'}">${icon(a.icon, { size: '2em' })}</span>
            <div>
                <h3 style="margin: 0;">${esc(a.name)}</h3>
                <div class="ach-status ${un ? 'un' : ''}">${un ? 'Desbloqueada' : 'Ainda bloqueada'} · +${a.xp} XP</div>
            </div>
        </div>
        <p class="ach-desc">${esc(a.desc)}</p>
        <div class="ach-how"><strong>Como conquistar:</strong><br>${esc(a.how)}</div>
        <div class="modal-actions"><button onclick="closeModal('modal-ach')">Fechar</button></div>
    `;
    document.getElementById('modal-ach').showModal();
}
