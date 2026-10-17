// Proxy CORS do ZeraLog para as APIs das lojas de jogos — Cloudflare Worker (plano gratuito).
// Deploy: dash.workers.dev → Create Worker → colar este código → Deploy.
//
// O que ele faz:
// 1. Recebe ?url=https://<host-permitido>/... e repassa com cabeçalhos CORS (GET e POST).
// 2. Só repassa hosts de lojas oficiais na lista abaixo (não vira proxy aberto da internet).
// 3. Repassa os cabeçalhos Authorization, Content-Type, Client-ID e x-auth-token enviados
//    pelo app (tokens das lojas, credenciais da IGDB e o token curto do HowLongToBeat;
//    a senha do usuário NUNCA passa por aqui).
// 4. Se a chamada à Steam vier SEM &key= e você configurou STEAM_DEFAULT_KEY,
//    injeta sua chave — assim os usuários nem precisam criar chave própria.
// 5. No HowLongToBeat ele assume o papel do navegador (User-Agent de navegador + Referer
//    do próprio site): a busca do site recusa com 403 qualquer requisição que não
//    pareça ter vindo da página deles — e o app não pode mandar Referer por conta própria.
//
// Variável opcional (Settings → Variables and Secrets):
//   STEAM_DEFAULT_KEY = sua chave 32-char de steamcommunity.com/dev/apikey
const ALLOWED_HOSTS = new Set([
    'api.steampowered.com',                                   // Steam biblioteca/perfil
    'store.steampowered.com',                                 // Steam: busca da loja (nome de exibição/ID)
    'auth.gog.com', 'embed.gog.com', 'api.gog.com',           // GOG: oauth, biblioteca, produtos
    'account-public-service-prod.ol.epicgames.com',           // Epic: oauth
    'account-public-service-prod03.ol.epicgames.com',
    'library-service.live.use1a.on.epicgames.com',            // Epic: biblioteca
    'catalog-public-service-prod06.ol.epicgames.com',         // Epic: nomes dos jogos (catálogo)
    'itch.io', 'api.itch.io',                                 // Itch.io API (chave do usuário)
    'www.steamgriddb.com', 'api.steamgriddb.com',             // SteamGridDB: busca e capas da comunidade
    'howlongtobeat.com',                                      // HowLongToBeat: tempo de jogo + box art
    'api.igdb.com'                                            // IGDB: fichas e capas (token vem da Twitch)
]);

// Hosts que passam a exigir cara de navegador (os dois caminhos do HowLongToBeat:
// /api/search/site/init e /api/search/site — o token que ele devolve vale para a
// combinação IP + User-Agent, então os dois pedidos precisam sair iguais daqui).
const BROWSER_HOSTS = new Set(['howlongtobeat.com']);
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Cabeçalhos do app que o destino precisa receber (os mesmos nomes em minúsculas).
const FORWARD = ['authorization', 'content-type', 'client-id', 'x-auth-token', 'accept'];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        // Preflight CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }
        const target = url.searchParams.get('url');
        if (!target) {
            return new Response('ZeraLog store proxy ok. Use ?url=https://api.steampowered.com/...', { status: 200, headers: corsHeaders() });
        }
        let t;
        try { t = new URL(target); } catch (e) { return new Response('URL inválida', { status: 400, headers: corsHeaders() }); }
        if (!ALLOWED_HOSTS.has(t.hostname)) {
            return new Response('Host fora da lista permitida do ZeraLog.', { status: 400, headers: corsHeaders() });
        }
        if (t.hostname === 'api.steampowered.com' && !t.searchParams.get('key') && env.STEAM_DEFAULT_KEY) {
            t.searchParams.set('key', env.STEAM_DEFAULT_KEY);
        }
        const headers = {};
        for (const name of FORWARD) {
            const v = request.headers.get(name);
            if (v) headers[name] = v;
        }
        const browser = BROWSER_HOSTS.has(t.hostname);
        headers['User-Agent'] = browser ? BROWSER_UA : (request.headers.get('user-agent') || BROWSER_UA);
        if (browser) {
            headers['Referer'] = 'https://howlongtobeat.com/';
            if (!headers['accept']) headers['accept'] = 'application/json';
        }
        const init = { method: request.method, headers };
        if (request.method === 'POST' || request.method === 'PUT') init.body = await request.text();
        let res;
        try {
            res = await fetch(t.toString(), init);
        } catch (e) {
            return new Response(JSON.stringify({ proxy_error: true }), { status: 502, headers: corsHeaders() });
        }
        const body = await res.text();
        return new Response(body, {
            status: res.status,
            headers: { ...corsHeaders(), 'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8' }
        });
    }
};
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Client-ID, x-auth-token'
    };
}
