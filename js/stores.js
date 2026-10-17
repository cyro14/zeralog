// ================= Conexões GOG, Epic Games e Itch.io =================
// Fluxo com login de verdade (igual a Steam): o usuário entra na conta dele e o app
// baixa a biblioteca da loja pela API oficial. Como essas APIs não aceitam chamadas
// diretas do navegador (CORS) e o login exige POST, as chamadas vão pelo Worker do
// projeto (steam-proxy/worker.js — mesmo proxy da Steam, agora multi-loja).
// Como plano B, cada loja também aceita "importar colando a lista" (um título por linha).
import { appData, saveData } from './store.js';
import { searchGames, esc, normText, coverToDataURL } from './gameApi.js';
import { autoVerticalCover } from './covers.js';
import { platformIcons, brandImg, STORE_ICONS } from './icons.js';
import { syncShow, syncHide } from './syncbar.js';

// Mesmo Cloudflare Worker da Steam (js/steam.js): atualize-o com steam-proxy/worker.js novo,
// que agora também aceita POST e os hosts das outras lojas.
const STORE_PROXY = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';
const PUBLIC_PROXIES = [   // só servem para GET simples (sem login)
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
];

// Busca com o login (Authorization: Bearer/Basic) e/ou POST; o Worker é obrigatório nesses casos
async function storeFetch(url, { method = 'GET', token = null, basic = null, body = null, publicFallback = true } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (basic) headers['Authorization'] = 'Basic ' + btoa(basic);
    if (body != null) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const needsWorker = method !== 'GET' || token || basic || body != null;
    const makers = needsWorker && STORE_PROXY ? [u => `${STORE_PROXY}?url=${encodeURIComponent(u)}`]
        : [u => `${STORE_PROXY}?url=${encodeURIComponent(u)}`, ...(publicFallback ? PUBLIC_PROXIES : [])];
    let last = null;
    for (const mk of makers) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const res = await fetch(mk(url), { method, headers, body, signal: ctrl.signal });
            clearTimeout(timer);
            const txt = await res.text();
            if (res.status === 401 || res.status === 403) throw Object.assign(new Error('auth'), { status: res.status });
            if (!res.ok) { last = Object.assign(new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`), { status: res.status, detail: txt }); continue; }
            return txt ? JSON.parse(txt) : {};
        } catch (e) {
            clearTimeout(timer);
            if (e && (e.status === 401 || e.status === 403)) throw e;
            last = e;
        }
    }
    throw last || new Error('sem conexão');
}

export const STORES = {
    gog: { id: 'gog', name: 'GOG', label: 'GOG Galaxy', home: 'https://www.gog.com/account/providers' },
    epic: { id: 'epic', name: 'Epic Games', label: 'Epic Games Store', home: 'https://store.epicgames.com/pt-BR/account/personal' },
    itch: { id: 'itch', name: 'Itch.io', label: 'Itch.io', home: 'https://itch.io/user/settings/api-keys' },
    amazon: { id: 'amazon', name: 'Amazon Games', label: 'Prime Gaming', home: 'https://gaming.amazon.com' }
};
export const STORE_KEYS = Object.keys(STORES);

let hooks = { render: () => {}, toast: () => {}, undo: () => {} };
const $ = id => document.getElementById(id);
const st = k => { const s = appData.settings.stores || (appData.settings.stores = {}); return s[k] || (s[k] = {}); };

// Categoria e plataforma próprias de cada loja (criadas na primeira importação).
// As duas ganham o logo da loja como ícone.
function ensureRefs(key) {
    const s = st(key), S = STORES[key];
    let cat = appData.categories.find(c => c.id === s.catId) || appData.categories.find(c => normText(c.name) === normText(S.name));
    if (!cat) { cat = { id: 'c' + Date.now(), name: S.name }; appData.categories.push(cat); }
    if (!cat.icon) cat.icon = brandImg(STORE_ICONS[S.name]);
    if (!appData.platforms.some(p => normText(p.name) === normText(S.name))) {
        appData.platforms.push({ name: S.name, icon: brandImg(STORE_ICONS[S.name]) });
    }
    s.catId = cat.id;
    return cat;
}

// Passada do boot: coloca o logo de cada loja (Steam incluída) na categoria e na
// plataforma dela. Idempotente — preserva ícone que o usuário escolheu por conta
// própria; só troca os padrões antigos do app (sem ícone, phosphor "steam-logo"
// ou os SVGs genéricos das versões anteriores).
export function applyStoreCatIcons() {
    Object.entries(STORE_ICONS).forEach(([name, src]) => {
        const cat = appData.categories.find(c => normText(c.name) === normText(name));
        if (cat && (!cat.icon || (typeof cat.icon === 'object' && cat.icon.name === 'steam-logo'))) cat.icon = brandImg(src);
        const p = appData.platforms.find(pl => normText(pl.name) === normText(name));
        if (p && (!p.icon || /icons\/(gog|epic|itch|amazon)\.svg|width:\s*1\.2em/.test(String(p.icon)))) p.icon = brandImg(src);
    });
}

function newGame(key, title, catId) {
    return {
        id: 'g' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        catId, title, platform: STORES[key].name, store: key, rawgId: null,
        meta: '', hoursPlayed: '', journalNotes: '', description: '', genres: [],
        released: '', metacritic: null, franchise: '',
        continuous: false, emulated: false, originalConsole: '', difficulty: '', isPortable: false,
        image: null, wideCover: true,
        state: null, userRating: null, dateFinished: null, is100: false, review: ''
    };
}

// Cola dos títulos: um por linha; aceita também lista separada por vírgula ou ";"
export function parseLibraryText(text) {
    const raw = String(text || '').split(/\r?\n|[,;]+\s*(?=[A-Za-z0-9À-ÿ"“'‘])/);
    const seen = new Set(), out = [];
    for (const line of raw) {
        const t = line.replace(/^\s*[-•*\d.)\s]+/, '').replace(/\s*(?:\(.{0,30}\))?\s*$/, '').trim();
        const n = normText(t);
        if (!t || t.length < 2 || seen.has(n)) continue;
        seen.add(n);
        out.push(t);
    }
    return out;
}

// ---- Enriquecimento em segundo plano: dados da RAWG + capa retrato ----
let enriching = false;
export async function enrichStoreGames(newGames) {
    if (!newGames.length || enriching) return;
    enriching = true;
    const queue = [...newGames];
    let done = 0, hit = 0, stopped = false;
    const storeName = newGames[0] && newGames[0].store ? (STORES[newGames[0].store] || {}).name || 'Loja' : 'Biblioteca';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    syncShow(`${storeName}: buscando dados e capas`, 0, newGames.length);
    const worker = async () => {
        while (queue.length && !stopped) {
            const g = queue.shift();
            try {
                const results = await searchGames(g.title, 4);
                const want = normText(g.title).replace(/\s+/g, '');
                const d = (results || []).find(r => normText(r.title).replace(/\s+/g, '') === want) || (results || [])[0];
                if (d) {
                    if (!g.rawgId) g.rawgId = d.rawgId;
                    if ((!g.genres || !g.genres.length) && d.genres.length) g.genres = d.genres;
                    if (!g.released && d.released) g.released = d.released;
                    if (g.metacritic == null && d.metacritic) g.metacritic = d.metacritic;
                    if (!g.meta && d.playtime) g.meta = `${d.playtime}h`;
                    if (!g.description && d.description) g.description = d.description;
                    hit++;
                }
                // Capa: respeita a preferência do usuário (vertical é o padrão).
                // Sem sorte na vertical, o jogo fica sem capa e a retomada do boot
                // tenta de novo em segundo plano — a biblioteca não fica poluída
                // de artes horizontais que o usuário não pediu.
                if (!g.image) {
                    if (!g.rawgId && d) g.rawgId = d.rawgId;
                    if (appData.settings.autoCoverPref === 'horizontal') {
                        if (d && d.image) {
                            const wide = await coverToDataURL(d.image).catch(() => d.image);
                            if (wide) { g.image = wide; g.wideCover = true; }
                        }
                    } else {
                        const cov = await autoVerticalCover(g.title, g.rawgId).catch(() => null);
                        if (cov && cov.data) { g.image = cov.data; g.wideCover = false; }
                    }
                }
                // Arte de FUNDO da página do jogo (só a URL): a horizontal da RAWG
                if (!g.banner && d) g.banner = d.imageExtra || d.image || null;
                done++;
                syncShow(`${storeName}: buscando dados e capas`, done, newGames.length);
                if (done % 3 === 0) saveData(() => hooks.render());
                await sleep(250);
            } catch (e) {
                done++;
                syncShow(`${storeName}: buscando dados e capas`, done, newGames.length);
                if (e && e.kind === 'http' && (e.status === 401 || e.status === 403 || e.status === 429)) stopped = true;
            }
        }
    };
    await Promise.all([worker(), worker()]);
    saveData(() => hooks.render());
    enriching = false;
    syncHide();
    if (!stopped && hit) hooks.toast(`Dados e capas encontrados para ${hit} de ${newGames.length} jogos.`);
}

// ---------- ações da tela ----------
export function storeImport(key) {
    const S = STORES[key];
    const txt = $('store-import-' + key).value;
    const titles = parseLibraryText(txt);
    if (!titles.length) { hooks.toast('Cole pelo menos 1 título de jogo (um por linha).', false); return; }
    const cat = ensureRefs(key);
    hooks.undo();
    const have = new Set(appData.games.map(g => normText(g.title)));
    const fresh = [];
    for (const t of titles) {
        if (have.has(normText(t))) continue;
        const g = newGame(key, t, cat.id);
        appData.games.push(g); fresh.push(g);
    }
    const cur = st(key);
    cur.lastImport = Date.now(); cur.count = (cur.count || 0) + fresh.length;
    saveData(() => hooks.render());
    $('store-import-' + key).value = '';
    hooks.toast(fresh.length
        ? `${S.name}: ${fresh.length} ${fresh.length === 1 ? 'jogo importado' : 'jogos importados'} na categoria "${S.name}". Buscando dados e capas...`
        : `Tudo já estava cadastrado.`, false);
    renderStoreStatus(key);
    if (fresh.length) enrichStoreGames(fresh);
}

export function renderStoreStatus(key) {
    const box = $('store-status-' + key);
    if (!box) return;
    const s = st(key);
    const n = appData.games.filter(g => g.store === key).length;
    const connected = !!(s.token || s.refresh || s.apiKey);
    // botões de login/sincronia, quando existirem (fluxo com conta)
    const login = $(STORES[key].id + '-login-btn'), sync = $(STORES[key].id + '-sync-btn'), out = $(STORES[key].id + '-out-btn');
    if (login) login.style.display = connected ? 'none' : '';
    if (sync) sync.style.display = connected ? '' : 'none';
    if (out) out.style.display = connected ? '' : 'none';
    const last = s.lastSync ? ` · última sincronização: ${new Date(s.lastSync).toLocaleDateString('pt-BR')} (${s.lastCount || 0})` : '';
    if (connected) {
        box.innerHTML = `<strong style="color: var(--accent-finished);">✓ Conectado</strong> · ${n} ${n === 1 ? 'jogo' : 'jogos'} na categoria ${esc(STORES[key].name)}${esc(last)}`;
    } else {
        box.textContent = n
            ? `${n} ${n === 1 ? 'jogo importado' : 'jogos importados'}${s.lastImport ? ' · última importação: ' + new Date(s.lastImport).toLocaleDateString('pt-BR') : ''} (por lista)`
            : 'Não conectado. Entre na sua conta ou importe colando a lista.';
        box.style.color = 'var(--text-muted)';
        return;
    }
    box.style.color = 'var(--text-main)';
}

// ---------- HUB das lojas (cards com logo, status e progresso) ----------
export function renderShopHub() {
    const hub = document.getElementById('shops-hub');
    if (!hub) return;
    const fmtDate = ts => new Date(ts).toLocaleDateString('pt-BR');
    const setShop = (key, html, on) => {
        const el = $('shop-status-' + key);
        if (!el) return;
        el.innerHTML = html;
        el.closest('.shop-card').classList.toggle('on', !!on);
    };
    // Steam
    const s = appData.settings.steam || {};
    const nSteam = appData.games.filter(g => g.platform === 'Steam').length;
    setShop('steam', s.steamId
        ? `<strong>✓ Conectado</strong> · ${nSteam} jogos${s.lastSync ? ' · última sync ' + fmtDate(s.lastSync) : ''}`
        : 'Toque para conectar', !!s.steamId);
    // Lojas por conta (token) ou chave
    STORE_KEYS.forEach(key => {
        const c = st(key);
        const n = appData.games.filter(g => g.store === key).length;
        const connected = !!(c.token || c.refresh || c.apiKey);
        const last = c.lastSync ? ' · última sync ' + fmtDate(c.lastSync) : (c.lastImport ? ' · importado em ' + fmtDate(c.lastImport) : '');
        setShop(key, connected
            ? `<strong>✓ Conectado</strong> · ${n} jogos${key === 'epic' && c.rawCount ? ` conta tem ${c.rawCount} itens` : ''}${last}`
            : n ? `${n} importados${last}` : 'Toque para conectar', connected || n > 0);
    });
}

export function renderAllStoreStatus() { STORE_KEYS.forEach(renderStoreStatus); renderShopHub(); }

// ================= GOG: login OAuth + biblioteca completa =================
// Fluxo (mesmo usado pelos apps de desktop): o usuário entra no site da GOG, a GOG
// redireciona para uma página "de erros" com o código na URL; o usuário cola esse
// link aqui e o app troca o código por um token. A senha nunca passa pelo ZeraLog.
const GOG_CLIENT_ID = '46899977096215655';
const GOG_CLIENT_SECRET = '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
const GOG_REDIRECT = 'https://embed.gog.com/on_login_success';
// No OAuth a redirect_uri da troca precisa ser EXATAMENTE a do login (com ?origin=client)
const GOG_REDIRECT_FULL = GOG_REDIRECT + '?origin=client';
const GOG_AUTH_URL = `https://login.gog.com/auth?client_id=${GOG_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOG_REDIRECT + '?origin=client')}&response_type=code&layout=client2&brand=gog`;

const gog = () => st('gog');
function gogStatus(msg) { const el = $('gog-sync-status'); if (el) el.textContent = msg; }

export function gogLogin() {
    gogStatus('Abrindo o login da GOG em outra aba... Entre na sua conta e, depois de logar, copie o endereço completo da página (mesmo se der erro) e cole no campo ao lado.');
    window.open(GOG_AUTH_URL, '_blank', 'noopener');
}

async function gogExchange(params) {
    // A troca de tokens da GOG é POST com os campos no corpo (form-urlencoded)
    const body = new URLSearchParams({
        client_id: GOG_CLIENT_ID, client_secret: GOG_CLIENT_SECRET,
        redirect_uri: GOG_REDIRECT_FULL, ...params
    }).toString();
    return storeFetch('https://auth.gog.com/token', { method: 'POST', body, publicFallback: false });
}

export async function gogSaveCode() {
    const raw = String(($('gog-code-input') && $('gog-code-input').value) || '').trim();
    // Aceita: URL completa (?code=...), fragmento (#code=...) ou o código puro colado
    let code = null;
    const m = raw.match(/[?&#]code=([^&\s"']+)/i);
    if (m) { try { code = decodeURIComponent(m[1]); } catch (e) { code = m[1]; } }
    else if (/^[A-Za-z0-9._-]{20,}$/.test(raw)) code = raw;
    if (!code) { gogStatus('Não achei o código nesse texto. Cole o endereço COMPLETO da aba que abriu depois do login (algo como embed.gog.com/on_login_success?origin=client&code=ABC123...). Se o navegador ofereceu abrir o aplicativo GOG, recuse e fique na aba do navegador.'); return; }
    gogStatus('Trocando o código pelo acesso à conta...');
    try {
        const t = await gogExchange({ grant_type: 'authorization_code', code });
        if (!t.access_token) throw new Error('sem token');
        appData.settings.stores.gog = { ...gog(), token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000, userId: t.user_id || '' };
        if ($('gog-code-input')) $('gog-code-input').value = '';
        saveData(null);
        hooks.toast('GOG conectada! Baixando sua biblioteca...', false);
        gogSync();
    } catch (e) {
        const det = e && e.detail ? ` (resposta da GOG: ${String(e.detail).slice(0, 120)})` : ` (${e && e.message})`;
        gogStatus('Não deu para concluir o login agora.' + (e && e.status ? det + ' — se o login estava certo, o código pode ter expirado (dura poucos minutos): clique em "Entrar com a GOG" de novo e cole o novo endereço.' : ' Confirme se o Worker está atualizado (docs/steam-proxy.md) e tente de novo — ou use a importação por lista abaixo.'));
    }
}

async function gogToken() {
    const g = gog();
    if (!g.token) throw new Error('desconectado');
    if (g.expiresAt && Date.now() > g.expiresAt - 60000 && g.refresh) {
        const t = await gogExchange({ grant_type: 'refresh_token', refresh_token: g.refresh });
        if (!t.access_token) throw new Error('sem token');
        appData.settings.stores.gog = { ...g, token: t.access_token, refresh: t.refresh_token || g.refresh, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 };
        saveData(null);
    }
    return gog().token;
}

// ids da biblioteca → nomes dos jogos (em lotes de 50, aceitos pelo products endpoint)
async function gogProductNames(ids) {
    const names = [];
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const data = await storeFetch(`https://api.gog.com/products?ids=${chunk.join(',')}`);
        // resposta: objeto { id: { name ... } } ou array
        Object.values(data || {}).forEach(p => { const n = p && (p.name || p.title); if (n) names.push(String(n)); });
    }
    return names;
}

export async function gogSync() {
    const S = STORES.gog;
    if (!gog().token && !gog().refresh) { gogStatus('Conecte sua conta GOG primeiro (botão acima).'); return; }
    gogStatus('Buscando sua biblioteca GOG...');
    const btn = $('gog-sync-btn'); if (btn) btn.disabled = true;
    try {
        const token = await gogToken();
        const data = await storeFetch('https://embed.gog.com/user/data/games', { token, publicFallback: false });
        const ids = [...new Set((data && data.owned) || [])];
        if (!ids.length) { gogStatus('A conta respondeu, mas sem jogos. Compre/resgate jogos na GOG primeiro.'); renderStoreStatus('gog'); return; }
        gogStatus(`Encontrados ${ids.length} itens na conta. Baixando os nomes...`);
        const names = await gogProductNames(ids);
        const cat = ensureRefs('gog');
        hooks.undo();
        const have = new Set(appData.games.map(g => normText(g.title)));
        const fresh = [];
        for (const t of names) {
            if (have.has(normText(t))) continue;
            const g = newGame('gog', t, cat.id);
            appData.games.push(g); fresh.push(g);
        }
        appData.settings.stores.gog = { ...gog(), lastSync: Date.now(), lastCount: names.length };
        saveData(() => hooks.render());
        gogStatus(`Sincronizado: ${names.length} jogos na conta GOG · ${fresh.length} novos na categoria "GOG".${fresh.length ? ' Dados e capas sendo buscados em segundo plano...' : ''}`);
        hooks.toast(`GOG: ${fresh.length} novos, ${names.length - fresh.length} já cadastrados.`, fresh.length > 0);
        renderStoreStatus('gog');
        if (fresh.length) enrichStoreGames(fresh);
    } catch (e) {
        if (e && (e.status === 401 || e.status === 403 || e.message === 'desconectado')) {
            gogStatus('Sua sessão da GOG expirou. Entre de novo pelo botão acima e cole o novo código.');
        } else {
            gogStatus('A sincronização falhou. Veja se o Worker está atualizado (docs/steam-proxy.md) — ou importe colando a lista.');
        }
    } finally {
        if (btn) btn.disabled = false;
        renderStoreStatus('gog');
    }
}

export function gogDisconnect() {
    if (!gog().token && !gog().refresh) return;
    if (!confirm('Desconectar a GOG? Os jogos já importados continuam na categoria GOG.')) return;
    appData.settings.stores.gog = { catId: gog().catId };
    saveData(() => renderStoreStatus('gog'));
    hooks.toast('GOG desconectada.', false);
}

// ================= Epic Games: login OAuth + biblioteca =================
// Mesmo fluxo do aplicativo oficial: o usuário entra no site da Epic, copia o endereço
// com ?code=... depois do login, e o app troca pelo token. A senha nunca passa pelo app.
const EPIC_CLIENT = '34a02cf8f4414e29b15921876da36f9a:daafbccc737745039dffe53d94fc76cf';   // cliente público oficial do launcher Epic
const EPIC_REDIRECT = 'https://localhost/launcher/authorized';
// Fluxo do launcher: depois do login, a Epic mostra um JSON com "authorizationCode"
// (se estiver null, é porque a página deu refresh/expirou: faça login de novo)
const EPIC_AUTH_URL = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT.split(':')[0]}&responseType=code`;
const epic = () => st('epic');
function epicStatus(msg) { const el = $('epic-sync-status'); if (el) el.textContent = msg; }

export function epicLogin() {
    epicStatus('Abrindo o login da Epic... Faça login na aba que abrir. Quando aparecer um texto começando com {"warning":..., ela tem "authorizationCode" PREENCHIDO: copie o texto da página inteiro (Ctrl+A, Ctrl+C) e cole aqui em seguida. Se "authorizationCode" aparece null, não recarregue: clique em "Entrar com a Epic" de novo. Cada código vale uma única vez.');
    window.open(EPIC_AUTH_URL, '_blank', 'noopener');
}

async function epicExchange(form) {
    return storeFetch('https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token', {
        method: 'POST', basic: EPIC_CLIENT, body: new URLSearchParams(form).toString(), publicFallback: false
    });
}

export async function epicSaveCode() {
    const raw = String(($('epic-code-input') && $('epic-code-input').value) || '').trim();
    let code = null;
    // Pode colar: o JSON da página ({"authorizationCode":"..."}), o endereço (?code=...) ou o código puro
    const mJson = raw.match(/"authorizationCode"\s*:\s*"([0-9a-f]{32})"/i) || raw.match(/"exchangeCode"\s*:\s*"([0-9a-f]{32})"/i);
    const m = raw.match(/[?&#]code=([A-Za-z0-9]+)/);
    const mAny = mJson || (mJson ? null : raw.match(/\b([0-9a-f]{32})\b/i));
    if (mJson) code = mJson[1];
    else if (m) code = m[1];
    else if (mAny) code = mAny[1];
    if (!code) { epicStatus('Não achei o código nesse texto. O JSON precisa ter "authorizationCode" preenchido — se veio null, o login expirou: clique em "Entrar com a Epic" de novo e cole o resultado logo em seguida.'); return; }
    epicStatus('Trocando o código pelo acesso à conta...');
    try {
        // Algumas contas recebem "exchange code" em vez de authorization code: tenta os dois
        let t;
        try { t = await epicExchange({ grant_type: 'authorization_code', code, token_type: 'eg1' }); }
        catch (e1) {
            if (e1 && e1.status === 400) t = await epicExchange({ grant_type: 'exchange_code', exchange_code: code, token_type: 'eg1' });
            else throw e1;
        }
        if (!t.access_token) throw Object.assign(new Error('sem token'), { detail: JSON.stringify(t).slice(0, 200) });
        appData.settings.stores.epic = { ...epic(), token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 7200) * 1000, user: t.displayName || '' };
        if ($('epic-code-input')) $('epic-code-input').value = '';
        saveData(null);
        hooks.toast(`Epic conectada${t.displayName ? ' como ' + t.displayName : ''}! Baixando sua biblioteca...`, false);
        epicSync();
    } catch (e) {
        const det = e && e.detail ? ` (Epic: ${String(e.detail).slice(0, 140)})` : ` (${e && e.message || 'erro'})`;
        epicStatus('Não deu para concluir o login.' + det + (e && e.status ? ' O código é de uso único e expira em segundos: clique em "Entrar com a Epic" de novo e cole o novo endereço imediatamente.' : ' Confere sua internet (ou o Worker atualizado) e tente de novo.'));
        renderStoreStatus('epic');
    }
}

async function epicToken() {
    const g = epic();
    if (!g.token) throw new Error('desconectado');
    if (g.expiresAt && Date.now() > g.expiresAt - 60000 && g.refresh) {
        const t = await epicExchange({ grant_type: 'refresh_token', refresh_token: g.refresh, token_type: 'eg1' });
        if (!t.access_token) throw new Error('sem token');
        appData.settings.stores.epic = { ...g, token: t.access_token, refresh: t.refresh_token || g.refresh, expiresAt: Date.now() + (t.expires_in || 7200) * 1000 };
        saveData(null);
    }
    return epic().token;
}

export async function epicSync() {
    if (!epic().token && !epic().refresh) { epicStatus('Conecte sua conta Epic primeiro (botão acima).'); return; }
    const btn = $('epic-sync-btn'); if (btn) btn.disabled = true;
    epicStatus('Buscando sua biblioteca Epic...');
    try {
        const token = await epicToken();
        const data = await storeFetch('https://library-service.live.use1a.on.epicgames.com/library/api/public/items', { token, publicFallback: false });
        const list = (data && (data.records || data.items)) || [];
        appData.settings.stores.epic = { ...epic(), rawCount: list.length };
        // A lista da biblioteca não traz o nome dos jogos — resolve pelo catálogo,
        // em lotes por namespace. Namespace "ue" = Unreal Engine/editores/assets (não é jogo).
        epicStatus(`${list.length} itens na conta — buscando os nomes dos jogos...`);
        const pairs = [];
        for (const it of list) {
            if (!it || !it.catalogItemId) continue;
            const ns = String(it.namespace || '');
            if (ns.toLowerCase() === 'ue' || String(it.appName || '').toLowerCase().startsWith('ue-') || /^ue\d/i.test(String(it.appName || ''))) continue;
            pairs.push({ ns, id: String(it.catalogItemId) });
        }
        const byNs = new Map();
        pairs.forEach(p => { const arr = byNs.get(p.ns) || []; arr.push(p.id); byNs.set(p.ns, arr); });
        const seen = new Set(), names = [];
        for (const [ns, ids] of byNs) {
            for (let i = 0; i < ids.length; i += 50) {
                const qs = [...new Set(ids.slice(i, i + 50))].map(id => `id=${encodeURIComponent(id)}`).join('&');
                try {
                    const bulk = await storeFetch(`https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${ns}/bulk/items?${qs}&country=BR&locale=pt-BR&includeDLCDetails=false`, { token, publicFallback: false });
                    Object.values(bulk || {}).forEach(item => {
                        const t = String(item && item.title || '').trim();
                        if (!t) return;
                        const cats = ((item && item.categories) || []).map(c => String(c.path || c));
                        if (cats.some(c => /addon|engine|editor|plugin|sdk|asset/i.test(c))) return;
                        if (/unreal engine|editor|plugin|sdk/i.test(t)) return;
                        const k = normText(t);
                        if (!seen.has(k)) { seen.add(k); names.push(t); }
                    });
                } catch (e) { /* lote indisponível: o resto segue */ }
            }
        }
        names.sort((a, b) => a.localeCompare(b));
        if (!names.length) { epicStatus(`A conta respondeu (${list.length} itens), mas não consegui os nomes dos jogos. Atualize o Worker (docs/steam-proxy.md passa pelo catálogo) e tente de novo.`); renderStoreStatus('epic'); return; }
        if (!names.length) { epicStatus('A conta respondeu, mas sem jogos na biblioteca.'); renderStoreStatus('epic'); return; }
        const cat = ensureRefs('epic');
        hooks.undo();
        const have = new Set(appData.games.map(g => normText(g.title)));
        const fresh = [];
        for (const t of names) {
            if (have.has(normText(t))) continue;
            const g = newGame('epic', t, cat.id);
            appData.games.push(g); fresh.push(g);
        }
        appData.settings.stores.epic = { ...epic(), lastSync: Date.now(), lastCount: names.length };
        saveData(() => hooks.render());
        epicStatus(`Sincronizado: ${names.length} jogos na conta Epic · ${fresh.length} novos na categoria "Epic Games".${fresh.length ? ' Dados e capas sendo buscados em segundo plano...' : ''}`);
        hooks.toast(`Epic: ${fresh.length} novos, ${names.length - fresh.length} já cadastrados.`, fresh.length > 0);
        renderStoreStatus('epic');
        if (fresh.length) enrichStoreGames(fresh);
    } catch (e) {
        epicStatus(e && (e.status === 401 || e.status === 403) ? 'Sua sessão da Epic expirou. Entre de novo e cole o novo código.' : 'A sincronização falhou. Veja sua internet (ou o Worker) e tente de novo.');
    } finally {
        if (btn) btn.disabled = false;
        renderStoreStatus('epic');
        renderAllStoreStatus();
    }
}

export function epicDisconnect() {
    if (!epic().token && !epic().refresh) return;
    if (!confirm('Desconectar a Epic Games? Os jogos já importados continuam na categoria Epic Games.')) return;
    appData.settings.stores.epic = { catId: epic().catId };
    saveData(() => renderStoreStatus('epic'));
    hooks.toast('Epic desconectada.', false);
}

// ================= Itch.io: chave de API do usuário =================
// A Itch.io tem API oficial: a chave é gerada em itch.io/user/settings/api-keys.
// Com ela: /me (perfil) e /my-owned-keys (jogos comprados/baixados com chave).
const itch = () => st('itch');
function itchStatus(msg) { const el = $('itch-sync-status'); if (el) el.textContent = msg; }

export function itchSaveKey() {
    const v = String(($('itch-key-input') && $('itch-key-input').value) || '').trim();
    if (!v) { itchStatus('Cole sua chave de API. Crie em itch.io/user/settings/api-keys (botão "Generate new API key").'); return; }
    appData.settings.stores.itch = { ...itch(), apiKey: v };
    saveData(null);
    renderStoreStatus('itch');
    itchStatus('Chave salva! Verificando na Itch.io...');
    itchSync();
}

export function itchDisconnect() {
    if (!itch().apiKey) return;
    if (!confirm('Desconectar a Itch.io? Os jogos já importados continuam na categoria Itch.io.')) return;
    appData.settings.stores.itch = { catId: itch().catId };
    saveData(() => renderStoreStatus('itch'));
    hooks.toast('Itch.io desconectada.', false);
    if ($('itch-key-input')) $('itch-key-input').value = '';
}

export async function itchSync() {
    const key = itch().apiKey;
    if (!key) { itchStatus('Cole sua chave da API primeiro.'); return; }
    const btn = $('itch-sync-btn'); if (btn) btn.disabled = true;
    itchStatus('Verificando sua conta na Itch.io...');
    try {
        // API atual da Itch.io: api.itch.io com Authorization: Bearer <chave>
        const me = await storeFetch('https://api.itch.io/profile', { token: key, publicFallback: false });
        if (me && me.errors) throw Object.assign(new Error('auth'), { status: 403, detail: me.errors.join('; ') });
        const user = me && me.user;
        if (!user) throw Object.assign(new Error('auth'), { status: 403, detail: 'perfil vazio' });
        itchStatus(`Oi, ${user.username || user.display_name}! Baixando seus jogos...`);
        appData.settings.stores.itch = { ...itch(), user: user.username || user.display_name };
        // Jogos com chave (compras, bundles, resgates): paginado, per_page máximo 500
        const keys = [];
        for (let page = 1; page <= 20; page++) {
            const data = await storeFetch(`https://api.itch.io/profile/owned-keys?page=${page}&per_page=500`, { token: key, publicFallback: false });
            if (data && data.errors) throw Object.assign(new Error('auth'), { status: 403, detail: (data.errors || []).join('; ') });
            const got = data && data.owned_keys;
            const arr = Array.isArray(got) ? got : Object.values(got || {});
            if (!arr.length) break;
            keys.push(...arr);
            if (arr.length < (data.per_page || 500)) break;
            itchStatus(`Oi, ${user.username}! Baixando seus jogos... (${keys.length})`);
        }
        const seen = new Set();
        const names = [];
        const coverByTitle = new Map();
        keys.forEach(k => {
            const gm = k.game || {};
            const t = String(gm.title || '').trim();
            if (!t || seen.has(normText(t))) return;
            seen.add(normText(t));
            names.push(t);
            if (gm.cover_url) coverByTitle.set(normText(t), gm.cover_url);
        });
        const cat = ensureRefs('itch');
        hooks.undo();
        const have = new Set(appData.games.map(g => normText(g.title)));
        const fresh = [];
        for (const t of names) {
            if (have.has(normText(t))) continue;
            const g = newGame('itch', t, cat.id);
            const cov = coverByTitle.get(normText(t));
            if (cov) { g.image = cov; g.wideCover = true; }
            appData.games.push(g); fresh.push(g);
        }
        appData.settings.stores.itch = { ...itch(), lastSync: Date.now(), lastCount: names.length };
        saveData(() => hooks.render());
        itchStatus(`Sincronizado @${user.username}: ${names.length} jogos na conta · ${fresh.length} novos na categoria "Itch.io".${fresh.length ? ' Dados e capas sendo buscados em segundo plano...' : ''}`);
        hooks.toast(`Itch.io: ${fresh.length} novos, ${names.length - fresh.length} já cadastrados.`, fresh.length > 0);
        renderStoreStatus('itch');
        renderAllStoreStatus();
        if (fresh.length) enrichStoreGames(fresh);
    } catch (e) {
        const det = e && e.detail ? ` (resposta: ${String(e.detail).slice(0, 140)})` : ` (${e && e.message || 'erro'})`;
        itchStatus((e && (e.status === 401 || e.status === 403) ? 'Chave recusada pela Itch.io. Gere outra e cole de novo.' : 'A sincronização falhou.' + det + ' Confira a internet e se o Worker está atualizado (docs/steam-proxy.md precisa aceitar o host itch.io).'));
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function initStores(h) {
    hooks = { ...hooks, ...h };
    applyStoreCatIcons();   // logos nas categorias/plataformas das lojas (inclusive retroativo)
    const dlg = $('modal-settings');
    if (dlg) dlg.addEventListener('toggle', () => { if (dlg.open) renderAllStoreStatus(); });
    renderAllStoreStatus();
}
