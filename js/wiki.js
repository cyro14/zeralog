// Leitor de wikis integrado: usa a API MediaWiki (CORS liberado com origin=*) e desenha a página
// dentro do próprio app. Funciona com qualquer wiki MediaWiki (Wikipédia, Yugipedia, Fandom, etc.).
// Sites que bloqueiam iframe não são problema, porque o conteúdo é buscado via API e não embutido.
import { appData, saveData } from './store.js';
import { esc } from './gameApi.js';
import { triggerToast } from './ui.js';

export const PRESET_WIKIS = [
    { id: 'yugipedia', name: 'Yugipedia', api: 'https://yugipedia.com/api.php', articlepath: '/wiki/$1', match: /yu-?gi-?oh/i },
    { id: 'bulbapedia', name: 'Bulbapedia', api: 'https://bulbapedia.bulbagarden.net/w/api.php', articlepath: '/wiki/$1', match: /pok[eé]mon/i },
    { id: 'wp-pt', name: 'Wikipédia (PT)', api: 'https://pt.wikipedia.org/w/api.php', articlepath: '/wiki/$1', hint: 'jogo eletrônico' },
    { id: 'wp-en', name: 'Wikipedia (EN)', api: 'https://en.wikipedia.org/w/api.php', articlepath: '/wiki/$1', hint: 'video game' }
];

const $ = id => document.getElementById(id);
const S = { gameId: null, src: null, title: null, history: [], token: 0 };
const cache = new Map();

export const allSources = () => [...(appData.wikis || []), ...PRESET_WIKIS];
const findSource = id => allSources().find(s => s.id === id);

// ================= REDE (com intervalo entre chamadas ao mesmo site) =================
const lastCall = new Map(), queues = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gapFor = host => /wikipedia\.org$/.test(host) ? 0 : 900;   // wikis pequenas pedem ~1 req/s

function schedule(host, fn) {
    const prev = queues.get(host) || Promise.resolve();
    const run = prev.then(async () => {
        const wait = Math.max(0, (lastCall.get(host) || 0) + gapFor(host) - Date.now());
        if (wait) await sleep(wait);
        lastCall.set(host, Date.now());
        return fn();
    });
    queues.set(host, run.catch(() => {}));
    return run;
}

async function api(src, params) {
    const url = new URL(src.api);
    Object.entries({ format: 'json', formatversion: 2, origin: '*', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
    return schedule(url.host, async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
            const data = await res.json();
            if (data.error) throw Object.assign(new Error(data.error.info || data.error.code), { code: data.error.code });
            return data;
        } finally { clearTimeout(timer); }
    });
}

const textOf = html => new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';

export async function searchTitles(src, query, limit = 8, useHint = false) {
    const q = useHint && src.hint ? `${query} ${src.hint}` : query;
    const data = await api(src, { action: 'query', list: 'search', srsearch: q, srlimit: limit, srnamespace: 0, srprop: 'snippet' });
    return ((data.query && data.query.search) || []).map(r => ({ title: r.title, snippet: textOf(r.snippet) }));
}

async function fetchPage(src, title) {
    const key = `${src.id}|${title}`;
    if (cache.has(key)) return cache.get(key);
    const data = await api(src, { action: 'parse', page: title, prop: 'text', redirects: 1, disableeditsection: 1, disablelimitreport: 1 });
    if (!data.parse) throw new Error('missing');
    const page = { title: data.parse.title, html: data.parse.text };
    cache.set(key, page);
    return page;
}

// ================= ACHAR A WIKI AUTOMATICAMENTE =================
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

function similarity(query, result) {
    const A = norm(query), B = norm(result);
    if (!A || !B) return 0;
    if (A === B) return 1;
    if (B.startsWith(A)) return 0.85;      // "Pokémon Red" -> "Pokémon Red and Blue Versions"
    if (A.startsWith(B)) return 0.7;       // "Hades II" -> "Hades" (provavelmente outro jogo)
    if (B.includes(A) || A.includes(B)) return 0.6;
    const ta = new Set(query.toLowerCase().split(/\W+/).filter(Boolean)), tb = new Set(result.toLowerCase().split(/\W+/).filter(Boolean));
    const inter = [...ta].filter(t => tb.has(t)).length;
    return 0.6 * inter / (new Set([...ta, ...tb]).size || 1);
}

