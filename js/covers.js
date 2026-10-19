// Capas verticais e artes de fundo. Formas de uso:
//  1) automática: autoVerticalCover() tenta Steam (capa 600x900), Wikipédia, IGDB
//     e HLTB — em STREAMING: a primeira vertical válida vence, sem esperar as
//     fontes lentas (o HLTB tenta 5 proxies com 12s de timeout cada: uma
//     barreira "allSettled" segurava a capa por ~25s);
//  2) automática (fundo): autoBanner() acha a melhor arte HORIZONTAL do jogo
//     (Steam hero 16:9, arte extra da RAWG, screenshots, header) e devolve só a
//     URL — que fica guardada nos dados do jogo (campo `banner`) e vira o topo
//     "capa de Facebook" da página. Sem download: <img> não passa por CORS;
//  3) manual: o buscador (openCoverPicker) mostra as candidatas em tela cheia —
//     modo "cover" (capa vertical, horizontais abrem o recorte) ou "banner"
//     (arte horizontal para o fundo da página do jogo).
// Fundo do jogo = userBanner (escolha do usuário) || banner (busca automática).
// Fontes: IGDB (Client ID/Secret da Twitch, opcional), Wikipédia, Steam, HowLongToBeat, RAWG.
import { searchGames, getGameStores, getGameScreenshots, getGameDetails, fetchImageBlob, blobToSmallJpeg, imageSize, isVerticalSize, esc, scrapeUrl, fetchHLTBData } from './gameApi.js';
import { fetchIGDBCovers, igdbConfigured } from './igdb.js';
import { openCropper } from './crop.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const $ = id => document.getElementById(id);
let state = { onPick: null, rawgId: null, mode: 'cover', cands: [], token: 0, loading: false };

async function getJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
        return await res.json();
    } finally { clearTimeout(t); }
}

async function wikipedia(title) {
    const out = [];
    for (const [lang, hint, label] of [['en', 'video game', 'Wikipedia (EN)'], ['pt', 'jogo eletrônico', 'Wikipédia (PT)']]) {
        try {
            const q = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${title} ${hint}`, gsrlimit: 4, gsrnamespace: 0, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 600, pilicense: 'any', redirects: 1, format: 'json', formatversion: 2, origin: '*' });
            const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`);
            const pages = ((data.query && data.query.pages) || []).filter(p => p.thumbnail).sort((a, b) => a.index - b.index);
            const want = norm(title);
            pages.forEach(p => {
                const base = norm(p.title.replace(/\s*\([^)]*\)\s*$/, ''));
                if (base && want && (base.includes(want) || want.includes(base))) out.push({ url: p.thumbnail.source, source: label, label: p.title, vertical: p.thumbnail.height >= p.thumbnail.width * 1.1 });
            });
        } catch (e) { /* fonte indisponível: segue com as outras */ }
    }
    return out;
}

// Acha o jogo na RAWG com cuidado para não pegar um homônimo
async function findRawgId(title, rawgId) {
    if (rawgId) return rawgId;
    const res = await searchGames(title, 5);
    const want = norm(title);
    const hit = res.find(r => norm(r.title) === want) || res.find(r => norm(r.title).startsWith(want));
    return hit ? hit.rawgId : null;
}

