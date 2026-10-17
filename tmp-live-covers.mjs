// Diagnóstico AO VIVO (fora da suíte): o fluxo autoVerticalCover acha capas reais?
import './tests/shim.mjs';
import { unmockFetch, sleep } from './tests/shim.mjs';
import { listGames } from './js/gameApi.js';
import { autoVerticalCover } from './js/covers.js';

unmockFetch();
const res = await listGames({ ordering: '-added', page_size: 8 });
console.log(`Jogos do Explorar (Em alta): ${res.items.length}`);
for (const g of res.items.slice(0, 5)) {
    const t0 = Date.now();
    try {
        const cov = await autoVerticalCover(g.title, g.rawgId);
        console.log(`- "${g.title}" (rawg ${g.rawgId}): ${cov ? `ACHEI (${cov.source})` : 'NÃO ACHEI'} em ${Date.now() - t0}ms`);
    } catch (e) { console.log(`- "${g.title}": ERRO ${e.message}`); }
}