export async function autoFindWiki(gameTitle) {
    const cands = allSources().filter(s => !s.match || s.match.test(gameTitle));
    const lists = await Promise.all(cands.map(async src => {
        try {
            const found = await searchTitles(src, gameTitle, 5, true);
            return found.map((r, rank) => {
                const base = r.title.replace(/\s*\([^)]*\)\s*$/, '');
                const sim = similarity(gameTitle, base);
                const generic = !!src.hint;   // Wikipédia: precisa preferir o artigo do jogo e não homônimos
                const isGame = /\((?:[^)]*(?:video ?game|jogo eletr|videojogo|videojuego))[^)]*\)/i.test(r.title) ? 0.05 : 0;
                return { src, title: r.title, sim, min: generic ? 0.8 : 0.9, score: sim + isGame + (generic ? 0 : 0.03) - rank * 0.001 };
            });
        } catch (e) { return []; }
    }));
    const best = lists.flat().filter(r => r.sim >= r.min).sort((a, b) => b.score - a.score)[0];
    return best || null;
}

// ================= FANDOM: DESCOBRIR PELO NOME =================
// O Fandom não tem busca pública entre wikis, então tentamos os subdomínios mais prováveis
// (franquia primeiro, depois o título) e só aceitamos se o nome da wiki bater com o termo.
function slugCandidates(game) {
    const out = new Set();
    const add = text => {
        const words = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/['’]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
        if (!words.length) return;
        const noArticle = words[0] === 'the' ? words.slice(1) : words;
        [noArticle, words].forEach(ws => { if (ws.length) { out.add(ws.join('')); out.add(ws.join('-')); } });
    };
    [game.franchise, game.title].filter(Boolean).forEach(raw => {
        const t = String(raw).trim();
        add(t);
        const main = t.split(/[:\-–—]/)[0].trim();                      // sem subtítulo
        if (main && main !== t) add(main);
        const semNumero = t.replace(/\s+(?:[ivx]+|\d+)\s*$/i, '').trim(); // sem número de sequência
        if (semNumero && semNumero !== t) add(semNumero);
    });
    return [...out].filter(s => s.replace(/-/g, '').length >= 4).slice(0, 8);
}

export async function findFandomWiki(game) {
    const slugs = slugCandidates(game);
    if (!slugs.length) return null;
    const checks = await Promise.all(slugs.map(async slug => {
        const src = { id: 'fd-' + slug, api: `https://${slug}.fandom.com/api.php`, articlepath: '/wiki/$1' };
        try {
            const data = await api(src, { action: 'query', meta: 'siteinfo', siprop: 'general' });
            const g = data.query && data.query.general;
            if (!g || !g.sitename || !norm(g.sitename).includes(norm(slug))) return null;
            return { ...src, name: g.sitename, articlepath: g.articlepath || '/wiki/$1' };
        } catch (e) { return null; }
    }));
    for (const src of checks.filter(Boolean)) {
        try {
            const hits = await searchTitles(src, game.title, 5);
            if (!hits.length) continue;
            hits.sort((a, b) => similarity(game.title, b.title.replace(/\s*\([^)]*\)\s*$/, '')) - similarity(game.title, a.title.replace(/\s*\([^)]*\)\s*$/, '')));
            return { src, title: hits[0].title };
        } catch (e) { /* tenta a próxima */ }
    }
    return null;
}

function registerSource(src) {
    appData.wikis = appData.wikis || [];
    const have = appData.wikis.find(s => s.api === src.api);
    if (have) return have;
    const saved = { id: src.id, name: src.name, api: src.api, articlepath: src.articlepath };
    appData.wikis.push(saved);
    return saved;
}

// ================= LIMPEZA DO HTML DA WIKI =================
const DROP = 'script,style,link,meta,base,iframe,frame,object,embed,form,input,button,textarea,select,audio,video,svg,math,noscript,template,.mw-editsection,.noprint,.navbox,.navbox-styles,.mw-empty-elt,.printfooter';
const KEEP_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'class', 'id', 'scope'];
const NS_EXTERNAL = /^(special|especial|file|ficheiro|arquivo|image|imagem|category|categoria|media|midia|mídia):/i;

function titleFromUrl(url, ctx) {
    if (url.origin !== ctx.origin) return null;
    let t = null;
    const prefix = ctx.prefix;
    if (prefix !== '/' && url.pathname.startsWith(prefix)) t = decodeURIComponent(url.pathname.slice(prefix.length));
    else if (url.searchParams.get('title')) t = url.searchParams.get('title');
    else if (prefix === '/' && url.pathname !== '/' && !/\.php$/.test(url.pathname)) t = decodeURIComponent(url.pathname.slice(1));
    if (!t) return null;
    t = t.replace(/_/g, ' ');
    return NS_EXTERNAL.test(t) ? null : t;
}