// Mídia da Steam: capa vertical 600x900 (covers) e artes horizontais (headers)
async function steam(title, rawgId) {
    const id = await findRawgId(title, rawgId);
    const list = [], headers = [];
    const appIds = new Set();
    if (id) {
        try {
            const stores = await getGameStores(id);
            stores.forEach(s => {
                const m = String(s.url || '').match(/store\.steampowered\.com\/app\/(\d+)/);
                if (m) appIds.add(m[1]);
            });
        } catch (e) { /* sem link da loja: tenta a busca direta */ }
    }
    // Fallback: a RAWG às vezes não tem o link da loja; pergunta direto à Steam
    if (!appIds.size) {
        try {
            const txt = await scrapeUrl(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=us&l=en`);
            const js = txt && JSON.parse(txt);
            const want = norm(title);
            const hit = (js && js.items || []).find(i => norm(i.name) === want) || (js && js.items || []).find(i => norm(i.name).includes(want) || want.includes(norm(i.name)));
            if (hit) appIds.add(String(hit.id));
        } catch (e) { /* segue sem */ }
    }
    appIds.forEach(app => {
        list.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app}/library_600x900.jpg`, source: 'Steam', label: 'Capa vertical 600×900', vertical: true });
        // library_hero é a arte-chave em 16:9: a melhor candidata a FUNDO da página
        headers.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app}/library_hero.jpg`, source: 'Steam', label: 'Arte hero 16:9', vertical: false, rank: 0 });
        headers.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app}/header.jpg`, source: 'Steam', label: 'Header da loja', vertical: false, rank: 3 });
        headers.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app}/capsule_616x353.jpg`, source: 'Steam', label: 'Capsule 616×353', vertical: false, rank: 5 });
    });
    return { id, list, headers };
}

async function rawgArt(title, rawgId) {
    const id = await findRawgId(title, rawgId);
    if (!id) return [];
    const d = await getGameDetails(id);
    return [d.image, d.imageExtra].filter(Boolean).map((url, i) => ({ url, source: 'RAWG', label: i ? 'Arte extra' : 'Arte principal', vertical: false }));
}

// Screenshots da RAWG: artes horizontais que também servem de fundo
async function rawgScreenshots(rawgId) {
    if (!(rawgId > 0)) return [];
    try {
        const shots = await getGameScreenshots(rawgId, 8);
        return shots.map(u => ({ url: u, source: 'RAWG', label: 'Screenshot', vertical: false }));
    } catch (e) { return []; }
}

// HowLongToBeat: tem box art vertical de muitos jogos, principalmente antigos
async function hltb(title) {
    const d = await fetchHLTBData(title).catch(() => null);
    if (d && d.imageUrl) return [{ url: d.imageUrl, source: 'HLTB', label: 'Box art', vertical: true }];
    return [];
}

// ---------- automático: sempre tenta a capa vertical ----------
// Retorna { data (JPEG pequeno), source, rawgId } ou null.
// STREAMING: cada fonte entra na fila assim que responde; a primeira capa
// vertical baixada com sucesso vence (early return) — o HLTB lento não segura
// mais o resultado (era o bug das capas "que nunca chegavam").
// `onCandidate(url, source)`: chamado 1x com a primeira URL vertical achada,
// sem baixar — para o <img> mostrar a capa na hora (img não precisa de CORS).
export function autoVerticalCover(title, rawgId, { onCandidate } = {}) {
    if (!title) return Promise.resolve(null);
    let id = rawgId || null;
    return new Promise(resolve => {
        let settled = false, candidateSent = false;
        const finish = v => { if (!settled) { settled = true; resolve(v); } };
        let chain = Promise.resolve();   // serializa os downloads (não baixa 2 ao mesmo tempo)
        const offer = cands => {
            if (settled || !cands || !cands.length) return;
            if (!candidateSent && onCandidate) { candidateSent = true; try { onCandidate(cands[0].url, cands[0].source); } catch (e) { /* segue */ } }
            chain = chain.then(async () => {
                for (const c of cands) {
                    if (settled) return;
                    try {
                        const blob = await fetchImageBlob(c.url);
                        if (settled || !blob) continue;
                        const size = await imageSize(blob);
                        if (!isVerticalSize(size)) continue;
                        const data = await blobToSmallJpeg(blob);
                        if (settled) return;
                        finish({ data, source: c.source, rawgId: id });
                        return;
                    } catch (e) { /* tenta a próxima candidata */ }
                }
            }).catch(() => { /* a oferta falhou inteira: a fila segue */ });
        };
        const jobs = [];
        const src = (p, pick) => jobs.push(p.then(r => offer(pick ? pick(r) : r)).catch(() => {}));
        // BUGFIX histórico: este bloco referenciava "sg" (variável que não existia —
        // o nome certo é "sc") e o erro era engolido pelos .catch() das chamadas.
        // Resultado: a capa vertical "nunca era achada" e tudo caía na arte horizontal.
        const sc = igdbConfigured() ? fetchIGDBCovers(title, 8) : Promise.resolve([]);
        src(sc, l => l.filter(c => c.vertical));
        src(steam(title, rawgId).then(r => { if (r && r.id) id = r.id || id; return r.list; }));
        src(hltb(title));
        src(wikipedia(title), l => l.filter(c => c.vertical));
        // todas as fontes responderam e a fila drenou sem achar: devolve null
        Promise.all(jobs).then(() => chain.then(() => { if (!settled) finish(null); })).catch(() => finish(null));
    });
}

// ---------- automático: FUNDO (arte horizontal, estilo "capa de Facebook") ----------
// O fundo precisa ser HORIZONTAL. Guardamos só a URL: um <img> mostra a imagem sem
// passar por CORS (converter para base64 só quando o usuário escolhe na mão), então a
// busca automática não baixa nada nem ocupa espaço no banco.
export const bannerUrlOf = g => (g && (g.userBanner || g.banner)) || '';

// A imagem abre no navegador? O <img> não passa por CORS, então serve de teste barato
// (e é o mesmo caminho que a tela usa para mostrar o fundo).
export function probeImage(url, timeout = 4000) {
    if (!url || typeof url !== 'string') return Promise.resolve(false);
    return new Promise(resolve => {
        let done = false;
        const fin = v => { if (!done) { done = true; resolve(v); } };
        const timer = setTimeout(() => fin(false), timeout);
        try {
            const img = new Image();
            img.onload = () => {
                clearTimeout(timer);
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                fin(!w || !h || w >= h);   // vertical não serve de fundo
            };
            img.onerror = () => { clearTimeout(timer); fin(false); };
            img.referrerPolicy = 'no-referrer';
            img.src = url;
        } catch (e) { clearTimeout(timer); fin(false); }
    });
}

// Artes horizontais da RAWG no endpoint de detalhes: a "arte extra" primeiro.
async function rawgBannerArt(title, rawgId) {
    const id = await findRawgId(title, rawgId);
    if (!id) return [];
    const d = await getGameDetails(id);
    return [
        d.imageExtra && { url: d.imageExtra, source: 'RAWG', rank: 1 },
        d.image && { url: d.image, source: 'RAWG', rank: 4 }
    ].filter(Boolean);
}

// Screenshots da RAWG (1920x1080): ótimas como fundo quando não há arte-chave
async function rawgBannerShots(rawgId) {
    if (!(rawgId > 0)) return [];
    try {
        const shots = await getGameScreenshots(rawgId, 4);
        return shots.map(u => ({ url: u, source: 'RAWG', rank: 2 }));
    } catch (e) { return []; }
}

// Busca a melhor arte de fundo do jogo: { url, source } ou null.
// `seed`: URLs que quem chamou já tem em mãos (arte extra da RAWG, screenshots) — são
// confiáveis (nem checam se abrem) e entram na frente, sem nenhuma chamada extra.
// As fontes respondem em paralelo; esperamos até `waitMs` e ficamos com a melhor que
// chegou (arte hero da Steam > arte extra da RAWG > screenshots > header/capsule).
export async function autoBanner(title, rawgId, { seed = [], waitMs = 2500, probe = true, maxProbeMs = 6000 } = {}) {
    if (!title && !rawgId) return null;
    const pool = [];
    const add = list => (list || []).forEach(c => {
        if (c && c.url && !pool.some(p => p.url === c.url)) pool.push(c);
    });
    (seed || []).forEach((s, i) => {
        if (!s) return;
        const c = typeof s === 'string' ? { url: s } : s;
        if (!c || !c.url) return;
        add([{ source: 'RAWG', ...c, rank: 1 + i * 0.1, trusted: true }]);
    });
    const jobs = [
        rawgBannerArt(title, rawgId),
        rawgBannerShots(rawgId),
        steam(title, rawgId).then(r => (r && r.headers) || []),
        wikipedia(title).then(l => l.filter(c => !c.vertical).map(c => ({ url: c.url, source: c.source, rank: 6 })))
    ];
    jobs.forEach(p => Promise.resolve(p).then(add).catch(() => {}));
    await Promise.race([
        Promise.all(jobs.map(p => Promise.resolve(p).catch(() => null))),
        new Promise(r => setTimeout(r, waitMs))   // fonte pendurada não segura o fundo
    ]);
    const cands = pool.slice().sort((a, b) => a.rank - b.rank);
    if (!cands.length) return null;
    if (!probe) return { url: cands[0].url, source: cands[0].source };
    const t0 = Date.now();
    for (const c of cands.slice(0, 6)) {
        if (c.trusted) return { url: c.url, source: c.source };
        if (Date.now() - t0 > maxProbeMs) break;
        if (await probeImage(c.url)) return { url: c.url, source: c.source };
    }
    return null;   // nenhuma arte abriu: melhor ficar sem fundo do que com um quebrado
}

// ---------- em lote: biblioteca inteira ----------
let batchStop = false;
export const stopCoverUpgrade = () => { batchStop = true; };

export async function upgradeAllCovers({ games, onProgress, onGame }) {
    batchStop = false;
    const todo = [];
    for (const g of games) {
        if (g.image) { const size = await imageSize(g.image); if (isVerticalSize(size)) continue; }
        todo.push(g);
    }
    let done = 0, updated = 0;
    for (const g of todo) {
        if (batchStop) break;
        onProgress && onProgress({ done, total: todo.length, title: g.title, updated });
        try {
            const r = await autoVerticalCover(g.title, g.rawgId);
            if (r) { onGame(g, r); updated++; }
        } catch (e) { /* segue para o próximo */ }
        done++;
        await new Promise(res => setTimeout(res, 250));   // não sobrecarrega as APIs
    }
    onProgress && onProgress({ done, total: todo.length, title: '', updated, finished: true, stopped: batchStop });
    return { total: todo.length, updated, stopped: batchStop };
}

// ---------- buscador manual (tela cheia) ----------
const MODES = {
    cover: {
        title: 'Buscar capa',
        hint: 'A capa ideal é a <strong>vertical</strong> (caixa do jogo). Toque numa horizontal para recortar.',
        empty: 'Nenhuma capa encontrada. Tente outro nome (em inglês costuma ajudar) ou busque no Google.',
    },
    banner: {
        title: 'Buscar arte de fundo',
        hint: 'Escolha uma arte <strong>horizontal</strong> para o topo da página do jogo — sem recorte, entra inteira.',
        empty: 'Nenhuma arte horizontal encontrada. Tente outro nome (em inglês ajuda), busque no Google ou envie uma imagem sua.',
    },
};

function skeletonHtml() {
    const n = state.mode === 'banner' ? 4 : 8;
    return Array.from({ length: n }, () => '<div class="cv-skel" aria-hidden="true"></div>').join('');
}

function paint() {
    const grid = $('cv-grid');
    if (!grid) return;
    const banner = state.mode === 'banner';
    grid.classList.toggle('mode-banner', banner);
    if (state.loading && !state.cands.length) { grid.innerHTML = skeletonHtml(); return; }
    if (!state.cands.length) {
        grid.innerHTML = `<div class="cv-empty">${esc(banner ? MODES.banner.empty : MODES.cover.empty)}</div>`;
        return;
    }
    const horizontal = $('cv-horizontal') && $('cv-horizontal').checked;
    grid.innerHTML = state.cands.map((c, i) => `
        <button type="button" class="cv-item ${c.vertical ? 'v' : 'h'}" data-i="${i}" title="${esc(c.source + ' · ' + c.label)}">
            <img src="${esc(c.previewUrl || c.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
            <span class="cv-src">${esc(c.source)}</span>
            ${banner
                ? '<span class="cv-badge wide">horizontal</span>'
                : (c.vertical ? '<span class="cv-badge v">vertical</span>' : (horizontal ? '<span class="cv-badge wide">horizontal</span>' : '<span class="cv-badge">recortar</span>'))}
        </button>`).join('');
}

// Busca capas no Google Imagens sem sair do app (navegador embutido)
export function coversSearchGoogle() {
    const t = $('cv-title').value.trim();
    if (!t) { $('cv-status').textContent = 'Digite o nome do jogo primeiro.'; return; }
    window.openBrowser(`https://www.google.com/search?tbm=isch&igu=1&q=${encodeURIComponent(t + (state.mode === 'banner' ? ' wallpaper' : ' cover'))}&tbs=isz:i`, `Capas: ${t}`);
}

