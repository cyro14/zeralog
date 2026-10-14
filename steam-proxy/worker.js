// Proxy CORS do ZeraLog para as APIs das lojas de jogos — Cloudflare Worker (plano gratuito).
// Deploy: dash.workers.dev → Create Worker → colar este código → Deploy.
//
// O que ele faz:
// 1. Recebe ?url=https://<host-permitido>/... e repassa com cabeçalhos CORS (GET e POST).
// 2. Só repassa hosts de lojas oficiais na lista abaixo (não vira proxy aberto da internet).
// 3. Repassa os cabeçalhos Authorization e Content-Type enviados pelo app
//    (necessários para os tokens das lojas; a senha do usuário NUNCA passa por aqui).
// 4. Se a chamada à Steam vier SEM &key= e você configurou STEAM_DEFAULT_KEY,
//    injeta sua chave — assim os usuários nem precisam criar chave própria.
//
// Variável opcional (Settings → Variables and Secrets):
//   STEAM_DEFAULT_KEY = sua chave 32-char de steamcommunity.com/dev/apikey
const ALLOWED_HOSTS = new Set([
    'api.steampowered.com',                                   // Steam biblioteca/perfil
    'auth.gog.com', 'embed.gog.com', 'api.gog.com',           // GOG: oauth, biblioteca, produtos
    'account-public-service-prod.ol.epicgames.com',           // Epic: oauth
    'account-public-service-prod03.ol.epicgames.com',
    'library-service.live.use1a.on.epicgames.com',            // Epic: biblioteca
    'catalog-public-service-prod06.ol.epicgames.com',         // Epic: nomes dos jogos (catálogo)
    'itch.io', 'api.itch.io',                                 // Itch.io API (chave do usuário)
    'howlongtobeat.com'                                       // HowLongToBeat: tempo de jogo + box art
]);

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
        const auth = request.headers.get('authorization');
        if (auth) headers['Authorization'] = auth;
        const ctype = request.headers.get('content-type');
        if (ctype) headers['Content-Type'] = ctype;
        headers['User-Agent'] = 'ZeraLog/1.0';
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}
