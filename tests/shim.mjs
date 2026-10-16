// ============================================================================
// Shim de navegador mínimo para rodar os módulos REAIS do app (js/*.js) no Node,
// sem jsdom e sem nenhuma dependência. Importado por todos os *.test.mjs.
//
// Como usar num teste:
//   import { test, assert, assertEq, mockFetch, unmockFetch, elById, sleep } from './shim.mjs';
//   import { algumaCoisa } from '../js/modulo.js';   // sempre DEPOIS do shim
//   test('descrição do comportamento', () => { assert(...); });
//
// Rodar tudo: node tests/run.mjs   (ou `npm test`)
// ============================================================================

// ---------- fila de testes (run.mjs executa em ordem) ----------
export const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

// ---------- asserts mínimos ----------
export function assert(cond, msg) { if (!cond) throw new Error(msg || 'condição falsa'); }
export function assertEq(actual, expected, msg) {
    if (actual !== expected) throw new Error(`${msg || 'assertEq'}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
}
export function skipTest(reason) { const e = new Error(reason || 'pulado'); e.skip = true; throw e; }
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- DOM falso ----------
const byId = new Map();
export const created = [];
export function elById(id) { return byId.get(id); }

function makeEl() {
    const el = {
        innerHTML: '', className: '', id: '', value: '', hidden: false, files: [], dataset: {}, style: {}, isConnected: true, _cls: [],
        classList: { add(...c) { el._cls.push(...c); }, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { return c; }, addEventListener() {}, removeEventListener() {}, remove() {},
        querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
        contains: () => true, getBoundingClientRect: () => ({ top: 0, bottom: 10, left: 10, right: 100, width: 90 }),
        click() {}, focus() {}, blur() {}, close() {},
    };
    return el;
}

// localStorage em memória + diálogos do navegador + eventos do window
function installGlobals() {
    if (globalThis.document) return;
    globalThis.localStorage = {
        _s: {},
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
        setItem(k, v) { this._s[k] = String(v); },
        removeItem(k) { delete this._s[k]; },
    };
    globalThis.document = {
        addEventListener() {}, removeEventListener() {},
        createElement: () => { const e = makeEl(); created.push(e); return e; },
        getElementById: id => { if (!byId.has(id)) byId.set(id, makeEl()); return byId.get(id); },
        querySelector: () => null, querySelectorAll: () => [],
        body: makeEl(), head: makeEl(), documentElement: makeEl(),
    };
    globalThis.window = globalThis;
    globalThis.requestAnimationFrame = fn => fn();
    globalThis.location = globalThis.location || { protocol: 'https:' };
    globalThis.history = globalThis.history || { pushState() {}, go() {}, back() {} };
    globalThis.confirm = globalThis.confirm || (() => true);
    globalThis.alert = globalThis.alert || (() => {});
    globalThis.prompt = globalThis.prompt || (() => null);
    if (!globalThis.dispatchEvent) globalThis.dispatchEvent = () => true;
    if (!globalThis.CustomEvent) globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } };
}
installGlobals();

// ---------- mock de fetch (para testes herméticos, sem rede) ----------
// mockFetch([['pedaço-da-url', objetoRetornado], ...]) — o primeiro que casar vence.
// Qualquer URL fora do mapa vai para o fetch real (usado nos testes ao vivo).
const realFetch = globalThis.fetch;
let fetchMap = null;
export function mockFetch(map) { fetchMap = map; }
export function unmockFetch() { fetchMap = null; }
globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (fetchMap) {
        for (const [key, data] of fetchMap) {
            if (u.includes(key)) {
                return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
            }
        }
    }
    return realFetch(url, opts);
};

// ---------- estado limpo entre um teste e outro ----------
// Importado DEPOIS de installGlobals — store.js não precisa de DOM no carregamento.
import { defaultData, migrateData, setAppData, initStore } from '../js/store.js';
import { registerProvider } from '../js/db.js';

// Banco em memória: registra como provider "local" e liga o store igual ao app real.
// Assim saveData() funciona nos testes (nada de erro de IndexedDB no Node).
const memDb = { meta: null, images: new Map() };
registerProvider('local', async () => ({
    name: 'memory', label: 'Memória (testes)',
    async load() { return { metaJson: memDb.meta, images: new Map(memDb.images) }; },
    async save({ metaJson, put, del }) { memDb.meta = metaJson; put.forEach(([id, v]) => memDb.images.set(id, v)); del.forEach(id => memDb.images.delete(id)); },
    async estimate() { return { usage: 0, quota: 1e9 }; },
    async snapshot() {}, async listSnapshots() { return []; }, async getSnapshot() { return null; }, async clear() { memDb.meta = null; memDb.images.clear(); },
}));
await initStore();   // liga o provider de memória (o mesmo caminho do app no boot)

export function resetShim() {
    byId.clear();
    created.length = 0;
    unmockFetch();
    // banco de dados fresco: mesmo caminho de um usuário novo (migrações inclusas)
    setAppData(migrateData(JSON.parse(JSON.stringify(defaultData))));
}

// Ajuda para testes ao vivo: erros de rede/limite da RAWG pulam o teste em vez de falhar
export async function live(promise) {
    try { return await promise; }
    catch (e) {
        if (e && (e.kind === 'network' || e.status === 429 || e.status === 401 || e.status === 403)) {
            skipTest(`RAWG indisponível (${e.kind || e.status}) — testando outro dia`);
        }
        throw e;
    }
}
