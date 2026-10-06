// Service worker do ZeraLog: mostra a Sessão de Jogo na barra de notificações,
// com botões Pausar/Retomar e Finalizar. Não faz cache de arquivos do app.
// O estado da sessão fica no IndexedDB (compartilhado com a página) para que o botão
// funcione mesmo com o app fechado.
const DB = 'zeralog-sw', STORE = 'kv', TAG = 'zeralog-session';

function idb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function get(key) {
    const db = await idb();
    return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
}
async function set(key, val) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); val === null ? tx.objectStore(STORE).delete(key) : tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

const pad = n => String(n).padStart(2, '0');
const fmt = min => min >= 60 ? `${Math.floor(min / 60)}h ${pad(min % 60)}min` : `${min} min`;
const elapsed = s => Math.max(0, (s.accMs || 0) + (s.paused || !s.runStart ? 0 : Date.now() - s.runStart));

function show(s) {
    const min = Math.floor(elapsed(s) / 60000);
    const since = new Date(s.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return self.registration.showNotification(`${s.title || 'Jogo'} · ${s.paused ? 'Pausado' : 'Em sessão'}`, {
        body: s.paused ? `Pausado com ${fmt(min)} jogados` : `Jogando há ${fmt(min)} (desde ${since})`,
        tag: TAG, renotify: false, silent: true, requireInteraction: true,
        icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
        actions: [{ action: s.paused ? 'resume' : 'pause', title: s.paused ? 'Retomar' : 'Pausar' }, { action: 'finish', title: 'Finalizar' }],
        data: { gameId: s.gameId }
    });
}

async function broadcast(msg) {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(c => c.postMessage(msg));
    return wins.length;
}

async function openApp(action) {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) {
        const c = wins[0];
        try { await c.focus(); } catch (e) {}
        c.postMessage({ type: 'session-action', action: action || 'open' });
    } else {
        await self.clients.openWindow('./' + (action ? `?sessionAction=${action}` : ''));
    }
}

async function onAction(action) {
    const s = await get('session');
    if (!s) return;
    if (action === 'pause' && !s.paused) {
        s.accMs = elapsed(s); s.runStart = null; s.paused = true; s.updatedAt = Date.now();
        await set('session', s); await show(s); await broadcast({ type: 'session-sync' });
    } else if (action === 'resume' && s.paused) {
        s.runStart = Date.now(); s.paused = false; s.updatedAt = Date.now();
        await set('session', s); await show(s); await broadcast({ type: 'session-sync' });
    } else if (action === 'finish') {
        await openApp('finish');
    } else if (action !== 'pause' && action !== 'resume') {
        await openApp(null);   // toque no corpo da notificação
    }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(onAction(e.action));
});
self.__zl = { onAction, elapsed, get, set };   // usado nos testes
