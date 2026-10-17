// Testes da descoberta automática de wiki (js/wiki.js): a automação procura no
// Fandom e, quando o jogo não tem Fandom, no wiki.gg — mesma API MediaWiki.
// Herméticos: só o fetch é mockado, nenhuma rede é usada.
import { test, assert, assertEq, mockFetch } from './shim.mjs';
import { findFandomWiki, findWikiGG, findHostedWiki, WIKI_HOSTS } from '../js/wiki.js';

// Responde as três chamadas da descoberta, pelo parâmetro da URL:
// siteinfo (nome/caminho/página inicial), título exato e busca.
const wiki = ({ sitename, search = [], page = null, articlepath = '/wiki/$1', mainpage = '' }) => async u => {
    if (u.includes('list=search')) return { query: { search: search.map(title => ({ title, snippet: `sobre ${title}` })) } };
    if (u.includes('titles=')) return { query: { pages: [page ? { title: page } : { title: 'Inexistente', missing: true }] } };
    return { query: { general: { sitename, articlepath, mainpage: mainpage || sitename } } };
};
const down = status => ({ __res: { ok: false, status, json: async () => ({}) } });

test('wiki.gg: acha a wiki pelo subdomínio e abre o artigo com o título do jogo', async () => {
    const seen = [];
    mockFetch([['terraria.wiki.gg', u => { seen.push(String(u)); return wiki({ sitename: 'Terraria Wiki', page: 'Terraria' })(String(u)); }]]);
    const found = await findWikiGG({ title: 'Terraria' });
    assert(found, 'achou a wiki.gg do jogo');
    assertEq(found.src.api, 'https://terraria.wiki.gg/api.php', 'API MediaWiki do wiki.gg');
    assertEq(found.src.name, 'Terraria Wiki', 'nome vindo do siteinfo');
    assertEq(found.src.id, 'wg-terraria', 'id do wiki.gg (prefixo próprio, sem colidir com o Fandom)');
    assertEq(found.title, 'Terraria', 'título canônico do artigo');
    assert(seen.some(u => u.includes('titles=Terraria')), 'confere o título exato antes de buscar');
    assert(!seen.some(u => u.includes('list=search')), 'com o artigo existindo, nem precisa da busca');
});

test('wiki.gg: título exato não existe e a busca acha o artigo (nome da wiki conta como acerto)', async () => {
    mockFetch([['slaythespire.wiki.gg', wiki({ sitename: 'Slay the Spire Wiki', search: ['Coffee Dripper', 'Slay the Spire Wiki'], mainpage: 'Slay the Spire Wiki' })]]);
    const found = await findWikiGG({ title: 'Slay the Spire' });
    assertEq(found.title, 'Slay the Spire Wiki', 'ignora resultado sem relação e pega o artigo do jogo');
});

test('wiki.gg: busca ruim sem artigo do jogo cai na página inicial da wiki', async () => {
    mockFetch([['calamitymod.wiki.gg', wiki({ sitename: 'Calamity Mod Wiki', search: ['Mod Calls', 'Configuration options'], mainpage: 'Calamity Mod Wiki' })]]);
    const found = await findWikiGG({ title: 'Calamity Mod' });
    assert(found, 'achou a wiki do jogo');
    assertEq(found.title, 'Calamity Mod Wiki', 'abre a página inicial da wiki, não "Mod Calls"');
});

test('wiki sem Fandom: a automação cai para o wiki.gg e registra a fonte certa', async () => {
    const steps = [];
    mockFetch([
        ['fandom.com/api.php', down(404)],
        ['wiki.gg/api.php', wiki({ sitename: 'Deep Rock Galactic Wiki', page: 'Deep Rock Galactic' })],
    ]);
    const found = await findHostedWiki({ title: 'Deep Rock Galactic' }, h => steps.push(h.label));
    assert(found, 'achou a wiki fora do Fandom');
    assertEq(found.src.api, 'https://deeprockgalactic.wiki.gg/api.php', 'fonte do wiki.gg');
    assertEq(found.title, 'Deep Rock Galactic', 'artigo do jogo');
    assertEq(steps.join(' > '), 'Fandom > wiki.gg', 'procura no Fandom antes de tentar o wiki.gg');
});

