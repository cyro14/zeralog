// Steam Store API como SEGUNDA fonte de dados do ZeraLog (js/gameApi.js orquestra).
//
// Por quê: a RAWG (fonte primária) vive instável — em nov/2025 ficou dias fora do ar
// (522 do Cloudflare). A loja da Steam é grátis, não exige chave, responde em
// português (l=brazilian) e traz quase tudo que o app usa: nome, descrição, data de
// lançamento, gêneros, desenvolvedora/publicadora, screenshots e até a nota do
// Metacritic. A busca da loja (storesearch) + o detalhe (appdetails) cobrem o fluxo
// de cadastro/busca; arte de capa continua no js/covers.js (que já monta as URLs do
// CDN da Steam sozinho).
//
// CORS: store.steampowered.com não manda Access-Control-Allow-Origin, então TUDO
// passa primeiro pelo Worker do projeto (steam-proxy/worker.js — o host já está na
// allowlist dele). Depois tentamos direto (útil nos testes no Node) e o proxy
// público codetabs. O allorigins saiu: estava respondendo 522 (fora do ar).

const WORKER = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';

// GET JSON na loja da Steam pela fila de rotas. Devolve o objeto ou null — a Steam
// é uma fonte de FALLBACK: qualquer falha vira "não deu", sem estourar no app.
async function steamJson(url, { timeout = 12000 } = {}) {
    const targets = [
        `${WORKER}?url=${encodeURIComponent(url)}`,   // o Worker do projeto: CORS de verdade (host na allowlist)
        url,                                          // direto: funciona no Node/testes; no navegador a loja não manda CORS
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];
    for (const t of targets) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(t, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) continue;
            return await res.json();
        } catch (e) { clearTimeout(timer); /* próxima rota */ }
    }
    return null;
}

// A Steam devolve a data em TEXTO localizado ("19 de janeiro de 2022" com l=brazilian,
// "Dec 19, 2023" com l=english) — e o app guarda AAAA-MM-DD. Converte o que der;
// datas vagas ("Coming soon", "Q1 2024", só o ano) viram vazio (o jogo fica como tba).
const MONTHS = {
    janeiro: 1, jan: 1, january: 1,
    fevereiro: 2, fev: 2, february: 2, feb: 2,
    marco: 3, mar: 3, march: 3,
    abril: 4, abr: 4, april: 4, apr: 4,
    maio: 5, mai: 5, may: 5,
    junho: 6, jun: 6, june: 6,
    julho: 7, jul: 7, july: 7,
    agosto: 8, ago: 8, august: 8, aug: 8,
    setembro: 9, set: 9, sept: 9, sep: 9, september: 9,
    outubro: 10, out: 10, oct: 10, october: 10,
    novembro: 11, nov: 11, november: 11,
    dezembro: 12, dez: 12, dec: 12, december: 12
};
export function steamDateToIso(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const low = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/coming soon|em breve|tba|to be announced|por anunciar/.test(low)) return '';
    const mk = Object.keys(MONTHS).find(k => new RegExp('(^|[^a-z])' + k + '(\\.?([^a-z]|$))').test(low));
    const ym = low.match(/\b(19[89]\d|20\d{2})\b/);
    const day = ((low.match(/\b\d{1,2}\b/g) || []).map(Number).find(n => n >= 1 && n <= 31)) || 0;
    if (!mk || !ym || !day) return '';
    return `${ym[1]}-${String(MONTHS[mk]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Entidades HTML da loja, na ordem certa (& por último, para não dobrar decodificação).
// O "&" dos padrões é montado por charCode: um literal de entidade no código-fonte
// corria o risco de ser decodificado no caminho até o arquivo.
const AMP = String.fromCharCode(38);
const ENTITIES = [
    [new RegExp(AMP + 'lt;', 'g'), '<'],
    [new RegExp(AMP + 'gt;', 'g'), '>'],
    [new RegExp(AMP + 'quot;', 'g'), '"'],
    [new RegExp(AMP + '#0?39;', 'g'), "'"],
    [new RegExp(AMP + 'nbsp;', 'g'), ' '],
    [new RegExp(AMP + 'amp;', 'g'), AMP]
];

// A descrição da loja vem com tags e entidades; o app usa texto puro (textarea)
export function textFromHtml(s) {
    let t = String(s || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, ' ');
    for (const [re, to] of ENTITIES) t = t.replace(re, to);
    return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Item da BUSCA da loja (storesearch): só o essencial — a ficha completa vem do
// appdetails (detailsForGame no gameApi.js hidrata quando o usuário escolhe).
export function mapStoreItem(it) {
    const metascore = parseInt(it && it.metascore, 10);
    return {
        rawgId: null,
        steamAppId: (it && it.id) || null,
        title: (it && it.name) || '',
        released: '',
        tba: false,
        genres: [],
        metacritic: Number.isFinite(metascore) ? metascore : null,
        playtime: 0,
        image: (it && it.tiny_image) || null,
        imageExtra: null,
        description: '',
        developers: [],
        publishers: [],
        screenshots: []
    };
}

// Ficha completa (appdetails), no MESMO formato do normalize() da RAWG (js/gameApi.js)
export function mapAppDetails(data, requestedId) {
    const d = data || {};
    const iso = steamDateToIso(d.release_date && d.release_date.date);
    const coming = !!(d.release_date && d.release_date.coming_soon);
    return {
        rawgId: null,
        steamAppId: d.steam_appid || requestedId || null,
        title: d.name || '',
        released: iso,
        tba: coming && !iso,
        genres: (d.genres || []).map(x => x.description).filter(Boolean),
        metacritic: (d.metacritic && d.metacritic.score) || null,
        playtime: 0,
        image: d.header_image || null,
        imageExtra: d.background_raw || null,
        description: textFromHtml(d.short_description) || textFromHtml(d.detailed_description),
        developers: (d.developers || []).slice(0, 8),
        publishers: (d.publishers || []).slice(0, 8),
        screenshots: (d.screenshots || []).map(x => x.path_full).filter(Boolean)
    };
}

// Busca na loja: devolve no formato da busca da RAWG (o bestRawgMatch do gameApi.js
// casa os títulos da mesma forma que casa os das lojas).
export async function steamSearch(title, limit = 6) {
    const q = String(title || '').trim();
    if (!q) return [];
    const js = await steamJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=br&l=brazilian`);
    return (((js && js.items) || []))
        .filter(i => i && i.type === 'app' && i.id)
        .slice(0, Math.max(1, Number(limit) || 6))
        .map(mapStoreItem);
}

// Detalhes pelo appid: devolve a ficha mapeada ou null (não encontrado / loja fora)
export async function steamDetails(appId) {
    const id = String(appId || '').trim();
    if (!/^\d+$/.test(id)) return null;
    const js = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=br&l=brazilian`);
    const entry = js && js[id];
    if (!entry || !entry.success || !entry.data) return null;
    return mapAppDetails(entry.data, id);
}
