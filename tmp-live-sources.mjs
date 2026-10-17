// Diagnóstico 2 (ao vivo): quanto tempo cada fonte de capa demora sozinha?
import './tests/shim.mjs';
import { unmockFetch } from './tests/shim.mjs';
unmockFetch();

// réplicas mínimas das fontes para medir tempo isolado
const RAWG_KEY = 'ae08037aa9fb40a48b12090819cedb07';
async function timed(name, fn) {
    const t0 = Date.now();
    try { const r = await fn(); console.log(`${name}: ${(Date.now() - t0) / 1000}s -> ${r}`); }
    catch (e) { console.log(`${name}: ${(Date.now() - t0) / 1000}s -> ERRO ${e.message}`); }
}

// 1) RAWG stores (caminho rápido da Steam)
await timed('RAWG getGameStores(4200)', async () => {
    const r = await fetch(`https://api.rawg.io/api/games/4200/stores?key=${RAWG_KEY}`);
    const j = await r.json();
    const s = (j.results || []).map(x => x.url).join(' | ');
    return s || '(sem lojas)';
});

// 2) download da capa Steam 600x900 (o que o fetchImageBlob faz)
await timed('fetch blob Steam 600x900 (Portal 2 app 620)', async () => {
    const r = await fetch('https://cdn.cloudflare.steamstatic.com/steam/apps/620/library_600x900.jpg');
    const b = await r.blob();
    return `${b.size} bytes ${b.type}`;
});

// 3) Wikipédia EN+PT (o wikipedia() do covers.js)
await timed('Wikipedia EN+PT', async () => {
    const q = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: 'Portal 2 video game', gsrlimit: 4, gsrnamespace: 0, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 600, pilicense: 'any', redirects: 1, format: 'json', formatversion: 2, origin: '*' });
    await fetch(`https://en.wikipedia.org/w/api.php?${q}`);
    const q2 = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: 'Portal 2 jogo eletrônico', gsrlimit: 4, gsrnamespace: 0, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 600, pilicense: 'any', redirects: 1, format: 'json', formatversion: 2, origin: '*' });
    await fetch(`https://pt.wikipedia.org/w/api.php?${q2}`);
    return 'ok';
});

// 4) HLTB (o caminho com 5 proxies em fila)
await timed('HLTB fetchHLTBData-like (5 proxies)', async () => {
    const PROX = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';
    const body = JSON.stringify({ searchType: 'games', searchTerms: ['Portal 2'], searchPage: 1, size: 3 });
    for (const mk of [u => `${PROX}?url=${encodeURIComponent(u)}`, u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`]) {
        const t0 = Date.now();
        try {
            const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000);
            const r = await fetch(mk('https://howlongtobeat.com/api/search'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: c.signal });
            clearTimeout(t);
            console.log(`  proxy ${new URL(mk('https://x.com')).host}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> HTTP ${r.status}`);
            if (r.ok) return `ok via ${new URL(mk('https://x.com')).host}`;
        } catch (e) { clearTimeout(t); console.log(`  proxy ${new URL(mk('https://x.com')).host}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> FALHOU ${e.message}`); }
    }
    return 'todos falharam';
});