test('Fandom continua tendo prioridade quando as duas hospedagens têm a wiki', async () => {
    mockFetch([
        ['darkestdungeon.fandom.com', wiki({ sitename: 'Darkest Dungeon Wiki', search: ['Darkest Dungeon'] })],
        ['wiki.gg/api.php', wiki({ sitename: 'Darkest Dungeon Wiki', page: 'Darkest Dungeon' })],
    ]);
    const found = await findHostedWiki({ title: 'Darkest Dungeon' });
    assertEq(found.src.api, 'https://darkestdungeon.fandom.com/api.php', 'nada muda para quem já tinha Fandom');
});

test('wiki.gg: wiki de outro jogo no subdomínio não é vinculada (nome precisa bater)', async () => {
    mockFetch([['wiki.gg/api.php', wiki({ sitename: 'Minecraft Wiki', page: 'Terraria' })]]);
    assertEq(await findWikiGG({ title: 'Terraria' }), null, 'sitename diferente do slug é recusado');
});

test('wiki.gg: 401/404 (wiki privada ou inexistente) é ignorado sem quebrar', async () => {
    mockFetch([['wiki.gg/api.php', down(401)], ['fandom.com/api.php', down(404)]]);
    assertEq(await findWikiGG({ title: 'Hades' }), null, 'nenhuma wiki.gg acessível');
    assertEq(await findHostedWiki({ title: 'Hades' }), null, 'e a automação termina sem resultado, sem erro');
});

test('wiki.gg: a busca pelo título completo é usada quando o artigo não tem o nome exato', async () => {
    const seen = [];
    mockFetch([['wiki.gg/api.php', u => { seen.push(String(u)); return wiki({ sitename: "Baldur's Gate 3 Wiki", search: ["Baldur's Gate 3"] })(String(u)); }]]);
    const found = await findWikiGG({ title: "Baldur's Gate 3" });
    assert(found, 'achou a wiki.gg');
    const q = decodeURIComponent(seen.find(u => u.includes('list=search')).replace(/\+/g, ' '));
    assert(q.includes("srsearch=Baldur's Gate 3"), `busca pelo título completo (veio: ${q})`);
    assertEq(WIKI_HOSTS.map(h => h.label).join(','), 'Fandom,wiki.gg', 'as duas hospedagens na ordem da automação');
});

test('wiki.gg: toda chamada vai SEM Referer (o Referer dispara o desafio do Cloudflare)', async () => {
    // Regressão: o app rodando em http://127.0.0.1 mandava Referer e o wiki.gg
    // respondia 403 "Cf-Mitigated: challenge" — a wiki parecia inexistente.
    const opts = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u, o) => {
        opts.push(o || {});
        const u2 = String(u);
        const body = u2.includes('titles=')
            ? { query: { pages: [{ title: 'Moonstone Island' }] } }
            : { query: { general: { sitename: 'Moonstone Island Wiki', articlepath: '/wiki/$1', mainpage: 'Moonstone Island Wiki' } } };
        return { ok: true, status: 200, json: async () => body };
    };
    try {
        const found = await findWikiGG({ title: 'Moonstone Island' });
        assert(found, 'achou a wiki do Moonstone Island');
        assertEq(found.title, 'Moonstone Island', 'artigo do jogo');
        assert(opts.length >= 2, 'fez siteinfo e título exato');
        assert(opts.every(o => o.referrerPolicy === 'no-referrer'), 'nenhuma chamada leva Referer');
    } finally { globalThis.fetch = realFetch; }
});

test('Fandom: a descoberta antiga continua funcionando (nada regrediu)', async () => {
    mockFetch([['hades.fandom.com', wiki({ sitename: 'Hades Wiki', search: ['Hades', 'Hades (game)'] })]]);
    const found = await findFandomWiki({ title: 'Hades' });
    assertEq(found.src.api, 'https://hades.fandom.com/api.php', 'Fandom do jogo');
    assertEq(found.src.name, 'Hades Wiki', 'nome da wiki');
    assertEq(found.title, 'Hades', 'título escolhido pela busca');
});
