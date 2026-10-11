// Conexão com a Steam: login via OpenID (botão "Entrar com a Steam"), importação
// da biblioteca com as horas jogadas e sincronização por botão de refresh.
//
// Como funciona, na prática:
// 1. O login OpenID redireciona para a Steam e volta com o SteamID na URL (sem servidor).
// 2. A Steam Web API (api.steampowered.com) não aceita chamadas diretas do navegador
//    (CORS), então as chamadas passam por proxies públicos — dá para definir um próprio
//    nas opções avançadas, no formato https://meu-proxy.com/?url=%s
// 3. A GetOwnedGames exige a chave da Web API do próprio usuário (grátis em
//    steamcommunity.com/dev/apikey) e que os "Detalhes do jogo" do perfil estejam públicos.
// 4. Os jogos entram na categoria "Steam" (criada automaticamente), plataforma "Steam",
//    com as horas jogadas; as capas verticais são baixadas e salvas no app em segundo plano.
import { appData, saveData } from './store.js';
import { esc, blobToSmallJpeg, searchGames } from './gameApi.js';
import { platformIcons } from './icons.js';

const $ = id => document.getElementById(id);
const ID_RE = /^\d{17}$/;

let hooks = { render() {}, toast() {}, undo() {} };

const st = () => appData.settings.steam || {};

// ---------- helpers ----------
function steamStatus(msg) { const el = $('steam-sync-status'); if (el) el.textContent = msg; }

const normName = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ---------- chamadas à Steam Web API (via proxy CORS) ----------
// Cloudflare Worker do projeto (melhor opção): siga docs/steam-proxy.md e cole a URL aqui.
const DEFAULT_PROXY = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';
const PROXIES = [
    u => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`,
    u => `https://test.cors.workers.dev/?${u}`,
    u => `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://cors.isomorphic-git.org/${u}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
];
function proxyMakers() {
    const custom = String(st().proxy || '').trim();
    const own = custom ? [u => (custom.includes('%s') ? custom.replace('%s', encodeURIComponent(u)) : custom + encodeURIComponent(u))] : [];
    const def = DEFAULT_PROXY ? [u => `${DEFAULT_PROXY}?url=${encodeURIComponent(u)}`] : [];
    return [...own, ...def, ...PROXIES];
}
async function steamApi(path, params) {
    const url = `https://api.steampowered.com/${path}?${new URLSearchParams(params)}`;
    let last = null;
    for (const mk of proxyMakers()) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const res = await fetch(mk(url), { signal: ctrl.signal });
            clearTimeout(timer);
            if (res.status === 403) { last = Object.assign(new Error('403'), { status: 403 }); break; }   // chave/perfil: outro proxy não resolve
            if (!res.ok) { last = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status }); continue; }
            return JSON.parse(await res.text());
        } catch (e) { clearTimeout(timer); last = e; }
    }
    throw last || new Error('sem conexão');
}

// A chave é opcional quando o proxy do projeto existe (ele pode injetar uma padrão)
const hasKey = () => !!(st().apiKey || '').trim() || !!DEFAULT_PROXY;

// ---------- login (OpenID) ----------
export function steamLogin() {
    if (!/^https?:$/.test(location.protocol)) {
        hooks.toast('Para o login da Steam funcionar, abra o app pelo link dele (https://...) — ou cole o perfil abaixo.', false);
        return;
    }
    const q = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': location.origin + location.pathname,
        'openid.realm': location.origin,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    location.href = `https://steamcommunity.com/openid/login?${q}`;
}

// A Steam devolve o usuário com o openid na query string; roda uma vez na inicialização.
function catchOpenIdReturn() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('openid.mode') !== 'id_res') return;
    const m = (qs.get('openid.claimed_id') || '').match(/openid\/id\/(\d{17})/);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (!m) return;
    try { localStorage.setItem('zeralog_welcomed', 'true'); } catch (e) {}   // quem volta da Steam já passou da boas-vindas
    appData.settings.steam = { ...st(), steamId: m[1] };
    saveData(null);
    renderSteamSettings();
    if (hooks.openSteamSettings) hooks.openSteamSettings();   // volta direto para a tela de Conexões
    if (st().apiKey) { hooks.toast('Steam conectada! Sincronizando sua biblioteca...', false); steamSync(); }
    else hooks.toast('Steam conectada! Cole sua chave da Web API para importar os jogos — a sincronização começa sozinha ao salvar a chave.', false);
}

