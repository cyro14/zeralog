// Sessão de Jogo: cronômetro em tempo real. O início fica salvo no localStorage,
// então o tempo continua correto mesmo se você fechar a aba ou recarregar a página.
import { appData, saveData } from './store.js';

const KEY = 'zeralog_session';
const TAG = 'zeralog-session';
let timer = null;
let lastNotifMin = -1;
let hooks = { render() {}, toast() {}, undo() {} };

// ---- estado da sessão: {gameId, title, startedAt, runStart, accMs, paused, updatedAt} ----
export function getSession() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (!s || !s.gameId || !s.startedAt) return null;
        if (s.runStart === undefined && !s.paused) { s.runStart = s.startedAt; s.accMs = s.accMs || 0; }   // sessões da versão anterior
        return s;
    } catch (e) { return null; }
}

// Cópia no IndexedDB: o service worker lê/escreve aqui (botões da notificação com o app fechado)
const DB = 'zeralog-sw', STORE = 'kv';
function idb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
async function idbSet(key, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); val === null ? tx.objectStore(STORE).delete(key) : tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

const setSession = s => {
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {}
    try { idbSet('session', s || null).catch(() => {}); } catch (e) {}
};
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
export const elapsedMs = s => Math.max(0, (s.accMs || 0) + (s.paused || !s.runStart ? 0 : Date.now() - s.runStart));

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

// ---- notificação na barra do celular ----
const notifyOn = () => appData.settings.sessionNotify !== false;
const canNotify = () => notifyOn() && typeof Notification !== 'undefined' && Notification.permission === 'granted';

async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2500))]); } catch (e) { return null; }
}

export async function showSessionNotification() {
    const s = getSession();
    if (!s) return hideSessionNotification();
    if (!canNotify()) return;
    const reg = await swReg();
    if (!reg) return;
    const min = Math.floor(elapsedMs(s) / 60000);
    const since = new Date(s.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lastNotifMin = min;
    try {
        await reg.showNotification(`${s.title || 'Jogo'} · ${s.paused ? 'Pausado' : 'Em sessão'}`, {
            body: s.paused ? `Pausado com ${formatHuman(min)} jogados` : `Jogando há ${formatHuman(min)} (desde ${since})`,
            tag: TAG, renotify: false, silent: true, requireInteraction: true,
            icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
            actions: [{ action: s.paused ? 'resume' : 'pause', title: s.paused ? 'Retomar' : 'Pausar' }, { action: 'finish', title: 'Finalizar' }],
            data: { gameId: s.gameId }
        });
    } catch (e) { /* navegador sem suporte a botões */ }
}

export async function hideSessionNotification() {
    lastNotifMin = -1;
    const reg = await swReg();
    if (!reg) return;
    try { (await reg.getNotifications({ tag: TAG })).forEach(n => n.close()); } catch (e) {}
}

export function notifyStatusText() {
    if (typeof Notification === 'undefined') return 'Este navegador não suporta notificações.';
    if (!notifyOn()) return 'Desativada.';
    return { granted: 'Permitida: o timer aparece na barra de notificações com os botões Pausar e Finalizar.', denied: 'Bloqueada nas configurações do navegador/site.', default: 'Ainda não permitida.' }[Notification.permission];
}
export function setSessionNotify(on) {
    appData.settings.sessionNotify = !!on;
    saveData(null);
    if (on) showSessionNotification(); else hideSessionNotification();
    paintNotifySettings();
}
export async function askNotifyPermission() {
    if (typeof Notification === 'undefined') return;
    try { await Notification.requestPermission(); } catch (e) {}
    paintNotifySettings();
    showSessionNotification();
}
export function paintNotifySettings() {
    const t = $('session-notify-toggle');
    if (!t) return;
    t.checked = notifyOn();
    $('session-notify-status').textContent = notifyStatusText();
    const ask = $('session-notify-ask');
    ask.style.display = (typeof Notification !== 'undefined' && notifyOn() && Notification.permission === 'default') ? '' : 'none';
}

// ---- barra no topo ----
function updateBar() {
    const s = getSession();
    const bar = $('session-bar');
    if (!bar) return;
    if (!s) { bar.hidden = true; document.body.classList.remove('session-on'); return; }
    const g = appData.games.find(x => x.id === s.gameId);
    bar.hidden = false;
    bar.classList.toggle('paused', !!s.paused);
    document.body.classList.add('session-on');
    $('session-label').textContent = s.paused ? 'Pausado' : 'Em sessão';
    $('session-game').textContent = g ? g.title : 'Jogo removido';
    $('session-time').textContent = formatClock(elapsedMs(s));
    $('session-pause').textContent = s.paused ? 'Retomar' : 'Pausar';
}

function tick() {
    const s = getSession();
    if (!s) { clearInterval(timer); timer = null; updateBar(); return; }
    updateBar();
    if (!s.paused && Math.floor(elapsedMs(s) / 60000) !== lastNotifMin) showSessionNotification();   // atualiza o tempo na notificação a cada minuto
}
function startTicking() { if (!timer) timer = setInterval(tick, 1000); }

// Traz o estado do IndexedDB (pausa/retomada feitas pela notificação com o app fechado)
export async function syncSessionFromIdb() {
    let remote = null;
    try { remote = await idbGet('session'); } catch (e) { return; }
    const local = getSession();
    if (remote && (!local || (remote.updatedAt || 0) > (local.updatedAt || 0))) {
        try { localStorage.setItem(KEY, JSON.stringify(remote)); } catch (e) {}
        startTicking(); updateBar(); hooks.render();
    }
}

export function handleSessionAction(action) {
    if (action === 'finish') openEndSession();
    else if (action === 'pause') pauseSession();
    else if (action === 'resume') resumeSession();
    else if (action === 'sync') syncSessionFromIdb();
}

export function initSession(h) {
    hooks = h;
    if (getSession()) startTicking();
    updateBar();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
            const d = e.data || {};
            if (d.type === 'session-sync') syncSessionFromIdb();
            if (d.type === 'open-tab' && window.switchTab) window.switchTab(d.tab);
            if (d.type === 'session-action') { syncSessionFromIdb().then(() => handleSessionAction(d.action)); }
        });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncSessionFromIdb(); updateBar(); } });
    syncSessionFromIdb().then(() => {
        const p = new URLSearchParams(location.search).get('sessionAction');
        if (p) {
            history.replaceState(null, '', location.pathname);
            handleSessionAction(p);
        }
    });
    paintNotifySettings();
}

