// Camada de banco local do ZeraLog. Dois provedores com a MESMA interface, para o resto do app
// não saber qual está em uso (e para dar para encaixar um provedor de nuvem no futuro):
//
//   load()                        -> { metaJson, images: Map(id -> dataURL) }
//   save({ metaJson, put, del, full })
//   snapshot(rec) / listSnapshots() / getSnapshot(key)    (pontos de restauração)
//   estimate()                    -> { usage, quota }
//
// - IndexedDB (padrão): dados leves num registro, imagens em tabela própria (sem o limite de ~5 MB
//   do localStorage) e pontos de restauração diários.
// - localStorage (modo compatível): só se o IndexedDB não abrir.
const DB_NAME = 'zeralog-db', DB_VERSION = 1;
export const KEEP_SNAPSHOTS = 7;

const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });

function openDb() {
    return new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB indisponível'));
        let r;
        try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return rej(e); }
        r.onupgradeneeded = () => {
            const db = r.result;
            db.createObjectStore('meta');
            db.createObjectStore('images');
            db.createObjectStore('snapshots', { keyPath: 'key' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('IndexedDB bloqueado por outra aba'));
    });
}

const estimate = async () => {
    try { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } catch (e) { return { usage: 0, quota: 0 }; }
};

export async function createIdbProvider() {
    const db = await openDb();
    // Alguns navegadores só falham na primeira escrita (ex.: modo privado): testa já
    const probe = db.transaction('meta', 'readwrite');
    probe.objectStore('meta').put(Date.now(), '__probe');
    await done(probe);
    return {
        name: 'indexeddb',
        label: 'IndexedDB',
        async load() {
            const t = db.transaction(['meta', 'images']);
            const metaJson = await reqP(t.objectStore('meta').get('appData'));
            const im = t.objectStore('images');
            const [keys, vals] = await Promise.all([reqP(im.getAllKeys()), reqP(im.getAll())]);
            return { metaJson: typeof metaJson === 'string' ? metaJson : null, images: new Map(keys.map((k, i) => [k, vals[i]])) };
        },
        async save({ metaJson, put, del }) {
            const t = db.transaction(['meta', 'images'], 'readwrite');   // tudo ou nada
            t.objectStore('meta').put(metaJson, 'appData');
            const im = t.objectStore('images');
            put.forEach(([k, v]) => im.put(v, k));
            del.forEach(k => im.delete(k));
            await done(t);
        },
        async snapshot(rec) {
            const t = db.transaction('snapshots', 'readwrite');
            const st = t.objectStore('snapshots');
            st.put(rec);
            const all = await reqP(st.getAll());
            const dated = all.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.key)).sort((a, b) => b.key.localeCompare(a.key));
            dated.slice(KEEP_SNAPSHOTS).forEach(r => st.delete(r.key));
            await done(t);
        },
        async listSnapshots() {
            const all = await reqP(db.transaction('snapshots').objectStore('snapshots').getAll());
            return all.map(({ key, at, games }) => ({ key, at, games })).sort((a, b) => b.at - a.at);
        },
        async getSnapshot(key) { return reqP(db.transaction('snapshots').objectStore('snapshots').get(key)); },
        estimate
    };
}

export function createLegacyProvider() {
    const KEY = 'myBacklogData';
    return {
        name: 'localstorage',
        label: 'Modo compatível (localStorage, limite ~5 MB)',
        async load() { return { metaJson: localStorage.getItem(KEY), images: new Map(), inline: true }; },
        async save({ full }) { localStorage.setItem(KEY, JSON.stringify(full)); },   // imagens dentro do próprio JSON
        async snapshot() {},
        async listSnapshots() { return []; },
        async getSnapshot() { return null; },
        async estimate() {
            let usage = 0;
            try { usage = new Blob([localStorage.getItem(KEY) || '']).size; } catch (e) {}
            return { usage, quota: 5 * 1024 * 1024 };
        }
    };
}

// Provedores registrados. Um provedor de nuvem (plano Premium) seria registrado aqui com a mesma interface.
const factories = { local: createIdbProvider, legacy: async () => createLegacyProvider() };
export const registerProvider = (name, factory) => { factories[name] = factory; };

export async function openProvider(preferred = 'local') {
    try { return await (factories[preferred] || factories.local)(); }
    catch (e) { console.warn('Banco principal indisponível, usando modo compatível:', e); return createLegacyProvider(); }
}