// ---------- vincular manualmente (link do perfil ou SteamID64) ----------
export async function steamSaveManualId() {
    const inp = $('steam-id-input');
    const raw = String(inp && inp.value || '').trim();
    let id = null;
    const prof = raw.match(/profiles\/(\d{17})/);
    if (prof) id = prof[1];
    else if (ID_RE.test(raw)) id = raw;
    const van = raw.match(/id\/([A-Za-z0-9_-]{2,64})/) || (!id && raw && !/[\s\/]/.test(raw) ? [null, raw] : null);
    if (!id && van) {
        if (!hasKey()) { steamStatus('Para achar pelo nome do perfil preciso da chave da Web API (abaixo). Cole o link com o número (profiles/7656...) ou gere a chave.'); return; }
        steamStatus('Procurando seu perfil na Steam...');
        try {
            const r = await steamApi('ISteamUser/ResolveVanityURL/v1/', { key: st().apiKey, vanityurl: van[1] });
            if (r && r.response && r.response.success === 1) id = r.response.steamid;
        } catch (e) { steamStatus('Não consegui resolver o nome do perfil. Cole o link com o número (steamcommunity.com/profiles/7656...) ou gere a chave da Web API.'); return; }
    }
    if (!id) { steamStatus('Não reconheci o endereço. Cole o link do seu perfil (steamcommunity.com/id/... ou /profiles/...) ou o SteamID64 (17 dígitos).'); return; }
    appData.settings.steam = { ...st(), steamId: id };
    saveData(() => { renderSteamSettings(); hooks.render(); });
    hooks.toast('Steam vinculada!', false);
    if (st().apiKey) steamSync();
}

// ---------- chave da API e proxy (Salvos nos dados do app, vão no backup) ----------
export function steamSaveKey(v) {
    const k = String(v || '').trim();
    appData.settings.steam = { ...st(), apiKey: k };
    saveData(null);
    hooks.toast(k ? (/^[0-9A-Fa-f]{32}$/.test(k) ? 'Chave da Steam salva.' : 'Chave salva — mas a da Steam tem 32 caracteres; confira se colou completa.') : 'Chave da Steam removida.', false);
    renderSteamSettings();
    // Com a conta conectada e uma chave válida, a importação começa sozinha
    if (k && /^[0-9A-Fa-f]{32}$/.test(k) && st().steamId && !st().lastSync) {
        hooks.toast('Chave salva! Sincronizando sua biblioteca...', false);
        steamSync();
    }
}
export function steamSaveProxy(v) {
    appData.settings.steam = { ...st(), proxy: String(v || '').trim() };
    saveData(null);
    hooks.toast('Proxy da Steam salvo.', false);
}
export function steamLogout() {
    if (!st().steamId) return;
    if (!confirm('Desconectar a Steam? Os jogos já importados continuam na categoria Steam.')) return;
    appData.settings.steam = { ...st(), steamId: null, persona: '', avatar: '', lastSync: null, lastCount: null };
    saveData(() => { hooks.render(); renderSteamSettings(); });
    hooks.toast('Steam desconectada.', false);
}

// ---------- categoria "Steam" + plataforma "Steam" ----------
function ensureSteamRefs() {
    let cat = appData.categories.find(c => c.id === st().catId) || appData.categories.find(c => normName(c.name) === 'steam');
    if (!cat) { cat = { id: 'c' + Date.now(), name: 'Steam', icon: { name: 'steam-logo', weight: 'fill' } }; appData.categories.unshift(cat); }   // categorias novas entram primeiro na ordem
    if (!cat.icon) cat.icon = { name: 'steam-logo', weight: 'fill' };
    if (!appData.platforms.some(p => p.name === 'Steam')) appData.platforms.push({ name: 'Steam', icon: platformIcons['Steam'] });
    appData.settings.steam = { ...st(), catId: cat.id };
    return cat;
}

