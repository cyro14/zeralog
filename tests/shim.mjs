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

// contexto 2D falso: no-ops para tudo, mas fillText/strokeText GRAVAM o texto
// desenhado em el._texts — assim os testes conferem o CONTEÚDO das imagens.
function ctx2dStub(el) {
    const texts = [];
    el._texts = texts;
    const grad = () => ({ addColorStop() {} });
    return new Proxy({}, {
        get(t, k) {
            if (typeof k === 'symbol') return undefined;
            if (k === 'measureText') return s => ({ width: String(s).length * 8 });
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return grad;
            if (k === 'fillText' || k === 'strokeText') return s => { texts.push(String(s)); };
            if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4 * 24 * 24) });
            if (k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
            return t[k] !== undefined ? t[k] : () => undefined;
        },
        set(t, k, v) { t[k] = v; return true; }
    });
}

function makeEl() {
    const el = {
        innerHTML: '', className: '', id: '', value: '', hidden: false, files: [], dataset: {}, isConnected: true, _cls: [], _shown: 0, _texts: [],
        style: (() => { const s = {}; s.setProperty = (k, v) => { s[k] = v; }; s.getPropertyValue = k => s[k] || ''; s.removeProperty = k => { delete s[k]; }; return s; })(),
        classList: {
            // como no DOM, cada classe aparece UMA vez (o toggle true repetido não duplica)
            add(...c) { c.forEach(x => { if (!el._cls.includes(x)) el._cls.push(x); }); },
            remove(...c) { c.forEach(x => { const i = el._cls.indexOf(x); if (i > -1) el._cls.splice(i, 1); }); },
            toggle(c, force) {
                const on = force === undefined ? !el._cls.includes(c) : !!force;
                const i = el._cls.indexOf(c);
                if (on && i === -1) el._cls.push(c);
                else if (!on && i > -1) el._cls.splice(i, 1);
            },
            contains: c => el._cls.includes(c),
        },
        appendChild(c) { return c; }, addEventListener() {}, removeEventListener() {}, remove() {},
        setAttribute(k, v) { el[k] = v; }, getAttribute() { return null; },
        querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
        contains: () => true, getBoundingClientRect: () => ({ top: 0, bottom: 10, left: 10, right: 100, width: 90 }),
        click() {}, focus() {}, blur() {}, close() {},
        showModal() { el._shown++; },  // <dialog> aberto (a tela cheia de compartilhar)
        getContext() { if (!el._ctx2d) el._ctx2d = ctx2dStub(el); return el._ctx2d; },
        toBlob(cb) { setTimeout(() => cb(new Blob(['x'], { type: 'image/png' })), 0); },
        toDataURL() { return 'data:image/png;base64,TESTE'; },
    };
    // como no DOM, textContent é sempre TEXTO (o app chega a gravar números, ex.: o
    // contador do badge de filtros, e os testes comparam com string)
    let text = '';
    Object.defineProperty(el, 'textContent', {
        get: () => text,
        set: v => { text = v === null || v === undefined ? '' : String(v); },
        enumerable: true
    });
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
    // navigator mínimo: session.js/releases.js conferem 'serviceWorker' in navigator
    // (sem isso, a chamada lançava ReferenceError e virava unhandled rejection no Node)
    if (!globalThis.navigator) globalThis.navigator = {};
    // window.addEventListener existe no navegador: o app usa para fechar listas de
    // sugestão no scroll/resize. Sem isso, uma tela inteira lançava e não pintava nada.
    if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
    if (!globalThis.removeEventListener) globalThis.removeEventListener = () => {};
    if (globalThis.innerWidth === undefined) globalThis.innerWidth = 1024;
    if (globalThis.innerHeight === undefined) globalThis.innerHeight = 768;
    globalThis.requestAnimationFrame = fn => fn();
    globalThis.location = globalThis.location || { protocol: 'https:' };
    globalThis.history = globalThis.history || { pushState() {}, go() {}, back() {} };
    globalThis.confirm = globalThis.confirm || (() => true);
    globalThis.alert = globalThis.alert || (() => {});
    globalThis.prompt = globalThis.prompt || (() => null);
    if (!globalThis.dispatchEvent) globalThis.dispatchEvent = () => true;
    if (!globalThis.CustomEvent) globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } };
    // peças de canvas/imagem usadas pelos desenhos de compartilhamento (share.js)
    if (!globalThis.getComputedStyle) globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    if (!globalThis.Image) globalThis.Image = class { constructor() { this.width = 300; this.height = 200; } set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
    if (!globalThis.Path2D) globalThis.Path2D = class { constructor() {} };
    // DOMParser mínimo: a descoberta de wikis (js/wiki.js) limpa o HTML dos trechos de
    // busca com ele. Só o que roda fora do navegador: body.textContent = o TEXTO do HTML.
    if (!globalThis.DOMParser) globalThis.DOMParser = class {
        parseFromString(html) {
            const source = String(html || '');
            const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                .replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
            const body = makeEl();
            body.innerHTML = source;
            body.textContent = decode(source.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
            return { body, documentElement: body, createElement: () => makeEl(), querySelectorAll: () => [] };
        }
    };
    if (!globalThis.URL.createObjectURL) { globalThis.URL.createObjectURL = () => 'blob:teste'; globalThis.URL.revokeObjectURL = () => {}; }
    if (!globalThis.createImageBitmap) globalThis.createImageBitmap = async () => ({ width: 600, height: 900, close() {} });   // para testar a capa vertical end-to-end
}
installGlobals();

// ---------- mock de fetch (para testes herméticos, sem rede) ----------
// mockFetch([['pedaço-da-url', valor], ...]) — o primeiro que casar vence.
// O valor pode ser:
//   - o objeto retornado por json() (como sempre foi);
//   - uma função async (url) => objeto — permite ATRASO (testar corrida de fontes);
//   - { __res: {...} } — resposta crua: substitui ok/status/json/text/blob.
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
                const d = typeof data === 'function' ? await data(u) : data;
                if (d && d.__res) {
                    return {
                        ok: true, status: 200,
                        json: async () => ({}), text: async () => '', blob: async () => new Blob([Buffer.alloc(300, 120)], { type: 'image/jpeg' }),
                        ...d.__res,
                    };
                }
                return {
                    ok: true, status: 200,
                    json: async () => d,
                    text: async () => JSON.stringify(d),
                    blob: async () => new Blob([Buffer.alloc(300, 120)], { type: 'image/jpeg' }),   // >200 bytes, tipo imagem
                };
            }
        }
    }
    return realFetch(url, opts);
};

// Um teste pode trocar globalThis.fetch direto (para gravar as chamadas e conferir
// cabeçalhos/corpo). Guardamos a versão do shim para o resetShim devolvê-la — sem
// isso o stub de um teste vazava para TODOS os seguintes.
const shimFetch = globalThis.fetch;

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
    globalThis.fetch = shimFetch;   // devolve o fetch do shim (um teste pode ter trocado)
    // banco de dados fresco: mesmo caminho de um usuário novo (migrações inclusas)
    setAppData(migrateData(JSON.parse(JSON.stringify(defaultData))));
}

// Ajuda para testes ao vivo: erros de rede/limite/servidor da RAWG pulam o teste em vez de falhar
export async function live(promise) {
    try { return await promise; }
    catch (e) {
        if (e && (e.kind === 'network' || e.status === 429 || e.status === 401 || e.status === 403 || (e.status >= 500 && e.status < 600))) {
            skipTest(`RAWG indisponível (${e.kind || e.status}) — testando outro dia`);
        }
        throw e;
    }
}