export function startSession(gameId) {
    if (getSession()) { hooks.toast('Já existe uma sessão em andamento. Encerre-a primeiro.'); return; }
    const g = appData.games.find(x => x.id === gameId);
    if (!g) return;
    const now = Date.now();
    setSession({ gameId, title: g.title, startedAt: now, runStart: now, accMs: 0, paused: false, updatedAt: now });
    startTicking();
    updateBar();
    hooks.render();
    hooks.toast(`Sessão iniciada: ${g.title}`);
    // O pedido de permissão precisa acontecer dentro do toque do usuário
    if (notifyOn() && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().then(() => { paintNotifySettings(); showSessionNotification(); }).catch(() => {});
    } else showSessionNotification();
}

export function pauseSession() {
    const s = getSession();
    if (!s || s.paused) return;
    s.accMs = elapsedMs(s); s.runStart = null; s.paused = true; s.updatedAt = Date.now();
    setSession(s); updateBar(); hooks.render(); showSessionNotification();
}

export function resumeSession() {
    const s = getSession();
    if (!s || !s.paused) return;
    s.runStart = Date.now(); s.paused = false; s.updatedAt = Date.now();
    setSession(s); startTicking(); updateBar(); hooks.render(); showSessionNotification();
}

export function togglePauseSession() { const s = getSession(); if (s) (s.paused ? resumeSession() : pauseSession()); }

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
        const c = appData.counters || (appData.counters = { sessions: 0, sessionMinutes: 0, wishMoved: 0 });
        c.sessions = (c.sessions || 0) + 1;
        c.sessionMinutes = (c.sessionMinutes || 0) + min;
        g.hoursPlayed = String(Math.round((before + min / 60) * 100) / 100);
        if (prependJournal(g, $('session-note').value)) msgNote = ' Anotação salva no diário.';
        saveData();
        msg = `+${formatHuman(min)} somados às horas jogadas de ${g.title}.${msgNote}`;
    }
    setSession(null);
    hideSessionNotification();
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
