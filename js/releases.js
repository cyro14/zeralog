// Datas de lançamento da wishlist: contagem regressiva, atualização pela RAWG e aviso quando o jogo lança.
// Sem servidor não existe "push" garantido: o app confere ao abrir e a cada hora com ele aberto; em Android
// com o app instalado, o service worker também confere em segundo plano (Periodic Background Sync), sem rede.
import { appData, saveData } from './store.js';
import { searchGames, getGameDetails } from './gameApi.js';

const DAY = 86400000;
const pad = n => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const parseISO = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export function daysUntil(iso) {
    const d = parseISO(iso);
    if (!d) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / DAY);
}
export function fmtDate(iso, long = false) {
    const d = parseISO(iso);
    if (!d) return '';
    return d.toLocaleDateString('pt-BR', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '');
}
// 'future' | 'today' | 'released' | 'tba' | 'unknown'
export function releaseState(w) {
    const n = daysUntil(w.released);
    if (n === null) return w.tba ? 'tba' : 'unknown';
    return n > 0 ? 'future' : (n === 0 ? 'today' : 'released');
}
export function countdownText(w) {
    const n = daysUntil(w.released);
    if (n === null) return w.tba ? 'Data a confirmar' : 'Sem data';
    if (n > 60) return `Lança em ${Math.round(n / 30)} meses`;
    if (n > 1) return `Lança em ${n} dias`;
    if (n === 1) return 'Lança amanhã';
    if (n === 0) return 'Lança hoje!';
    const a = -n;
    if (a < 30) return `Lançado há ${a} ${a === 1 ? 'dia' : 'dias'}`;
    if (a < 365) { const m = Math.round(a / 30); return `Lançado há ${m} ${m === 1 ? 'mês' : 'meses'}`; }
    const y = Math.floor(a / 365); return `Lançado há ${y} ${y === 1 ? 'ano' : 'anos'}`;
}

// ---------- cópia da lista de avisos no IndexedDB (o service worker lê daqui) ----------
const DB = 'zeralog-sw', STORE = 'kv';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); v === null ? tx.objectStore(STORE).delete(k) : tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

export async function syncReleaseWatch() {
    try {
        const list = (appData.wishlist || []).filter(w => w.notifyRelease && !w.releaseNotified && w.released).map(w => ({ id: w.id, title: w.title, released: w.released }));
        await idbSet('releases', list);
    } catch (e) { /* sem IndexedDB: só confere com o app aberto */ }
}

async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2000))]); } catch (e) { return null; }
}

async function showReleaseNotification(w) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await swReg();
    if (!reg) return;
    try {
        await reg.showNotification(`${w.title} já está disponível!`, {
            body: `Lançamento em ${fmtDate(w.released, true)}. Toque para abrir sua wishlist.`,
            tag: `zeralog-release-${w.id}`, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { tab: 'wish' }
        });
    } catch (e) { /* sem suporte */ }
}

// Marca como avisados os jogos que o service worker já notificou em segundo plano
async function mergeDoneFromSw() {
    try {
        const done = await idbGet('releasesDone');
        if (!Array.isArray(done) || !done.length) return 0;
        let n = 0;
        (appData.wishlist || []).forEach(w => { if (done.includes(w.id) && !w.releaseNotified) { w.releaseNotified = true; n++; } });
        await idbSet('releasesDone', null);
        if (n) saveData();
        return n;
    } catch (e) { return 0; }
}

// Retorna os jogos que acabaram de lançar (e dispara as notificações)
export async function checkReleases() {
    await mergeDoneFromSw();
    const due = (appData.wishlist || []).filter(w => w.notifyRelease && !w.releaseNotified && w.released && daysUntil(w.released) <= 0);
    if (due.length) {
        due.forEach(w => { w.releaseNotified = true; });
        saveData();
        for (const w of due) await showReleaseNotification(w);
    }
    await syncReleaseWatch();
    return due;
}

export async function askNotifyIfNeeded() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
}

export async function registerPeriodicCheck() {
    try {
        const reg = await swReg();
        if (!reg || !reg.periodicSync) return false;
        const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (st.state !== 'granted') return false;
        await reg.periodicSync.register('zeralog-releases', { minInterval: 12 * 3600 * 1000 });
        return true;
    } catch (e) { return false; }
}

// ---------- atualizar datas pela RAWG ----------
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const needsRefresh = w => (!w.released || daysUntil(w.released) > 0) && (Date.now() - (w.releaseCheckedAt || 0) > DAY);

export async function refreshReleaseDates({ force = false, onProgress } = {}) {
    const items = (appData.wishlist || []).filter(w => force || needsRefresh(w));
    let changed = 0, done = 0;
    for (const w of items) {
        onProgress && onProgress({ done, total: items.length, title: w.title });
        try {
            let id = w.rawgId;
            if (!id) {
                const res = await searchGames(w.title, 5);
                const hit = res.find(r => norm(r.title) === norm(w.title));
                if (hit) { id = hit.rawgId; w.rawgId = id; }
            }
            if (id) {
                const d = await getGameDetails(id);
                const before = w.released || '';
                if ((d.released || '') !== before || !!d.tba !== !!w.tba) {
                    w.released = d.released || '';
                    w.tba = !!d.tba && !d.released;
                    if (w.released && daysUntil(w.released) > 0) w.releaseNotified = false;   // data adiada/ajustada: volta a avisar
                    changed++;
                }
                if (!w.genres || !w.genres.length) w.genres = d.genres || [];
                if (!w.metacritic && d.metacritic) w.metacritic = d.metacritic;
            }
        } catch (e) { /* sem rede ou limite: tenta na próxima */ }
        w.releaseCheckedAt = Date.now();
        done++;
        await new Promise(r => setTimeout(r, 250));
    }
    if (items.length) saveData();
    onProgress && onProgress({ done, total: items.length, finished: true });
    await syncReleaseWatch();
    return { checked: items.length, changed };
}
