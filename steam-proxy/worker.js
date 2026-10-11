// Proxy CORS do ZeraLog para a Steam Web API — Cloudflare Worker (plano gratuito).
// Deploy: dasboard.workers.dev → Create Worker → colar este código → Deploy.
//
// O que ele faz:
// 1. Recebe ?url=https://api.steampowered.com/... e repassa com cabeçalhos CORS.
// 2. Só repassa se o host for api.steampowered.com (não vira proxy aberto da internet).
// 3. Se a chamada vier SEM &key= e você configurou a variável STEAM_DEFAULT_KEY,
//    injeta sua chave — assim os usuários nem precisam criar chave própria.
//
// Variável opcional (Settings → Variables and Secrets):
//   STEAM_DEFAULT_KEY = sua chave 32-char de steamcommunity.com/dev/apikey
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        // Preflight CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }
        const target = url.searchParams.get('url');
        if (!target) {
            return new Response('ZeraLog Steam proxy ok. Use ?url=https://api.steampowered.com/...', { status: 200, headers: corsHeaders() });
        }
        let t;
        try { t = new URL(target); } catch (e) { return new Response('URL inválida', { status: 400, headers: corsHeaders() }); }
        if (t.hostname !== 'api.steampowered.com') {
            return new Response('Este proxy só repassa api.steampowered.com', { status: 400, headers: corsHeaders() });
        }
        if (!t.searchParams.get('key') && env.STEAM_DEFAULT_KEY) {
            t.searchParams.set('key', env.STEAM_DEFAULT_KEY);
        }
        let res;
        try {
            res = await fetch(t.toString(), { cf: { cacheTtl: 120, cacheEverything: true } });
        } catch (e) {
            return new Response(JSON.stringify({ steam_error: true }), { status: 502, headers: corsHeaders() });
        }
        const body = await res.text();
        return new Response(body, {
            status: res.status,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
};
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}
