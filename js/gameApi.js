// Busca automática de dados de jogos via RAWG (https://rawg.io/apidocs).

const DEFAULT_KEY = 'ae08037aa9fb40a48b12090819cedb07';
const KEY_STORAGE = 'zeralog_rawg_key';

// A chave pode ser trocada em Configurações, sem mexer no código
export const getRawgKey = () => { try { return (localStorage.getItem(KEY_STORAGE) || '').trim() || DEFAULT_KEY; } catch (e) { return DEFAULT_KEY; } };
export const setRawgKey = k => { try { k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE); } catch (e) {} };
export const hasCustomRawgKey = () => { try { return !!localStorage.getItem(KEY_STORAGE); } catch (e) { return false; } };

const GENRES_PT = {
    'Action': 'Ação', 'Indie': 'Indie', 'Adventure': 'Aventura', 'RPG': 'RPG',
    'Strategy': 'Estratégia', 'Shooter': 'Tiro', 'Casual': 'Casual', 'Simulation': 'Simulação',
    'Puzzle': 'Quebra-cabeça', 'Arcade': 'Arcade', 'Platformer': 'Plataforma', 'Racing': 'Corrida',
    'Massively Multiplayer': 'Multiplayer massivo', 'Sports': 'Esportes', 'Fighting': 'Luta',
    'Family': 'Família', 'Board Games': 'Jogos de tabuleiro', 'Educational': 'Educacional', 'Card': 'Cartas'
};

// Escapa texto vindo de fora antes de usar em innerHTML
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A RAWG serve versões redimensionadas das imagens (mais leve)
export function resizeUrl(url, width) {
    return url && url.includes('/media/games/') ? url.replace('/media/games/', `/media/resize/${width}/-/games/`) : url;
}

function normalize(g) {
    return {
        rawgId: g.id,
        title: g.name,
        released: g.released || '',                       // AAAA-MM-DD
        genres: (g.genres || []).map(x => GENRES_PT[x.name] || x.name),
        metacritic: g.metacritic || null,
        playtime: g.playtime || 0,                        // média de horas dos usuários da RAWG
        image: g.background_image || null,
        description: (g.description_raw || '').trim()
    };
}

async function rawg(path, params = {}) {
    const qs = new URLSearchParams({ ...params, key: getRawgKey() });
    let res;
    try { res = await fetch(`https://api.rawg.io/api${path}?${qs}`); }
    catch (e) { throw Object.assign(new Error('network'), { kind: 'network' }); }
    if (!res.ok) throw Object.assign(new Error(`RAWG ${res.status}`), { kind: 'http', status: res.status });
    return res.json();
}

// Mensagem clara para o usuário, conforme o tipo de falha
export function describeError(err) {
    if (err && err.kind === 'http') {
        if (err.status === 401 || err.status === 403) return 'A chave da RAWG foi recusada (inválida ou expirada). Gere uma chave grátis em rawg.io/apidocs e cole em Configurações.';
        if (err.status === 429) return 'Limite de buscas da chave da RAWG atingido. Use sua própria chave grátis (rawg.io/apidocs) em Configurações.';
        return `A RAWG respondeu com erro ${err.status}. Tente de novo em instantes.`;
    }
    return 'Não consegui falar com a RAWG. Verifique a internet ou se algum bloqueador de anúncios está barrando api.rawg.io.';
}

export async function searchGames(query) {
    const data = await rawg('/games', { search: query, page_size: 6 });
    return (data.results || []).map(normalize);
}

// A busca não traz a descrição; ela vem do endpoint de detalhes
export async function getGameDetails(id) {
    return normalize(await rawg(`/games/${id}`));
}

async function blobToSmallJpeg(blob, maxW = 400) {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxW / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
}

// Baixa a capa e guarda como base64 pequeno (o localStorage tem ~5MB de limite)
export async function coverToDataURL(url) {
    const tries = [resizeUrl(url, 420), url, 'https://corsproxy.io/?url=' + encodeURIComponent(url)];
    for (const u of tries) {
        try {
            const res = await fetch(u);
            if (res.ok) return await blobToSmallJpeg(await res.blob());
        } catch (e) { /* tenta a próxima opção */ }
    }
    return url; // último recurso: guarda o link (aparece na lista, mas pode falhar no card de compartilhar)
}
