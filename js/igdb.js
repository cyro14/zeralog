// IGDB API (https://igdb.com): Internet Game Database - API gratuita para informações de jogos
// Para usar: registre-se em https://www.igdb.com/api-box e obtenha CLIENT_ID e CLIENT_SECRET
// A API usa OAuth2 - este módulo gerencia o token automaticamente

const STORAGE_KEY = 'zeralog_igdb_token';
const CLIENT_STORAGE_KEY = 'zeralog_igdb_client';

// Mapeamento de tipos de mídia IGDB para nossas formatações
const MEDIA_TYPES = {
    cover: 'cover',
    screenshot: 'screenshot',
    boxart: 'boxart',
    trailer: 'trailer'
};

// Cache de tokens - evita renovações desnecessárias
let tokenCache = {
    accessToken: null,
    expiresAt: 0
};

export function getClientId() {
    try { 
        return localStorage.getItem(CLIENT_STORAGE_KEY) || ''; 
    } catch (e) { return ''; }
}

export function setClientId(id) {
    try { 
        localStorage.setItem(CLIENT_STORAGE_KEY, id.trim()); 
    } catch (e) {}
}

export function getAccessToken() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
}

export function setAccessToken(token, expiresIn = 3599) {
    try { 
        localStorage.setItem(STORAGE_KEY, token);
        // Define expiração (token IGDB dura ~1 hora)
        tokenCache.expiresAt = Date.now() + (expiresIn * 1000);
        tokenCache.accessToken = token;
    } catch (e) {}
}

export function hasValidToken() {
    try {
        if (!tokenCache.accessToken) return false;
        return Date.now() < tokenCache.expiresAt - 60000; // 1 min de margem
    } catch (e) { return false; }
}

// Requisição para a API IGDB
async function igdbApi(path, body = {}, options = {}) {
    const clientId = getClientId();
    if (!clientId) throw new Error('ID da cliente IGDB não configurado. Vá em Settings → Capas e Busca → IGDB Client ID.');
    
    // Verifica token válido
    if (!hasValidToken()) {
        // Tenta renovar token usando client secret (será implementado ou o usuário fornece token pré-obtido)
        // Para simplicidade, exige que o usuário forneça um token de acesso Bearer
        const accessToken = getAccessToken();
        if (!accessToken) throw new Error('Token de acesso IGDB não configurado. Gere um em https://www.igdb.com/api-box');
        
        // Verifica se expirou
        if (Date.now() >= tokenCache.expiresAt - 60000) {
            throw new Error('Token IGDB expirado. Gere um novo em https://www.igdb.com/api-box');
        }
    }
    
    const url = `https://api.igdb.com/v4${path}`;
    const opts = {
        method: 'POST',
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${getAccessToken()}`,
            'Content-Type': 'application/json'
        },
        ...options
    };
    
    const bodyJson = JSON.stringify(body);
    
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    
    try {
        const res = await fetch(url, { ...opts, body: bodyJson, signal: ctrl.signal });
        clearTimeout(timer);
        
        if (res.status === 401) {
            // Token inválido/expirado
            const errData = await res.json().catch(() => ({}));
            throw new Error(`IGDB API: ${res.status} - ${errData.error || 'Token inválido ou expirado. Gere um novo token em https://www.igdb.com/api-box'}`);
        }
        
        if (!res.ok) {
            const errTxt = await res.text().catch(() => 'unknown error');
            throw new Error(`IGDB API ${res.status}: ${errTxt}`);
        }
        
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        if (e && e.message && e.message.includes('Token inválido')) throw e;
        throw e || new Error('Não consegui falar com a IGDB API.');
    }
}

// Busca de jogos pelo nome
export async function searchIGDBGames(query, limit = 5) {
    if (!query || !query.trim()) return [];
    try {
        const data = await igdbApi('', 
            { search: query.trim(), fields: 'id,name,cover,first_release_date,slug', limit: limit || 5 }
        );
        return data || [];
    } catch (e) {
        console.error('Erro ao buscar jogos IGDB:', e);
        return [];
    }
}

// Busca capas/mídias de um jogo
export async function fetchIGDBCovers(gameId, options = {}) {
    if (!gameId) return [];
    
    const fields = options.fields || 'url,image_id,checksum,cover,game,region,side,type';
    const limit = options.limit || 5;
    
    try {
        const data = await igdbApi('/games', 
            { 
                fields: 'id,cover', 
                limit: 1 
            }, 
            { body: { ids: [gameId] } }
        );
        
        // Se temos o jogo com capa
        if (data && data.length > 0 && data[0].cover) {
            const coverId = data[0].cover;
            return await fetchIGDBMedia(coverId, limit);
        }
        
        // Busca direta de mídia pela ID da capa
        return await fetchIGDBMediaDirect(coverId || 0, limit);
    } catch (e) {
        console.error('Erro ao buscar capas IGDB:', e);
        return [];
    }
}

// Busca mídia direta (capas, screenshots)
export async function fetchIGDBMedia(mediaId, limit = 5) {
    if (!mediaId) return [];
    
    try {
        const data = await igdbApi('/media', 
            { 
                filter: { id: mediaId },
                fields: 'url,image_id,checksum,cover,game,region,side,type',
                limit: 1
            }
        );
        
        if (!data || !data.length) return [];
        
        const media = data[0];
        const url = media.url || `https://images.igdb.com/igdb/image/upload/t_cover_big/${media.image_id}.jpg`;
        
        // Determina se é vertical baseado na aspect ratio
        // IGDB não fornece dimensões diretas na mídia, usamos o tipo como indicação
        const isVertical = media.type === 'cover' || (!media.type && url.includes('cover'));
        
        return [{
            url: url,
            previewUrl: url,
            source: 'IGDB',
            label: `IGDB Cover`,
            vertical: isVertical,
            width: media.width,
            height: media.height
        }];
    } catch (e) {
        console.error('Erro ao buscar mídia IGDB:', e);
        return [];
    }
}

// Busca direta de mídia sem precisar de ID de jogo
export async function fetchIGDBMediaDirect(imageId, limit = 5) {
    if (!imageId) return [];
    
    try {
        const data = await igdbApi('/media', 
            { 
                filter: { image_id: imageId },
                fields: 'url,image_id,checksum,cover,game,region,side,type',
                limit: limit
            }
        );
        
        if (!data || !data.length) return [];
        
        return data.map(media => {
            const url = media.url || `https://images.igdb.com/igdb/image/upload/t_cover_big/${media.image_id}.jpg`;
            const isVertical = media.type === 'cover' || (!media.type && url.includes('cover'));
            
            return {
                url: url,
                previewUrl: url,
                source: 'IGDB',
                label: `IGDB Cover`,
                vertical: isVertical
            };
        });
    } catch (e) {
        console.error('Erro ao buscar mídia IGDB direta:', e);
        return [];
    }
}

// Busca informações completas de um jogo
export async function fetchIGDBGame(gameName) {
    if (!gameName) return null;
    
    try {
        const data = await igdbApi('', 
            { search: gameName, fields: 'id,name,cover,first_release_date,slug,genres,players,rating', limit: 1 }
        );
        
        if (data && data.length > 0) {
            return {
                id: data[0].id,
                name: data[0].name,
                coverId: data[0].cover || null,
                releaseDate: data[0].first_release_date,
                slug: data[0].slug
            };
        }
        return null;
    } catch (e) {
        console.error('Erro ao buscar jogo IGDB:', e);
        return null;
    }
}