// ---------- sincronização (o botão de refresh chama aqui) ----------
let syncing = false;
export async function steamSync() {
    if (syncing) { hooks.toast('A sincronização da Steam já está em andamento.', false); return; }
    const s = st();
    if (!s.steamId) { steamStatus('Conecte sua conta primeiro (ou cole o link do perfil abaixo).'); hooks.toast('Conecte a Steam antes de sincronizar.', false); return; }
    if (!hasKey()) { steamStatus('Cole sua chave da Steam Web API abaixo — crie grátis em steamcommunity.com/dev/apikey (com a Steam logada, domínio pode ser qualquer um).'); hooks.toast('Falta a chave da Steam Web API (Configurações › Steam).', false); return; }
    syncing = true;
    const btn = $('steam-sync-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }
    steamStatus('Buscando sua biblioteca na Steam...');
    try {
        const data = await steamApi('IPlayerService/GetOwnedGames/v1/', { key: s.apiKey, steamid: s.steamId, include_appinfo: 1, include_played_free_games: 1, format: 'json' });
        const resp = data && data.response;
        const games = resp && Array.isArray(resp.games) ? resp.games : (resp && resp.game_count === 0 ? [] : null);
        if (!games) throw Object.assign(new Error('vazio'), { empty: true });
        const cat = ensureSteamRefs();
        fetchPersona().catch(() => {});   // nome/avatar: bônus, não bloqueia a importação
        hooks.undo();
        let added = 0, updated = 0;
        // Casa os jogos da Steam com os que o usuário já tem: pelo appid ou pelo título.
        // Se o jogo já existir no ZeraLog, só as horas são atualizadas — o resto não é tocado.
        const byApp = new Map();
        const byName = new Map();
        appData.games.forEach(g => {
            if (g.steamAppId) byApp.set(g.steamAppId, g);
            const n = normName(g.title);
            if (n && !byName.has(n)) byName.set(n, g);
        });
        const newGames = [];
        for (const gm of games) {
            const hours = String(Math.round((gm.playtime_forever || 0) / 6) / 10);   // minutos → horas com 1 casa decimal
            const ex = byApp.get(gm.appid) || byName.get(normName(gm.name || ''));
            if (ex) {
                if (!ex.steamAppId) { ex.steamAppId = gm.appid; byApp.set(gm.appid, ex); }   // vincula para as próximas sincronizações
                if ((ex.hoursPlayed || '') !== hours) { ex.hoursPlayed = hours; updated++; }
                continue;
            }
            const g = {
                id: `g${Date.now()}_${gm.appid}`,
                catId: cat.id,
                title: String(gm.name || '').trim() || `Steam ${gm.appid}`,
                platform: 'Steam', steamAppId: gm.appid, rawgId: null,
                meta: '', hoursPlayed: hours, journalNotes: '', description: '', genres: [],
                released: '', metacritic: null, franchise: '',
                continuous: false, emulated: false, originalConsole: '', difficulty: '', isPortable: false,
                image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${gm.appid}/library_600x900.jpg`,
                state: null, userRating: null, dateFinished: null, is100: false, review: ''
            };
            appData.games.push(g);
            newGames.push(g);
            byName.set(normName(g.title), g);
            added++;
        }
        appData.settings.steam = { ...st(), lastSync: Date.now(), lastCount: games.length };
        saveData(() => hooks.render());
        steamStatus(`Sincronizado agora: ${games.length} ${games.length === 1 ? 'jogo' : 'jogos'} · ${added} ${added === 1 ? 'novo' : 'novos'}, ${updated} com horas atualizadas.${added ? ' Capas e dados sendo buscados em segundo plano...' : ''}`);
        hooks.toast(games.length ? `Steam: ${added} ${added === 1 ? 'novo' : 'novos'}, ${updated} atualizados.` : 'A conta não tem jogos para importar.', added > 0);
        if (added) { embedSteamCovers(); enrichSteamGames(newGames); }
    } catch (e) {
        if (e && e.status === 403) steamStatus('A Steam recusou (403): confira a chave (steamcommunity.com/dev/apikey) e se os "Detalhes do jogo" do seu perfil estão públicos (Privacidade da Steam).');
        else if (e && e.empty) steamStatus('A Steam respondeu vazio. Deixe os "Detalhes do jogo" do seu perfil públicos nas configurações de privacidade da Steam e tente de novo.');
        else steamStatus(`Todos os proxies públicos falharam (limites de uso deles, é temporário). Tente de novo em alguns minutos. Se for sempre assim, confira se a chave tem 32 caracteres e se os "Detalhes do jogo" do perfil estão públicos.`);
        hooks.toast('A sincronização com a Steam falhou — detalhe em Configurações › Steam.', false);
    } finally {
        syncing = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar agora'; }
        renderSteamSettings();
    }
}

// Nome e avatar do jogador (mostrados nas Configurações)
async function fetchPersona() {
    const s = st();
    if (!s.steamId || !s.apiKey) return;
    const r = await steamApi('ISteamUser/GetPlayerSummaries/v2/', { key: s.apiKey, steamids: s.steamId });
    const pl = r && r.response && r.response.players && r.response.players[0];
    if (pl) {
        appData.settings.steam = { ...st(), persona: pl.personaname || '', avatar: pl.avatarmedium || pl.avatar || '' };
        saveData(null);
        renderSteamSettings();
    }
}

// ---------- capas: baixa da loja da Steam e guarda no app (em segundo plano) ----------
// Retorna: data URL (salva) | false (o jogo não tem capa na loja) | null (não deu agora: mantém o link)
async function steamCover(appid) {
    const urls = [
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    ];
    for (const u of urls) {
        let res;
        try { res = await fetch(u); } catch (e) { return null; }   // rede/CORS: o <img> do app mostra o link do mesmo jeito
        if (res.ok) { try { return await blobToSmallJpeg(await res.blob(), 420); } catch (e) { return null; } }
        if (res.status !== 404) return null;
    }
    return false;
}
async function embedSteamCovers() {
    const targets = appData.games.filter(g => g.steamAppId && g.image && /^https?:/.test(String(g.image)));
    if (!targets.length) return;
    const queue = [...targets];
    let done = 0, saved = 0;
    const paint = () => steamStatus(`Capas da Steam: ${done}/${targets.length} processadas...`);
    const worker = async () => {
        while (queue.length) {
            const g = queue.shift();
            const got = await steamCover(g.steamAppId);
            if (typeof got === 'string') { g.image = got; saved++; }
            else if (got === false) g.image = null;
            done++;
            if (done % 4 === 0) { paint(); saveData(null); }
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    saveData(() => hooks.render());
    steamStatus(`Pronto: ${targets.length} ${targets.length === 1 ? 'capa' : 'capas'} conferidas · ${saved} salvas no app.`);
}

// ---------- dados da RAWG para os jogos importados (gêneros, ano, nota, descrição) ----------
// Só preenche campos vazios — nunca sobrescreve o que o usuário editou. Roda em segundo plano.
async function enrichSteamGames(newGames) {
    if (!newGames.length) return;
    const queue = [...newGames];
    let done = 0, hit = 0, stopped = false;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const paint = () => steamStatus(`Dados dos jogos (RAWG): ${done}/${newGames.length}...`);
    const worker = async () => {
        while (queue.length && !stopped) {
            const g = queue.shift();
            try {
                const results = await searchGames(g.title, 4);
                const want = normName(g.title);
                const d = (results || []).find(r => normName(r.title) === want) || (results || [])[0];
                if (d) {
                    if (!g.rawgId) g.rawgId = d.rawgId;
                    if ((!g.genres || !g.genres.length) && d.genres.length) g.genres = d.genres;
                    if (!g.released && d.released) g.released = d.released;
                    if (g.metacritic == null && d.metacritic) g.metacritic = d.metacritic;
                    if (!g.description && d.description) g.description = d.description;
                    hit++;
                }
                done++;
                if (done % 3 === 0) { paint(); saveData(null); }
                await sleep(250);   // respeita o limite de requisições da RAWG
            } catch (e) {
                done++;
                // chave recusada ou limite atingido: para a busca de dados, mas os jogos já estão importados
                if (e && e.kind === 'http' && (e.status === 401 || e.status === 403 || e.status === 429)) stopped = true;
            }
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    saveData(() => hooks.render());
    steamStatus(`Dados dos jogos: ${hit}/${newGames.length} encontrados na RAWG${stopped ? ' (parado antes do fim: limite da chave RAWG — use uma chave própria em Capas e Busca)' : ''}.`);
}

// ---------- painel nas Configurações ----------
export function renderSteamSettings() {
    const box = $('steam-status');
    if (!box) return;
    const s = st();
    const keyInp = $('steam-key-input'), proxyInp = $('steam-proxy-input');
    if (keyInp && document.activeElement !== keyInp) keyInp.value = s.apiKey || '';
    if (proxyInp && document.activeElement !== proxyInp) proxyInp.value = s.proxy || '';
    const login = $('steam-login-btn'), sync = $('steam-sync-btn'), out = $('steam-logout-btn');
    if (out) out.style.display = s.steamId ? '' : 'none';
    if (sync) sync.style.display = s.steamId && hasKey() ? '' : 'none';
    if (login) login.style.display = s.steamId ? 'none' : '';
    if (s.steamId) {
        const last = s.lastSync ? ` · última sincronização: ${new Date(s.lastSync).toLocaleDateString('pt-BR')} (${s.lastCount || 0} ${s.lastCount === 1 ? 'jogo' : 'jogos'})` : '';
        box.innerHTML = `<strong style="color: var(--accent-finished);">✓ Conectado</strong> como <strong>${esc(s.persona || 'Steam')}</strong> <small style="color: var(--text-muted);">(${esc(s.steamId)})</small>${s.avatar ? ` <img src="${esc(s.avatar)}" alt="" style="width:22px;height:22px;border-radius:50%;vertical-align:-6px;">` : ''}<small style="color: var(--text-muted);">${last}</small>`;
    } else {
        box.innerHTML = `<span style="color: var(--text-muted);">Não conectado. Entre com a Steam ou cole o link do seu perfil abaixo.</span>`;
    }
}

// ---------- inicialização (chamado no start) ----------
export function initSteam(h) {
    hooks = { render: (h && h.render) || (() => {}), toast: (h && h.toast) || (() => {}), undo: (h && h.undo) || (() => {}), openSteamSettings: (h && h.openSteamSettings) || null };
    const dlg = $('modal-settings');
    if (dlg) dlg.addEventListener('toggle', () => { if (dlg.open) renderSteamSettings(); });
    catchOpenIdReturn();
}
