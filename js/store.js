import { platformIcons } from './icons.js';

// Ícones e dados padrão
export const defaultPlatformsIcons = platformIcons;

export const homeSortLabels = { 'manual': 'Manual', 'az': 'A-Z', 'time': 'Tempo', 'portable': 'Portátil' };
export const sortLabels = { 'date': 'Data', 'rating': 'Nota', 'time': 'Tempo', 'portable': 'Portátil' };

export const defaultData = {
    settings: { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc', finishedView: 'list', timelineDir: 'desc', homeView: 'list' }, 
    collapsedCats: [], 
    categories: [ { id: 'c1', name: 'Cartas e Estratégia' }, { id: 'c2', name: 'Plataforma 3D' } ],
    platforms: [
        { name: 'PC', icon: defaultPlatformsIcons['PC'] },
        { name: 'Nintendo', icon: defaultPlatformsIcons['Nintendo'] },
        { name: 'Playstation', icon: defaultPlatformsIcons['Playstation'] },
        { name: 'Xbox', icon: defaultPlatformsIcons['Xbox'] },
        { name: 'Mobile', icon: defaultPlatformsIcons['Mobile'] }
    ],
    games: [],
    wikis: [],
    wishlist: [],
    counters: { sessions: 0, sessionMinutes: 0, wishMoved: 0 },
    achSeeded: false,
    unlockedAchievements: [] 
};

export let appData = JSON.parse(localStorage.getItem('myBacklogData')) || defaultData;
export let backupData = null;

// Função para atualizar a referência global em caso de restauração de backup
export function setAppData(newData) { appData = newData; }
export function setBackupData(data) { backupData = data; }

// Verificações de integridade dos dados
if (!appData.settings) appData.settings = { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc' };
if (!appData.settings.finishedSort) appData.settings.finishedSort = 'date';
if (!appData.settings.finishedSortDir) appData.settings.finishedSortDir = 'desc';
if (!appData.settings.homeSortDir) appData.settings.homeSortDir = 'asc';
if (!appData.settings.sort) appData.settings.sort = 'manual';
if (!appData.collapsedCats) appData.collapsedCats = [];
if (!appData.platforms) appData.platforms = defaultData.platforms;
if (!appData.unlockedAchievements) appData.unlockedAchievements = [];
if (!appData.wikis) appData.wikis = [];
if (!appData.wishlist) appData.wishlist = [];
appData.counters = { sessions: 0, sessionMinutes: 0, wishMoved: 0, ...(appData.counters || {}) };
appData.settings = { finishedView: 'list', timelineDir: 'desc', ...appData.settings };

// Troca emojis e ícones antigos pelos ícones SVG (mantém imagens personalizadas)
export function migrateData(data) {
    if (!data.wikis) data.wikis = [];
    if (!data.wishlist) data.wishlist = [];
    data.counters = { sessions: 0, sessionMinutes: 0, wishMoved: 0, ...(data.counters || {}) };
    data.settings = { finishedView: 'list', timelineDir: 'desc', ...(data.settings || {}) };
    (data.platforms || []).forEach(p => {
        const cur = String(p.icon || '');
        if (cur.startsWith('<img') || cur.includes('class="ic')) return;
        const key = Object.keys(defaultPlatformsIcons).find(k => k !== 'default' && k.toLowerCase() === String(p.name).toLowerCase());
        p.icon = key ? defaultPlatformsIcons[key] : defaultPlatformsIcons.default;
    });
    // Categorias padrão antigas tinham emoji no nome
    const renamed = { '\u{1F0CF} Cartas e Estratégia': 'Cartas e Estratégia', '\u{1F344} Plataforma 3D': 'Plataforma 3D' };
    (data.categories || []).forEach(c => { if (renamed[c.name]) c.name = renamed[c.name]; });
    return data;
}
migrateData(appData);

// A função saveData agora aceita um callback opcional para renderizar a UI sem gerar dependência circular
export function saveData(triggerRenderCallback = null) { 
    localStorage.setItem('myBacklogData', JSON.stringify(appData)); 
    if(triggerRenderCallback) triggerRenderCallback(); 
}