function coverSources(title, rawgId) {
    return [
        steam(title, rawgId).then(r => r.list),
        hltb(title),
        wikipedia(title),
        rawgArt(title, rawgId),
        igdbConfigured() ? fetchIGDBCovers(title) : Promise.resolve([]),
    ];
}

function bannerSources(title, rawgId) {
    return [
        rawgArt(title, rawgId),
        steam(title, rawgId).then(r => r.headers),
        rawgScreenshots(rawgId),
        wikipedia(title).then(l => l.filter(c => !c.vertical)),
    ];
}

export async function coversSearch() {
    const title = $('cv-title').value.trim();
    if (!title) return;
    const token = ++state.token;
    state.cands = [];
    state.loading = true;
    paint();
    const status = $('cv-status');
    status.classList.remove('ok');
    status.textContent = 'Procurando imagens...';
    const sources = state.mode === 'banner' ? bannerSources(title, state.rawgId) : coverSources(title, state.rawgId);
    let pending = sources.length;
    const banner = state.mode === 'banner';
    sources.forEach(p => p.then(list => {
        if (token !== state.token) return;
        state.cands.push(...list);
        state.cands.sort((a, b) => banner ? Number(a.vertical) - Number(b.vertical) : Number(b.vertical) - Number(a.vertical));
        state.loading = false;
        paint();
    }).catch(() => {}).finally(() => {
        if (token !== state.token) return;
        if (--pending === 0) {
            state.loading = false;
            if (state.cands.length) {
                status.classList.add('ok');
                status.textContent = `${state.cands.length} ${state.cands.length === 1 ? 'imagem encontrada' : 'imagens encontradas'} — toque na que você quer usar.${banner ? '' : ' As horizontais abrem o recorte.'}`;
            } else {
                status.textContent = banner ? MODES.banner.empty : MODES.cover.empty;
                paint();
            }
        }
    }));
}

