import { platformIcons } from './icons.js';
import { openProvider } from './db.js';
import { planInfo } from './plan.js';

// Ícones e dados padrão
export const defaultPlatformsIcons = platformIcons;

export const homeSortLabels = { 'manual': 'Manual', 'az': 'A-Z', 'time': 'Tempo', 'portable': 'Portátil' };
export const sortLabels = { 'date': 'Data', 'rating': 'Nota', 'time': 'Tempo', 'portable': 'Portátil' };

export const defaultData = {
    settings: { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc', finishedView: 'list', timelineDir: 'desc', homeView: 'list', platformDisplay: 'icon' }, 
    collapsedCats: [], 
    categories: [ { id: 'c1', name: 'Cartas e Estratégia' }, { id: 'c2', name: 'Plataforma 3D' } ],
    platforms: [
        { name: 'PC', icon: defaultPlatformsIcons['PC'] },
        { name: 'Nintendo', icon: defaultPlatformsIcons['Nintendo'] },
        { name: 'Playstation', icon: defaultPlatformsIcons['Playstation'] },
        { name: 'Xbox', icon: defaultPlatformsIcons['Xbox'] },
        { name: 'Mobile', icon: defaultPlatformsIcons['Mobile'] }
    ],
    games: [],
    wikis: [],
    wishlist: [],
    savedFilters: [],
    counters: { sessions: 0, sessionMinutes: 0, wishMoved: 0 },
    achSeeded: false,
    unlockedAchievements: [] 
};

const clone = o => JSON.parse(JSON.stringify(o));
export let appData = clone(defaultData);
export let backupData = null;

// Função para atualizar a referência global em caso de restauração de backup
export function setAppData(newData) { appData = newData; }
export function setBackupData(data) { backupData = data; }

const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const str = (v, fallback = '') => (v === null || v === undefined ? fallback : String(v));

// Deixa qualquer dado (antigo, importado ou incompleto) no formato atual, sem apagar nada do usuário
export function migrateData(data) {
    if (!isObj(data)) data = clone(defaultData);
    ['categories', 'games', 'wikis', 'wishlist', 'collapsedCats', 'unlockedAchievements', 'savedFilters'].forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    if (!Array.isArray(data.platforms)) data.platforms = clone(defaultData.platforms);
    data.settings = { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc', finishedView: 'list', timelineDir: 'desc', wishSort: 'release', wishView: 'list', ...(isObj(data.settings) ? data.settings : {}) };
    if (!isObj(data.settings.filters)) data.settings.filters = {};
    ['home', 'finished', 'wish'].forEach(t => { if (!Array.isArray(data.settings.filters[t])) data.settings.filters[t] = []; });
    data.counters = { sessions: 0, sessionMinutes: 0, wishMoved: 0, ...(isObj(data.counters) ? data.counters : {}) };
    if (data.achSeeded === undefined) data.achSeeded = false;

    data.categories = data.categories.filter(isObj).map(c => ({ ...c, id: str(c.id, 'c' + Math.random().toString(36).slice(2, 8)), name: str(c.name, 'Categoria') }));
    data.platforms = data.platforms.filter(isObj).map(p => ({ ...p, name: str(p.name) })).filter(p => p.name);
    data.wikis = data.wikis.filter(isObj);
    const fixItem = (g, prefix) => {
        const o = { ...g, id: str(g.id, prefix + Math.random().toString(36).slice(2, 10)), title: str(g.title, 'Sem título'), platform: str(g.platform) };
        if (!Array.isArray(o.genres)) o.genres = typeof o.genres === 'string' ? o.genres.split(',').map(x => x.trim()).filter(Boolean) : [];
        if (o.journalNotes === null) o.journalNotes = '';
        if (o.description === null) o.description = '';
        return o;
    };
    data.games = data.games.filter(isObj).map(g => fixItem(g, 'g'));
    data.wishlist = data.wishlist.filter(isObj).map(g => fixItem(g, 'w'));

    // Troca emojis e ícones antigos pelos ícones SVG (mantém imagens e ícones personalizados)
    data.platforms.forEach(p => {
        const cur = String(p.icon || '');
        if (cur.startsWith('<img') || cur.includes('class="ic') || cur.includes('class="ph-ico')) return;
        const key = Object.keys(defaultPlatformsIcons).find(k => k !== 'default' && k.toLowerCase() === p.name.toLowerCase());
        p.icon = key ? defaultPlatformsIcons[key] : defaultPlatformsIcons.default;
    });
    // Categorias padrão antigas tinham emoji no nome
    const renamed = { '\u{1F0CF} Cartas e Estratégia': 'Cartas e Estratégia', '\u{1F344} Plataforma 3D': 'Plataforma 3D' };
    data.categories.forEach(c => { if (renamed[c.name]) c.name = renamed[c.name]; });
    return data;
}

// ================= PERSISTÊNCIA (IndexedDB, com modo compatível) =================
// Os dados leves vão num registro e as imagens numa tabela própria (id -> data URL).
// O app continua trabalhando com o objeto `appData` em memória; salvar é assíncrono em segundo plano.
const IMG_MARK = '@idb';
const LEGACY_KEY = 'myBacklogData';
const OLD_KEY = 'myBacklogData_old';
let provider = null;
const imgCache = new Map();          // id -> imagem já gravada no banco
let writing = false, dirty = false, lastSnapshotKey = null;
export const storageState = { engine: 'carregando', label: '', migrated: false, recovered: false, persistent: null, lastError: null };

const imageOwners = () => [...appData.games, ...(appData.wishlist || [])];
const metaReplacer = (k, v) => (k === 'image' && typeof v === 'string' && v ? IMG_MARK : v);

function attachImages(data, images) {
    [...(data.games || []), ...(data.wishlist || [])].forEach(it => {
        if (it && it.image === IMG_MARK) it.image = images.get(it.id) || null;
    });
}

function tryParse(raw) { try { const v = JSON.parse(raw); return isObj(v) ? v : null; } catch (e) { return null; } }
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

export async function initStore() {
    provider = await openProvider(planInfo().provider);
    storageState.engine = provider.name;
    storageState.label = provider.label;
    let loaded = { metaJson: null, images: new Map() };
    try { loaded = await provider.load(); } catch (e) { console.error('Falha ao ler o banco:', e); storageState.lastError = String(e && e.message || e); }
    loaded.images.forEach((v, k) => imgCache.set(k, v));

    let data = null;
    const legacyRaw = provider.name === 'indexeddb' ? lsGet(LEGACY_KEY) : null;
    if (legacyRaw) {
        data = tryParse(legacyRaw);
        if (data) storageState.migrated = true;
        else { try { localStorage.setItem('myBacklogData_corrupt', legacyRaw); } catch (e) {} storageState.recovered = true; }
    }
    if (!data && loaded.metaJson) {
        data = tryParse(loaded.metaJson);
        if (data) attachImages(data, loaded.images);
        else storageState.recovered = true;
    }
    setAppData(migrateData(data || clone(defaultData)));
    if (provider.name === 'localstorage' && loaded.metaJson && !data) storageState.recovered = true;

    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(p => { storageState.persistent = p; }).catch(() => {}); } catch (e) {}

    if (storageState.migrated) await finishMigration(legacyRaw);
    return storageState;
}

// Grava tudo no novo banco, confere e só então tira o dado do localStorage
async function finishMigration(legacyRaw) {
    try {
        if (provider.snapshot) await provider.snapshot({ key: 'pre-migracao', at: Date.now(), games: appData.games.length, json: legacyRaw.length > 2_000_000 ? '{}' : legacyRaw }).catch(() => {});
        await persistOnce();
        const back = await provider.load();
        const meta = tryParse(back.metaJson);
        const wantImgs = imageOwners().filter(g => g.image).length;
        const gotImgs = [...back.images.values()].filter(Boolean).length;
        if (!meta || meta.games.length !== appData.games.length || gotImgs < wantImgs) throw new Error('verificação da migração falhou');
        try { localStorage.removeItem(LEGACY_KEY); localStorage.setItem(OLD_KEY, legacyRaw); localStorage.setItem('zeralog_old_at', String(Date.now())); } catch (e) { /* sem espaço para a cópia antiga: tudo bem, os dados já estão no banco novo */ }
    } catch (e) {
        console.error(e);
        storageState.lastError = 'A migração para o novo banco falhou; seus dados continuam no armazenamento antigo.';
    }
}

export function hasLegacyCopy() { return lsGet(OLD_KEY) !== null; }
export function clearLegacyCopy() { try { localStorage.removeItem(OLD_KEY); localStorage.removeItem('zeralog_old_at'); } catch (e) {} }
export function purgeOldLegacyCopy(days = 14) {
    const at = Number(lsGet('zeralog_old_at') || 0);
    if (at && Date.now() - at > days * 86400000) clearLegacyCopy();
}

function diffImages() {
    const put = [], del = [], seen = new Set();
    imageOwners().forEach(it => {
        seen.add(it.id);
        const cur = it.image || null;
        if (cur && imgCache.get(it.id) !== cur) put.push([it.id, cur]);
        else if (!cur && imgCache.has(it.id)) del.push(it.id);
    });
    imgCache.forEach((_, id) => { if (!seen.has(id)) del.push(id); });
    return { put, del };
}

async function persistOnce() {
    const metaJson = JSON.stringify(appData, provider.name === 'indexeddb' ? metaReplacer : undefined);
    const { put, del } = provider.name === 'indexeddb' ? diffImages() : { put: [], del: [] };
    await provider.save({ metaJson, put, del, full: appData });
    put.forEach(([id, v]) => imgCache.set(id, v));
    del.forEach(id => imgCache.delete(id));
    const today = new Date().toISOString().slice(0, 10);
    if (provider.name === 'indexeddb' && lastSnapshotKey !== today) {
        lastSnapshotKey = today;
        await provider.snapshot({ key: today, at: Date.now(), games: appData.games.length, json: metaJson }).catch(() => {});
    }
}

async function flush() {
    writing = true;
    try {
        while (dirty) { dirty = false; await persistOnce(); }
        storageState.lastError = null;
    } catch (e) {
        console.error('Falha ao salvar:', e);
        storageState.lastError = String(e && e.message || e);
        window.dispatchEvent(new CustomEvent('zeralog:save-error', { detail: storageState.lastError }));
    } finally { writing = false; }
}

// Aceita um callback opcional para renderizar a UI sem gerar dependência circular
export function saveData(triggerRenderCallback = null) {
    dirty = true;
    if (!writing) flush();
    if (triggerRenderCallback) triggerRenderCallback();
}
export const whenSaved = async () => { while (writing || dirty) await new Promise(r => setTimeout(r, 20)); };

// ================= INFORMAÇÕES E PONTOS DE RESTAURAÇÃO =================
export async function getStorageInfo() {
    const est = provider ? await provider.estimate() : { usage: 0, quota: 0 };
    return { ...est, engine: storageState.engine, label: storageState.label, persistent: storageState.persistent };
}
export async function listSnapshots() { return provider ? provider.listSnapshots() : []; }
export async function restoreSnapshot(key) {
    const rec = provider && await provider.getSnapshot(key);
    const data = rec && tryParse(rec.json);
    if (!data) throw new Error('Ponto de restauração vazio ou ilegível.');
    attachImages(data, imgCache);   // reaproveita as imagens que ainda estão no banco
    setAppData(migrateData(data));
    saveData();
    await whenSaved();
}