export function cleanWikiHtml(html, ctx) {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll(DROP).forEach(n => n.remove());

    doc.body.querySelectorAll('*').forEach(el => {
        if (!el.isConnected) return;
        const tag = el.tagName.toLowerCase();

        if (tag === 'a') {
            if (el.matches('a.image, a.mw-file-description')) { el.replaceWith(...el.childNodes); return; }   // imagem sem ir para a página do arquivo
            if (el.classList.contains('new')) { el.replaceWith(...el.childNodes); return; }                  // link vermelho (página inexistente)
            const raw = el.getAttribute('href') || '';
            if (raw.startsWith('#')) {
                el.setAttribute('data-anchor', 'wk-' + raw.slice(1));
                el.removeAttribute('href');
            } else {
                let url;
                try { url = new URL(raw, ctx.origin + '/'); } catch (e) { el.removeAttribute('href'); url = null; }
                if (url) {
                    if (!/^https?:$/.test(url.protocol)) el.removeAttribute('href');
                    else {
                        let t = null;
                        try { t = titleFromUrl(url, ctx); } catch (e) {}
                        if (t) { el.setAttribute('data-wiki', t); el.removeAttribute('href'); }
                        else { el.setAttribute('href', url.href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
                    }
                }
            }
        } else if (tag === 'img') {
            let s = el.getAttribute('src') || '';
            if (!s || s.startsWith('data:')) s = el.getAttribute('data-src') || '';
            try {
                const u = new URL(s, ctx.origin + '/');
                if (!/^https?:$/.test(u.protocol)) throw 0;
                el.setAttribute('src', u.href);
            } catch (e) { el.remove(); return; }
            el.setAttribute('loading', 'lazy');
            el.setAttribute('referrerpolicy', 'no-referrer');
        }

        [...el.attributes].forEach(a => {
            if (!KEEP_ATTR.includes(a.name) && !['data-wiki', 'data-anchor', 'loading', 'referrerpolicy', 'target', 'rel'].includes(a.name)) el.removeAttribute(a.name);
        });
        // prefixo para não colidir com as classes/ids do próprio app
        if (el.hasAttribute('class')) el.setAttribute('class', el.getAttribute('class').split(/\s+/).filter(Boolean).map(c => 'wk-' + c).join(' '));
        if (el.hasAttribute('id')) el.setAttribute('id', 'wk-' + el.getAttribute('id'));
    });

    // tabelas rolam na horizontal dentro de um container (infobox flutua à direita em telas largas)
    [...doc.body.querySelectorAll('table')].filter(t => !t.parentElement.closest('table')).forEach(t => {
        const wrap = doc.createElement('div');
        wrap.className = 'wk-tablewrap' + (/infobox/.test(t.className) ? ' wk-infobox-wrap' : '');
        t.replaceWith(wrap);
        wrap.appendChild(t);
    });
    return doc.body.innerHTML;
}

// ================= INTERFACE =================
const ctxFor = src => {
    const origin = new URL(src.api).origin;
    return { origin, prefix: (src.articlepath || '/wiki/$1').replace('$1', '') };
};
const pageUrl = (src, title) => ctxFor(src).origin + (src.articlepath || '/wiki/$1').replace('$1', encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/gi, ':').replace(/%2F/gi, '/'));
const lookupGame = id => appData.games.find(g => g.id === id) || (appData.wishlist || []).find(g => g.id === id);
const currentGame = () => lookupGame(S.gameId);

function fillSelect() {
    const sel = $('wiki-source');
    const list = allSources();
    sel.innerHTML = list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    if (S.src) sel.value = S.src.id;
    renderCustomList();
}

function setStatus(html) { $('wiki-status').innerHTML = html ? `<div class="wiki-msg">${html}</div>` : ''; }

function updateToolbar() {
    $('wiki-back').disabled = S.history.length === 0;
    const g = currentGame();
    const linked = !!(g && g.wiki && S.src && g.wiki.src === S.src.id && S.title && norm(g.wiki.title) === norm(S.title));
    $('wiki-link-btn').classList.toggle('linked', linked);
    $('wiki-link-label').textContent = linked ? 'Vinculada ao jogo' : 'Vincular a este jogo';
    $('wiki-link-btn').disabled = !S.title;
    const ext = $('wiki-open-ext');
    if (S.src && S.title) { ext.href = pageUrl(S.src, S.title); ext.classList.remove('disabled'); }
    else { ext.removeAttribute('href'); ext.classList.add('disabled'); }
}

function renderPage(page) {
    const body = $('wiki-body');
    const ctx = ctxFor(S.src);
    body.innerHTML = '<h1 class="wk-page-title"></h1>' + cleanWikiHtml(page.html, ctx);
    body.firstChild.textContent = page.title;
    $('wiki-results').innerHTML = '';
    setStatus('');
    $('wiki-scroll').scrollTop = 0;
    FIND.marks = []; FIND.idx = -1;
    if ($('wiki-find').classList.contains('open') && $('wiki-find-input').value.trim()) runFind();
}

async function loadPage(title, { push = true } = {}) {
    const token = S.token;
    if (push && S.title) S.history.push({ srcId: S.src.id, title: S.title });
    S.title = title;
    $('wiki-results').innerHTML = '';
    setStatus('Carregando...');
    $('wiki-body').innerHTML = '';
    updateToolbar();
    try {
        const page = await fetchPage(S.src, title);
        if (token !== S.token) return;
        S.title = page.title;
        renderPage(page);
    } catch (e) {
        if (token !== S.token) return;
        console.error(e);
        if (e.message === 'missing' || e.code === 'missingtitle') {
            S.title = null;
            setStatus('Página não encontrada nesta wiki. Veja os resultados da busca abaixo.');
            $('wiki-query').value = title;
            wikiSearch();
        } else {
            S.title = null;
            setStatus(e.status ? `A wiki respondeu com erro ${e.status}.` : 'Não consegui carregar a wiki. Verifique a internet ou se algum bloqueador barra o site.');
        }
    }
    updateToolbar();
}

export async function openWiki(gameId) {
    const game = lookupGame(gameId);
    if (!game) return;
    const token = ++S.token;
    Object.assign(S, { gameId, title: null, history: [] });
    $('wiki-game-title').textContent = game.title;
    $('wiki-query').value = game.title;
    $('wiki-results').innerHTML = '';
    $('wiki-body').innerHTML = '';
    $('wiki-add').classList.remove('open');
    wikiFindClose(true);
    const dlg = $('modal-wiki');
    if (!dlg.open) dlg.showModal();

    const linked = game.wiki && findSource(game.wiki.src);
    if (linked) {
        S.src = linked; fillSelect(); updateToolbar();
        return loadPage(game.wiki.title, { push: false });
    }
    S.src = findSource('wp-pt'); fillSelect(); updateToolbar();
    setStatus('Procurando a wiki deste jogo...');
    let found = await autoFindWiki(game.title);
    if (token !== S.token) return;
    if (!found || found.src.hint) {   // só Wikipédia (ou nada): procura uma wiki do Fandom
        setStatus('Procurando no Fandom...');
        const fd = await findFandomWiki(game);
        if (token !== S.token) return;
        if (fd) found = { src: registerSource(fd.src), title: fd.title };
    }
    if (found) {
        game.wiki = { src: found.src.id, title: found.title };
        saveData();
        S.src = found.src; fillSelect();
        triggerToast(`Wiki vinculada: ${found.src.name}`);
        return loadPage(found.title, { push: false });
    }
    setStatus('Não encontrei a wiki deste jogo automaticamente. Escolha uma wiki acima, pesquise e toque em "Vincular a este jogo".');
    await wikiSearch(true);
}

export function wikiChangeSource(id) {
    const s = findSource(id);
    if (!s) return;
    S.src = s; S.history = []; S.title = null;
    $('wiki-body').innerHTML = '';
    updateToolbar();
    wikiSearch();
}

export async function wikiSearch(keepStatus = false) {
    const q = $('wiki-query').value.trim();
    if (!q) return;
    const box = $('wiki-results');
    const token = S.token;
    if (!keepStatus) setStatus('Buscando...');
    box.innerHTML = '';
    try {
        const list = await searchTitles(S.src, q, 10);
        if (token !== S.token) return;
        if (!keepStatus) setStatus('');
        if (!list.length) { box.innerHTML = '<div class="wiki-msg">Nada encontrado nesta wiki. Tente outro termo ou outra wiki.</div>'; return; }
        box.innerHTML = list.map(r => `<button type="button" class="wiki-result" data-title="${esc(r.title)}"><strong>${esc(r.title)}</strong><small>${esc(r.snippet.slice(0, 140))}</small></button>`).join('');
    } catch (e) {
        if (token !== S.token) return;
        console.error(e);
        setStatus('Não consegui buscar nesta wiki. Verifique a internet ou tente outra wiki.');
    }
}

export async function wikiFindFandom() {
    const g = currentGame();
    if (!g) return;
    const token = S.token;
    $('wiki-results').innerHTML = '';
    setStatus('Procurando no Fandom...');
    const fd = await findFandomWiki(g);
    if (token !== S.token) return;
    if (!fd) { setStatus('Não achei uma wiki do Fandom com esse nome. Use "Outra wiki" e cole o endereço dela.'); return; }
    S.src = registerSource(fd.src);
    S.history = [];
    g.wiki = { src: S.src.id, title: fd.title };
    saveData();
    fillSelect();
    triggerToast(`Wiki vinculada: ${S.src.name}`);
    loadPage(fd.title, { push: false });
}

export function wikiBack() {
    const prev = S.history.pop();
    if (!prev) return;
    const s = findSource(prev.srcId);
    if (s) { S.src = s; fillSelect(); }
    loadPage(prev.title, { push: false });
}

export function wikiLinkGame() {
    const g = currentGame();
    if (!g || !S.src || !S.title) return;
    g.wiki = { src: S.src.id, title: S.title };
    saveData();
    updateToolbar();
    triggerToast(`Wiki vinculada: ${S.src.name}`);
}

// ================= ADICIONAR OUTRA WIKI =================
export function wikiToggleAdd() { $('wiki-add').classList.toggle('open'); renderCustomList(); }

async function discoverWiki(input) {
    let raw = input.trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    const url = new URL(raw);
    const seg = url.pathname.split('/')[1] || '';
    const bases = [`${url.origin}/api.php`, `${url.origin}/w/api.php`];
    if (/^[a-z]{2,3}(-[a-z]{2})?$/i.test(seg)) bases.unshift(`${url.origin}/${seg}/api.php`);
    for (const apiUrl of bases) {
        try {
            const data = await api({ api: apiUrl }, { action: 'query', meta: 'siteinfo', siprop: 'general' });
            const g = data.query && data.query.general;
            if (g && g.sitename) return { api: apiUrl, name: g.sitename, articlepath: g.articlepath || '/wiki/$1' };
        } catch (e) { /* tenta o próximo caminho */ }
    }
    return null;
}

export async function wikiAddSource() {
    const input = $('wiki-add-url'), msg = $('wiki-add-msg');
    if (!input.value.trim()) return;
    msg.textContent = 'Verificando a wiki...';
    let found = null;
    try { found = await discoverWiki(input.value); } catch (e) { /* endereço inválido */ }
    if (!found) { msg.textContent = 'Não consegui acessar a API dessa wiki. Confira o endereço (precisa ser uma wiki MediaWiki, como Fandom ou Gamepedia).'; return; }
    if (allSources().some(s => s.api === found.api)) { msg.textContent = 'Essa wiki já está na lista.'; return; }
    const src = { id: 'c-' + Date.now().toString(36), name: found.name, api: found.api, articlepath: found.articlepath };
    appData.wikis = appData.wikis || [];
    appData.wikis.push(src);
    saveData();
    input.value = ''; msg.textContent = `Adicionada: ${found.name}.`;
    S.src = src; S.history = []; S.title = null;
    $('wiki-body').innerHTML = '';
    fillSelect(); updateToolbar();
    wikiSearch();
}

export function wikiRemoveSource(id) {
    appData.wikis = (appData.wikis || []).filter(s => s.id !== id);
    saveData();
    if (S.src && S.src.id === id) { S.src = findSource('wp-pt'); S.history = []; S.title = null; $('wiki-body').innerHTML = ''; }
    fillSelect(); updateToolbar();
}

function renderCustomList() {
    const box = $('wiki-custom-list');
    if (!box) return;
    const list = appData.wikis || [];
    box.innerHTML = list.map(s => `<span class="wiki-chip">${esc(s.name)}<button type="button" data-remove="${esc(s.id)}" aria-label="Remover ${esc(s.name)}">×</button></span>`).join('');
}

// ================= LOCALIZAR NO TEXTO (tipo Ctrl+F) =================
const FIND = { marks: [], idx: -1, timer: null };
// Dobra maiúsculas e acentos mantendo o mesmo comprimento, para os índices baterem com o texto original
const foldCh = c => { const b = c.normalize('NFD')[0] || c; const l = b.toLowerCase(); return l.length === 1 ? l : b; };
const fold = s => { let out = ''; for (let i = 0; i < s.length; i++) out += foldCh(s[i]); return out; };
const FIND_LIMIT = 1000;

function clearMarks() {
    const body = $('wiki-body');
    body.querySelectorAll('mark.wk-hit').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
    body.normalize();
    FIND.marks = []; FIND.idx = -1;
}

function updateFindCount() {
    const n = FIND.marks.length;
    const has = $('wiki-find-input').value.trim().length > 0;
    $('wiki-find-count').textContent = n ? `${FIND.idx + 1}/${n}${n >= FIND_LIMIT ? '+' : ''}` : (has ? 'Nada' : '0/0');
}

function goToMark(i) {
    if (!FIND.marks.length) return;
    if (FIND.marks[FIND.idx]) FIND.marks[FIND.idx].classList.remove('current');
    FIND.idx = (i + FIND.marks.length) % FIND.marks.length;
    const m = FIND.marks[FIND.idx];
    m.classList.add('current');
    m.scrollIntoView({ block: 'center' });
    updateFindCount();
}

function runFind() {
    clearMarks();
    const q = fold($('wiki-find-input').value.trim());
    if (!q) { updateFindCount(); return; }
    const walker = document.createTreeWalker($('wiki-body'), NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let total = 0;
    for (const node of nodes) {
        if (total >= FIND_LIMIT) break;
        const text = node.nodeValue;
        if (!text.trim()) continue;
        const f = fold(text), ranges = [];
        let from = 0;
        while (total + ranges.length < FIND_LIMIT) {
            const i = f.indexOf(q, from);
            if (i < 0) break;
            ranges.push([i, i + q.length]);
            from = i + q.length;
        }
        if (!ranges.length) continue;
        const frag = document.createDocumentFragment();
        let last = 0;
        ranges.forEach(([a, b]) => {
            if (a > last) frag.appendChild(document.createTextNode(text.slice(last, a)));
            const m = document.createElement('mark');
            m.className = 'wk-hit';
            m.textContent = text.slice(a, b);
            frag.appendChild(m);
            FIND.marks.push(m);
            last = b;
        });
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(frag);
        total += ranges.length;
    }
    FIND.idx = 0;
    if (FIND.marks.length) goToMark(0); else updateFindCount();
}

export function wikiFindToggle() {
    const bar = $('wiki-find');
    if (bar.classList.contains('open')) { $('wiki-find-input').focus(); $('wiki-find-input').select(); return; }
    bar.classList.add('open');
    $('wiki-find-input').focus();
    $('wiki-find-input').select();
    if ($('wiki-find-input').value.trim()) runFind();
}

export function wikiFindStep(dir) { if (FIND.marks.length) goToMark(FIND.idx + dir); }

export function wikiFindClose(reset = false) {
    $('wiki-find').classList.remove('open');
    clearMarks();
    if (reset) $('wiki-find-input').value = '';
    updateFindCount();
}

// ================= EVENTOS =================
function init() {
    $('wiki-body').addEventListener('click', e => {
        const a = e.target.closest('a');
        if (!a) return;
        if (a.dataset.wiki) { e.preventDefault(); loadPage(a.dataset.wiki); }
        else if (a.dataset.anchor) {
            e.preventDefault();
            const el = $('wiki-body').querySelector('#' + CSS.escape(a.dataset.anchor));
            if (el) el.scrollIntoView({ block: 'start' });
        }
    });
    $('wiki-results').addEventListener('click', e => {
        const b = e.target.closest('.wiki-result');
        if (b) loadPage(b.dataset.title);
    });
    $('wiki-custom-list').addEventListener('click', e => {
        const b = e.target.closest('[data-remove]');
        if (b) wikiRemoveSource(b.dataset.remove);
    });
    $('wiki-find-input').addEventListener('input', () => { clearTimeout(FIND.timer); FIND.timer = setTimeout(runFind, 120); });
    $('wiki-find-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); wikiFindStep(e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); wikiFindClose(); }   // Esc fecha só a busca, não a wiki
    });
    document.addEventListener('keydown', e => {
        if ($('modal-wiki').open && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); wikiFindToggle(); }
    });
    $('wiki-add-url').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); wikiAddSource(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