export function openCoverPicker({ title, rawgId, mode = 'cover', onPick }) {
    state = { onPick, rawgId: rawgId || null, mode: mode === 'banner' ? 'banner' : 'cover', cands: [], token: 0, loading: false };
    const m = MODES[state.mode];
    const t = $('cv-mode-title'); if (t) t.textContent = m.title;
    const hint = $('cv-hint'); if (hint) hint.innerHTML = m.hint;
    const nameEl = $('cv-game-name'); if (nameEl) nameEl.textContent = title || '';
    const hrow = $('cv-hrow'); if (hrow) hrow.style.display = state.mode === 'banner' ? 'none' : '';
    const hz = $('cv-horizontal'); if (hz) hz.checked = false;
    $('cv-title').value = title || '';
    $('cv-grid').innerHTML = '';
    $('cv-status').textContent = '';
    $('modal-covers').showModal();
    if (title) coversSearch();
}

// Escolhe a candidata i do grid. Exportada para os testes exercitarem o fluxo
// inteiro (o clique real vem pelo listener do grid, registrado no init).
export async function coversPick(i) { return pick(i); }

// Foto do PC/celular, DENTRO da própria busca (a tela antiga de "Editar Capa"
// foi aposentada). Mesma regra das candidatas: vertical entra direto,
// horizontal abre o recorte — a menos que a opção "usar na horizontal" esteja
// marcada, que salva a imagem inteira como capa larga.
export async function coversPickFile(input) {
    const f = input.files && input.files[0];
    try { input.value = ''; } catch (e) { /* input falso dos testes */ }
    if (!f || !state.onPick) return;
    const onPick = state.onPick;
    const horizontal = $('cv-horizontal') && $('cv-horizontal').checked;
    $('cv-status').textContent = 'Preparando a foto...';
    try {
        const size = await imageSize(f);
        if (horizontal || isVerticalSize(size)) {
            $('modal-covers').close();
            onPick(await blobToSmallJpeg(f, horizontal ? 640 : undefined), !!horizontal);
        } else {
            $('modal-covers').close();
            openCropper({ blob: f, onDone: p => onPick(p) });   // horizontal: recorta para vertical
        }
    } catch (e) {
        $('cv-status').textContent = 'Não consegui usar essa foto. Tente outra.';
    }
}

