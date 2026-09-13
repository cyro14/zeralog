// Ícones e dados padrão
export const defaultPlatformsIcons = {
    'PC': '💻',
    'Nintendo': '🍄',
    'Playstation': '<span style="font-weight:900; color:#003791; font-family:sans-serif; letter-spacing:-1px;">PS</span>',
    'Xbox': '<svg viewBox="0 0 100 100" style="width:1.2em; height:1.2em; min-width:1.2em; flex-shrink:0; vertical-align:middle;"><circle cx="50" cy="50" r="45" fill="#107C10"/><path d="M30 30 L70 70 M70 30 L30 70" stroke="#fff" stroke-width="12" stroke-linecap="round"/></svg>',
    'Mobile': '📱'
};

export const homeSortLabels = { 'manual': '🖐️ Manual', 'az': '🔤 A-Z', 'time': '⏱️ Tempo', 'portable': '🎒 Portátil' };
export const sortLabels = { 'date': '📅 Data', 'rating': '🌟 Nota', 'time': '⏱️ Tempo', 'portable': '🎒 Portátil' };

export const defaultData = {
    settings: { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc' }, 
    collapsedCats: [], 
    categories: [ { id: 'c1', name: '🃏 Cartas e Estratégia' }, { id: 'c2', name: '🍄 Plataforma 3D' } ],
    platforms: [
        { name: 'PC', icon: defaultPlatformsIcons['PC'] },
        { name: 'Nintendo', icon: defaultPlatformsIcons['Nintendo'] },
        { name: 'Playstation', icon: defaultPlatformsIcons['Playstation'] },
        { name: 'Xbox', icon: defaultPlatformsIcons['Xbox'] },
        { name: 'Mobile', icon: defaultPlatformsIcons['Mobile'] }
    ],
    games: [],
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

appData.platforms.forEach(p => {
    if (p.icon && p.icon.startsWith('<svg') && !p.icon.includes('circle cx="50"')) {
        const defaultKey = Object.keys(defaultPlatformsIcons).find(k => k.toLowerCase() === p.name.toLowerCase());
        if (defaultKey) p.icon = defaultPlatformsIcons[defaultKey];
    }
});

// A função saveData agora aceita um callback opcional para renderizar a UI sem gerar dependência circular
export function saveData(triggerRenderCallback = null) { 
    localStorage.setItem('myBacklogData', JSON.stringify(appData)); 
    if(triggerRenderCallback) triggerRenderCallback(); 
}
