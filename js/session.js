// Sessão de Jogo: cronômetro em tempo real. O início fica salvo no localStorage,
// então o tempo continua correto mesmo se você fechar a aba ou recarregar a página.
import { appData, saveData } from './store.js';

const KEY = 'zeralog_session';
let timer = null;
let hooks = { render() {}, toast() {}, undo() {} };

export function getSession() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY));
        return s && s.gameId && s.startedAt ? s : null;
    } catch (e) { return null; }
}
const setSession = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} };
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const elapsedMs = s => Math.max(0, Date.now() - s.startedAt);

export function formatClock(ms) {
    const t = Math.floor(ms / 1000);
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t % 3600 / 60))}:${pad(t % 60)}`;
}
const todayBR = () => new Date().toLocaleDateString('pt-BR');
// Entradas novas ficam no topo, cada uma com a data
export function prependJournal(game, text) {
    const t = String(text || '').trim();
    if (!t) return false;
    const line = `[${todayBR()}] ${t}`;
    game.journalNotes = game.journalNotes ? `${line}\n${game.journalNotes}` : line;
    return true;
}
const formatHuman = min => min >= 60 ? `${Math.floor(min / 60)}h ${pad(min % 60)}min` : `${min} min`;

function updateBar() {
    const s = getSession();
    const bar = $('session-bar');
    if (!bar) return;
    if (!s) { bar.hidden = true; document.body.classList.remove('session-on'); return; }
    const g = appData.games.find(x => x.id === s.gameId);
    bar.hidden = false;
    document.body.classList.add('session-on');
    $('session-game').textContent = g ? g.title : 'Jogo removido';
    $('session-time').textContent = formatClock(elapsedMs(s));
}

function tick() {
    if (!getSession()) { clearInterval(timer); timer = null; }
    updateBar();
}
function startTicking() { if (!timer) timer = setInterval(tick, 1000); }

export function initSession(h) {
    hooks = h;
    if (getSession()) startTicking();
    updateBar();
}

export function startSession(gameId) {
    if (getSession()) { hooks.toast('Já existe uma sessão em andamento. Encerre-a primeiro.'); return; }
    const g = appData.games.find(x => x.id === gameId);
    if (!g) return;
    setSession({ gameId, startedAt: Date.now() });
    startTicking();
    updateBar();
    hooks.render();
    hooks.toast(`Sessão iniciada: ${g.title}`);
}

export function openEndSession() {
    const s = getSession();
    if (!s) return;
    const g = appData.games.find(x => x.id === s.gameId);
    const minutes = Math.round(elapsedMs(s) / 60000);
    $('session-summary').textContent = `${g ? g.title : 'Jogo'}: ${formatClock(elapsedMs(s))} de sessão.`;
    $('session-minutes').value = minutes;
    $('session-add').disabled = !g;
    $('session-note').value = '';
    sessionPreview();
    $('modal-session').showModal();
}

export function sessionPreview() {
    const s = getSession();
    const g = s && appData.games.find(x => x.id === s.gameId);
    const min = Math.max(0, parseInt($('session-minutes').value, 10) || 0);
    if (!g) { $('session-preview').textContent = 'Este jogo não está mais na lista; só dá para descartar a sessão.'; return; }
    const before = parseFloat(String(g.hoursPlayed || '0').replace(',', '.')) || 0;
    const after = Math.round((before + min / 60) * 100) / 100;
    $('session-preview').textContent = `Horas jogadas: ${before}h → ${after}h (+${formatHuman(min)})`;
}

export function sessionFinish(add) {
    const s = getSession();
    if (!s) { $('modal-session').close(); return; }
    const g = appData.games.find(x => x.id === s.gameId);
    let msg = 'Sessão descartada.';
    let msgNote = '';
    if (add && g) {
        const min = Math.max(0, parseInt($('session-minutes').value, 10) || 0);
        const before = parseFloat(String(g.hoursPlayed || '0').replace(',', '.')) || 0;
        hooks.undo();
        g.hoursPlayed = String(Math.round((before + min / 60) * 100) / 100);
        if (prependJournal(g, $('session-note').value)) msgNote = ' Anotação salva no diário.';
        saveData();
        msg = `+${formatHuman(min)} somados às horas jogadas de ${g.title}.${msgNote}`;
    }
    setSession(null);
    updateBar();
    $('modal-session').close();
    hooks.render();
    hooks.toast(msg);
}

export function openJournalEntry(gameId) {
    const g = appData.games.find(x => x.id === gameId);
    if (!g) return;
    $('journal-game-id').value = gameId;
    $('journal-game').textContent = g.title;
    $('journal-entry-text').value = '';
    $('modal-journal').showModal();
}

export function saveJournalEntry() {
    const g = appData.games.find(x => x.id === $('journal-game-id').value);
    if (!g) return;
    if (!$('journal-entry-text').value.trim()) { hooks.toast('Escreva algo para salvar a entrada.'); return; }
    hooks.undo();
    prependJournal(g, $('journal-entry-text').value);
    saveData();
    $('modal-journal').close();
    hooks.render();
    hooks.toast('Entrada adicionada ao diário.');
}