async function pick(i) {
    const c = state.cands[i];
    if (!c || !state.onPick) return;
    const onPick = state.onPick;
    const mode = state.mode;
    const horizontal = $('cv-horizontal') && $('cv-horizontal').checked;
    $('cv-status').textContent = 'Baixando a imagem...';
    const blob = await fetchImageBlob(c.url);
    // FUNDO: a arte é só EXIBIDA — um <img> mostra a imagem sem passar por CORS. Se o
    // download falhar (media.rawg.io barrou o fetch), guarda o LINK: o fundo aparece
    // igual e a escolha do usuário não se perde. Era aqui que o seletor desistia com
    // "essa imagem foi bloqueada pelo site" e o fundo automático não saía do lugar.
    if (mode === 'banner') {
        let src = c.url;
        if (blob) { try { src = await blobToSmallJpeg(blob, 1280); } catch (e) { src = c.url; } }
        $('modal-covers').close();
        onPick(src, true);
        return;
    }
    if (!blob) { $('cv-status').textContent = 'Essa imagem foi bloqueada pelo site. Tente outra.'; return; }
    $('modal-covers').close();
    if (horizontal) { onPick(await blobToSmallJpeg(blob, 640), true); return; }   // sem recorte: a opção veio do próprio seletor
    const size = await imageSize(blob);
    if (isVerticalSize(size)) onPick(await blobToSmallJpeg(blob));
    else openCropper({ blob, onDone: p => onPick(p) });   // arte horizontal: recorta para vertical
}

function init() {
    const grid = $('cv-grid');
    if (!grid) return;
    grid.addEventListener('click', e => { const b = e.target.closest('.cv-item'); if (b) pick(+b.dataset.i); });
    grid.addEventListener('error', e => { const b = e.target.closest && e.target.closest('.cv-item'); if (b && e.target.tagName === 'IMG') b.remove(); }, true);
    $('cv-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); coversSearch(); } });
    const hz = $('cv-horizontal'); if (hz) hz.addEventListener('change', () => paint());
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
