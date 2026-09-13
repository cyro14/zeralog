if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('ZeraLog PWA ativado!', reg);
        }).catch(err => console.log('Erro no PWA: ', err));
    });
}

// Ícones super simples, não deformáveis e amigáveis ao usuário
const defaultPlatformsIcons = {
    'PC': '💻',
    'Nintendo': '🍄',
    'Playstation': '<span style="font-weight:900; color:#003791; font-family:sans-serif; letter-spacing:-1px;">PS</span>',
    'Xbox': '<svg viewBox="0 0 100 100" style="width:1.2em; height:1.2em; min-width:1.2em; flex-shrink:0; vertical-align:middle;"><circle cx="50" cy="50" r="45" fill="#107C10"/><path d="M30 30 L70 70 M70 30 L30 70" stroke="#fff" stroke-width="12" stroke-linecap="round"/></svg>',
    'Mobile': '📱'
};

const homeSortLabels = {
    'manual': '🖐️ Manual',
    'az': '🔤 A-Z',
    'time': '⏱️ Tempo',
    'portable': '🎒 Portátil'
};

const sortLabels = {
    'date': '📅 Data',
    'rating': '🌟 Nota',
    'time': '⏱️ Tempo',
    'portable': '🎒 Portátil'
};

const defaultData = {
    settings: { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc' }, collapsedCats:[], 
    categories:[ { id: 'c1', name: '🃏 Cartas e Estratégia' }, { id: 'c2', name: '🍄 Plataforma 3D' } ],
    platforms:[
        { name: 'PC', icon: defaultPlatformsIcons['PC'] },
        { name: 'Nintendo', icon: defaultPlatformsIcons['Nintendo'] },
        { name: 'Playstation', icon: defaultPlatformsIcons['Playstation'] },
        { name: 'Xbox', icon: defaultPlatformsIcons['Xbox'] },
        { name: 'Mobile', icon: defaultPlatformsIcons['Mobile'] }
    ],
    games:[],
    unlockedAchievements:[] 
};

let appData = JSON.parse(localStorage.getItem('myBacklogData')) || defaultData;

if (!appData.settings) appData.settings = { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc' };
if (!appData.settings.finishedSort) appData.settings.finishedSort = 'date';
if (!appData.settings.finishedSortDir) appData.settings.finishedSortDir = 'desc';
if (!appData.settings.homeSortDir) appData.settings.homeSortDir = 'asc';
if (!appData.settings.sort) appData.settings.sort = 'manual';
if (!appData.collapsedCats) appData.collapsedCats =[];
if (!appData.platforms) appData.platforms = defaultData.platforms;
if (!appData.unlockedAchievements) appData.unlockedAchievements =[];

// Limpa apenas os ícones SVG bugados antigos do seu cache, mantendo as edições próprias intocadas!
appData.platforms.forEach(p => {
    if (p.icon && p.icon.startsWith('<svg') && !p.icon.includes('circle cx="50"')) {
        const defaultKey = Object.keys(defaultPlatformsIcons).find(k => k.toLowerCase() === p.name.toLowerCase());
        if (defaultKey) p.icon = defaultPlatformsIcons[defaultKey];
    }
});

let backupData = null; let toastTimeout = null; let chartInstance = null; let currentRouletteId = null;
let currentPlatformFilter = 'All'; let filterPortableOnly = false; let tempPlatformIcon = '';
let editPlatformIndex = -1;

if(appData.settings.compact) document.body.classList.add('compact-mode');

// FUNÇÃO DE EXTRAÇÃO DE COR DA CAPA
function getAverageRGB(imgSrc, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50; 
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);

        try {
            const data = ctx.getImageData(0, 0, 50, 50).data;
            let r = 0, g = 0, b = 0;
            let count = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i+3] < 255) continue; 
                r += data[i];
                g += data[i+1];
                b += data[i+2];
                count++;
            }

            if (count === 0) {
                callback({ r: 76, g: 175, b: 80 }); 
                return;
            }

            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            callback({ r, g, b });
        } catch (e) {
            callback({ r: 76, g: 175, b: 80 });
        }
    };
    img.onerror = () => callback({ r: 76, g: 175, b: 80 });
    img.src = imgSrc;
}

function notifyAchievement(name) {
    const el = document.getElementById('achievement-notif');
    document.getElementById('ach-notif-name').innerText = name;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); }, 4000);
}

function checkNewAchievements() {
    const finishedGames = appData.games.filter(g => g.state === 'finished');
    const count = finishedGames.length;
    const count100 = finishedGames.filter(g => g.is100).length;
    
    const checks =[
        { id: 'ach-1', condition: count >= 1, name: 'Primeiro Passo' },
        { id: 'ach-5', condition: count >= 5, name: 'Embalado' },
        { id: 'ach-10', condition: count >= 10, name: 'Mestre do Backlog' },
        { id: 'ach-perfectionist', condition: count100 >= 1, name: 'Perfeccionista' },
        { id: 'ach-legend', condition: count100 >= 5, name: 'Lendário' }
    ];

    checks.forEach(ach => {
        if (ach.condition && !appData.unlockedAchievements.includes(ach.id)) {
            appData.unlockedAchievements.push(ach.id);
            notifyAchievement(ach.name);
            saveData(false); 
        }
    });
}

function checkWelcome() {
    if (!localStorage.getItem('zeralog_welcomed')) document.getElementById('modal-welcome').showModal();
}
function closeWelcome() { localStorage.setItem('zeralog_welcomed', 'true'); document.getElementById('modal-welcome').close(); }

function saveStateForUndo() { backupData = JSON.stringify(appData); }
function triggerToast(message) {
    const toast = document.getElementById('undo-toast'); document.getElementById('undo-message').innerText = message;
    toast.classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 6000);
}
function undoAction() { if (backupData) { appData = JSON.parse(backupData); document.body.classList.toggle('compact-mode', appData.settings.compact); saveData(true); document.getElementById('undo-toast').classList.remove('show'); backupData = null; filterGames(); } }
function saveData(triggerRender = true) { 
    localStorage.setItem('myBacklogData', JSON.stringify(appData)); 
    if(triggerRender) render(); 
    checkNewAchievements(); 
}

function openBackupModal() { document.getElementById('modal-backup-info').showModal(); }
function exportBackup() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData)); const dlAnchor = document.createElement('a'); dlAnchor.setAttribute("href", dataStr); dlAnchor.setAttribute("download", "ZeraLog_Backup_" + new Date().toISOString().slice(0,10) + ".json"); document.body.appendChild(dlAnchor); dlAnchor.click(); dlAnchor.remove(); closeModal('modal-backup-info'); triggerToast('Backup Salvo!'); }

function importBackup(event) { 
    const file = event.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        try { 
            const imported = JSON.parse(e.target.result); 
            if (imported && imported.games) { 
                saveStateForUndo(); 
                appData = imported; 
                if (!appData.settings) appData.settings = { sort: 'manual', compact: false, finishedSortDir: 'desc', homeSortDir: 'asc' }; 
                if (!appData.settings.homeSortDir) appData.settings.homeSortDir = 'asc';
                if (!appData.collapsedCats) appData.collapsedCats =[]; 
                
                if (!appData.platforms) appData.platforms = defaultData.platforms;

                document.body.classList.toggle('compact-mode', appData.settings.compact); 
                saveData(); 
                closeModal('modal-backup-info'); 
                triggerToast('Restaurado!'); 
            } 
        } catch (err) { alert("Erro ao ler o arquivo."); } 
        event.target.value = ''; 
    }; 
    reader.readAsText(file); 
}

function openSettings() { 
    document.getElementById('theme-selector').value = localStorage.getItem('zeralog_theme') || 'dark'; 
    document.getElementById('compact-toggle').checked = appData.settings.compact; 
    
    cancelEditPlatform(); 
    renderPlatformAdmin();
    document.getElementById('modal-settings').showModal(); 
}

function changeTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('zeralog_theme', theme); }
function toggleCompact(val) { appData.settings.compact = val; document.body.classList.toggle('compact-mode', val); saveData(false); }
function openFactoryReset() { document.getElementById('reset-confirm-input').value = ''; document.getElementById('modal-factory-reset').showModal(); }
function confirmFactoryReset() { if (document.getElementById('reset-confirm-input').value === 'APAGAR') { saveStateForUndo(); appData = { settings: { sort: 'manual', compact: false, finishedSortDir: 'desc', homeSortDir: 'asc' }, collapsedCats:[], categories:[], platforms: defaultData.platforms, games:[], unlockedAchievements:[] }; saveData(); closeModal('modal-factory-reset'); closeModal('modal-settings'); localStorage.removeItem('zeralog_welcomed'); triggerToast('Apagado.'); setTimeout(checkWelcome, 500); } else { alert('Digite APAGAR'); } }

function renderPlatformAdmin() {
    const list = document.getElementById('platforms-list-admin');
    list.innerHTML = '';
    appData.platforms.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'platform-list-item';
        item.innerHTML = `
            <span style="display:flex; align-items:center; gap:8px;">${p.icon} <span>${p.name}</span></span>
            <div style="display:flex; gap:5px;">
                <button class="btn-icon" onclick="editPlatform(${index})" title="Editar">✏️</button>
                <button class="btn-icon btn-delete" onclick="removePlatform(${index})" title="Remover">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function previewPlatformIcon(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            tempPlatformIcon = `<img src="${e.target.result}" style="width: 1.2em; height: 1.2em; vertical-align: middle; border-radius: 4px; object-fit: cover; flex-shrink: 0;">`;
            document.getElementById('new-platform-icon-preview').innerHTML = tempPlatformIcon;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function searchPlatformIconOnGoogle() {
    const name = document.getElementById('new-platform-name').value;
    const query = name ? `${name} logo icon transparent png` : 'video game console platform logo icon transparent png';
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&tbs=ic:trans`, '_blank');
}

function editPlatform(index) {
    editPlatformIndex = index;
    const p = appData.platforms[index];
    document.getElementById('new-platform-name').value = p.name;
    tempPlatformIcon = p.icon;
    document.getElementById('new-platform-icon-preview').innerHTML = p.icon;
    document.getElementById('btn-save-platform').innerText = 'Salvar';
    document.getElementById('btn-cancel-platform').style.display = 'inline-block';
}

function cancelEditPlatform() {
    editPlatformIndex = -1;
    document.getElementById('new-platform-name').value = '';
    tempPlatformIcon = '';
    document.getElementById('new-platform-icon-preview').innerHTML = '🎮';
    document.getElementById('btn-save-platform').innerText = 'Add';
    document.getElementById('btn-cancel-platform').style.display = 'none';
}

function savePlatform() {
    const icon = tempPlatformIcon || '🎮';
    const name = document.getElementById('new-platform-name').value;
    if(!name) return;
    
    saveStateForUndo();
    if (editPlatformIndex >= 0) {
        const oldName = appData.platforms[editPlatformIndex].name;
        appData.platforms[editPlatformIndex] = { name, icon };
        
        if (oldName !== name) {
            appData.games.forEach(g => {
                if (g.platform === oldName) g.platform = name;
            });
        }
    } else {
        appData.platforms.push({ name, icon });
    }
    
    cancelEditPlatform();
    renderPlatformAdmin();
    saveData();
}

function removePlatform(index) {
    if(confirm("Remover esta plataforma? Jogos nela continuarão existindo, mas sem o ícone correto.")) {
        saveStateForUndo();
        appData.platforms.splice(index, 1);
        renderPlatformAdmin();
        saveData();
    }
}

function moveCategory(catId, direction) {
    const index = appData.categories.findIndex(c => c.id === catId);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < appData.categories.length) {
        saveStateForUndo();
        const temp = appData.categories[index];
        appData.categories[index] = appData.categories[newIndex];
        appData.categories[newIndex] = temp;
        saveData();
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`btn-tab-${tabId}`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if(tabId === 'stats') updateStatsAndCharts();
    else filterGames();
}

function setPlatformFilter(platform, el) {
    currentPlatformFilter = platform;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    filterGames();
    if (document.getElementById('tab-stats').classList.contains('active')) {
        updateStatsAndCharts();
    }
}

function togglePortableFilter() {
    filterPortableOnly = !filterPortableOnly;
    render();
}

function filterGames() {
    const term = document.getElementById('search-bar').value.toLowerCase();
    document.querySelectorAll('.category').forEach(cat => {
        let hasVisibleGames = false;
        cat.querySelectorAll('.game-item').forEach(item => {
            const titleMatch = item.querySelector('.game-title').innerText.toLowerCase().includes(term);
            const platformMatch = currentPlatformFilter === 'All' || item.dataset.platform === currentPlatformFilter;
            const portableMatch = !filterPortableOnly || item.dataset.portable === 'true';
            
            if (titleMatch && platformMatch && portableMatch) { 
                item.style.display = 'flex'; 
                hasVisibleGames = true; 
            } else { 
                item.style.display = 'none'; 
            }
        });
        if (term !== '' || currentPlatformFilter !== 'All' || filterPortableOnly) { 
            cat.style.display = hasVisibleGames ? 'block' : 'none'; 
        } else { 
            if (cat.id === 'playing-category') cat.style.display = cat.querySelectorAll('.game-item').length > 0 ? 'block' : 'none'; 
            else cat.style.display = 'block'; 
        }
    });
}

function toggleCollapse(id, event) { if(event && event.target.closest('button')) return; const idx = appData.collapsedCats.indexOf(id); if (idx > -1) appData.collapsedCats.splice(idx, 1); else appData.collapsedCats.push(id); const catDiv = document.getElementById(id); if(catDiv) catDiv.classList.toggle('collapsed'); saveData(false); }

function quickSearch(site) {
    const title = document.getElementById('game-title').value;
    if(!title) return alert('Digite o nome do jogo primeiro!');
    if(site === 'hltb') window.open(`https://howlongtobeat.com/?q=${encodeURIComponent(title)}`, '_blank');
    if(site === 'meta') window.open(`https://www.metacritic.com/search/${encodeURIComponent(title)}/`, '_blank');
}

function spinRoulette() {
    const pool = appData.games.filter(g => g.state !== 'finished');
    if(pool.length === 0) return alert('Seu backlog está vazio! Adicione mais jogos.');
    const winner = pool[Math.floor(Math.random() * pool.length)];
    currentRouletteId = winner.id;
    document.getElementById('roulette-game-name').innerText = winner.title;
    document.getElementById('modal-roulette').showModal();
}
function acceptRoulette() {
    closeModal('modal-roulette');
    toggleState(currentRouletteId, 'playing');
}

function saveGame() {
    const gameId = document.getElementById('edit-game-id').value;
    const catId = document.getElementById('game-cat-id').value;
    const title = document.getElementById('game-title').value;
    const platform = document.getElementById('game-platform').value;
    const timeVal = document.getElementById('game-time-val').value;
    const timeUnit = document.getElementById('game-time-unit').value;
    const isPortable = document.getElementById('game-is-portable-backlog').checked;
    
    if(!title) return;
    const meta = timeVal ? `${timeVal}${timeUnit}` : '';
    saveStateForUndo();

    if (gameId) {
        const game = appData.games.find(g => g.id === gameId);
        if (game) {
            game.title = title;
            game.platform = platform;
            game.meta = meta;
            game.isPortable = isPortable;
        }
    } else {
        appData.games.push({ 
            id: 'g' + Date.now(), 
            catId: catId, 
            title: title, 
            platform: platform, 
            meta: meta, 
            state: null, 
            image: null, 
            userRating: null, 
            dateFinished: null,
            is100: false,
            review: '',
            isPortable: isPortable
        });
    }
    closeModal('modal-game'); saveData(); triggerToast(gameId ? 'Informações atualizadas.' : 'Jogo adicionado.');
}

// Lógica de Ordenação Universal
function getSortedGames(gamesArray, sortType, isFinishedTab = false) {
    const sort = sortType || (isFinishedTab ? appData.settings.finishedSort : appData.settings.sort); 
    let arr = [...gamesArray];
    
    let mult = isFinishedTab
        ? (appData.settings.finishedSortDir === 'asc' ? 1 : -1)
        : (appData.settings.homeSortDir === 'asc' ? 1 : -1);
    
    if (sort === 'az') return arr.sort((a, b) => a.title.localeCompare(b.title) * mult);
    if (sort === 'rating') return arr.sort((a, b) => ((parseFloat(a.userRating) || 0) - (parseFloat(b.userRating) || 0)) * mult);
    if (sort === 'date') return arr.sort((a, b) => {
        const dA = a.dateFinished ? new Date(a.dateFinished.split('/').reverse().join('-')).getTime() : 0;
        const dB = b.dateFinished ? new Date(b.dateFinished.split('/').reverse().join('-')).getTime() : 0;
        return (dA - dB) * mult;
    });
    if (sort === 'time') return arr.sort((a, b) => {
        let vA = parseFloat((a.meta || '0').replace(',', '.')) || 0; if(a.meta && a.meta.includes('m')) vA /= 60;
        let vB = parseFloat((b.meta || '0').replace(',', '.')) || 0; if(b.meta && b.meta.includes('m')) vB /= 60;
        return (vA - vB) * mult;
    });
    if (sort === 'portable') return arr.sort((a, b) => {
        let vA = a.isPortable ? 1 : 0; let vB = b.isPortable ? 1 : 0;
        return (vA - vB) * mult;
    });
    return arr;
}

function updateStatsAndCharts() {
    const filteredGames = appData.games.filter(g => currentPlatformFilter === 'All' || g.platform === currentPlatformFilter);

    const backlogGames = filteredGames.filter(g => g.state === null);
    const playingGames = filteredGames.filter(g => g.state === 'playing');
    const finishedGames = filteredGames.filter(g => g.state === 'finished');
    
    const backlog = backlogGames.length;
    const playing = playingGames.length;
    const finished = finishedGames.length;
    const completed100 = finishedGames.filter(g => g.is100).length;
    
    document.getElementById('stat-backlog').innerText = backlog;
    document.getElementById('stat-finished-dash').innerText = finished;
    
    const ratings = filteredGames.filter(g => g.state === 'finished' && g.userRating).map(g => parseFloat(g.userRating));
    document.getElementById('stat-avg').innerText = ratings.length > 0 ? (ratings.reduce((a,b) => a+b, 0) / ratings.length).toFixed(1) : '-';

    const sumHours = (arr) => {
        let total = 0;
        arr.forEach(g => {
            if (g.meta) {
                let val = parseFloat(g.meta.replace(',', '.')) || 0;
                if (g.meta.includes('m')) val /= 60;
                total += val;
            }
        });
        return total < 10 ? total.toFixed(1) : Math.round(total);
    };

    document.getElementById('stat-hours-backlog').innerText = sumHours(backlogGames) + 'h';
    document.getElementById('stat-hours-playing').innerText = sumHours(playingGames) + 'h';
    document.getElementById('stat-hours-finished').innerText = sumHours(finishedGames) + 'h';

    if(typeof Chart !== 'undefined') {
        const ctx = document.getElementById('statusChart');
        if(chartInstance) chartInstance.destroy();
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim();
        
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels:['Backlog', 'Jogando', 'Finalizados'],
                datasets:[{ data:[backlog, playing, finished], backgroundColor:['#ff9800', '#2196f3', '#4caf50'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor } } } }
        });
    }

    const allFinished = appData.games.filter(g => g.state === 'finished').length;
    const all100 = appData.games.filter(g => g.is100).length;
    document.getElementById('ach-1').classList.toggle('locked', allFinished < 1);
    document.getElementById('ach-5').classList.toggle('locked', allFinished < 5);
    document.getElementById('ach-10').classList.toggle('locked', allFinished < 10);
    document.getElementById('ach-perfectionist').classList.toggle('locked', all100 < 1);
    document.getElementById('ach-legend').classList.toggle('locked', all100 < 5);
    
    const allCovers = appData.games.length > 0 && appData.games.every(g => g.image !== null);
    document.getElementById('ach-covers').classList.toggle('locked', !allCovers);

    const platformsUsed = new Set(appData.games.map(g => g.platform)).size;
    document.getElementById('ach-platforms').classList.toggle('locked', platformsUsed < 3);

    let totalHours = sumHours(appData.games);
    document.getElementById('ach-marathon').classList.toggle('locked', totalHours < 100);
    document.getElementById('ach-critic').classList.toggle('locked', appData.games.filter(g => g.userRating).length < 10);
}

function setHomeSort(type) {
    if (appData.settings.sort === type && type !== 'manual') {
        appData.settings.homeSortDir = appData.settings.homeSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        appData.settings.sort = type;
        appData.settings.homeSortDir = (type === 'az' || type === 'time') ? 'asc' : 'desc';
    }
    saveData();
}

function render() {
    Object.keys(homeSortLabels).forEach(k => {
        const el = document.getElementById(`sort-home-${k}`);
        if (el) { el.classList.remove('active'); el.innerText = homeSortLabels[k]; }
    });
    const activeHomeChip = document.getElementById(`sort-home-${appData.settings.sort}`);
    if(activeHomeChip) {
        activeHomeChip.classList.add('active');
        if (appData.settings.sort !== 'manual') {
            const arrow = appData.settings.homeSortDir === 'asc' ? ' ↑' : ' ↓';
            activeHomeChip.innerText = homeSortLabels[appData.settings.sort] + arrow;
        }
    }

    const containerHome = document.getElementById('app-container'); 
    const finishedContainer = document.getElementById('finished-list-container');
    containerHome.innerHTML = ''; finishedContainer.innerHTML = '';

    const filterContainer = document.getElementById('platform-chips-container');
    filterContainer.innerHTML = `<div class="filter-chip ${currentPlatformFilter === 'All' ? 'active' : ''}" onclick="setPlatformFilter('All', this)">Todas</div>`;
    
    filterContainer.innerHTML += `<div class="filter-chip ${filterPortableOnly ? 'active' : ''}" onclick="togglePortableFilter()" id="filter-chip-portable" style="border-color: var(--accent-playing); ${filterPortableOnly ? '' : 'color: var(--accent-playing);'}">🎒 Portáteis</div>`;

    appData.platforms.forEach(p => {
        filterContainer.innerHTML += `<div class="filter-chip ${currentPlatformFilter === p.name ? 'active' : ''}" onclick="setPlatformFilter('${p.name}', this)" style="display:inline-flex; align-items:center; gap:6px;">${p.icon} <span>${p.name}</span></div>`;
    });

    const playingGames = getSortedGames(appData.games.filter(g => g.state === 'playing'), null, false);
    const playingCatDiv = document.createElement('div');
    playingCatDiv.className = `category ${appData.collapsedCats.includes('playing-category') ? 'collapsed' : ''}`; playingCatDiv.id = 'playing-category';
    if(playingGames.length > 0) playingCatDiv.style.display = 'block';
    playingCatDiv.innerHTML = `<div class="category-header" onclick="toggleCollapse('playing-category', event)"><div class="cat-title-area"><span class="chevron">▼</span><h2>🕹️ Jogando Atualmente</h2></div></div><div class="game-list-wrapper"><ul class="game-list" id="list-playing"></ul></div>`;
    containerHome.appendChild(playingCatDiv);
    const listPlaying = playingCatDiv.querySelector('#list-playing'); playingGames.forEach(game => listPlaying.appendChild(createGameElement(game)));

    appData.categories.forEach(cat => {
        const catGames = getSortedGames(appData.games.filter(g => g.catId === cat.id && g.state === null), null, false);
        const catDiv = document.createElement('div'); catDiv.className = `category ${appData.collapsedCats.includes(cat.id) ? 'collapsed' : ''}`; catDiv.id = cat.id;
        catDiv.innerHTML = `
            <div class="category-header" onclick="toggleCollapse('${cat.id}', event)">
                <div class="cat-title-area"><span class="chevron">▼</span><h2>${cat.name}</h2></div>
                <div class="cat-actions">
                    <button class="btn-icon" onclick="moveCategory('${cat.id}', -1)" title="Mover para Cima">⬆️</button>
                    <button class="btn-icon" onclick="moveCategory('${cat.id}', 1)" title="Mover para Baixo">⬇️</button>
                    <button class="btn-icon" onclick="openEditCatModal('${cat.id}')" title="Editar Categoria">✏️</button>
                    <button class="btn-icon btn-delete" onclick="askDeleteCategory('${cat.id}')" title="Excluir Categoria">🗑️</button>
                    <button onclick="openGameModal('${cat.id}')">+ Jogo</button>
                </div>
            </div>
            <div class="game-list-wrapper"><ul class="game-list" id="list-${cat.id}"></ul></div>
        `;
        containerHome.appendChild(catDiv);
        const listEl = catDiv.querySelector(`#list-${cat.id}`); catGames.forEach(game => listEl.appendChild(createGameElement(game)));
    });

    renderFinishedTab();
    filterGames();
    if(document.getElementById('tab-stats').classList.contains('active')) updateStatsAndCharts();
}

function setFinishedSort(type) {
    if (appData.settings.finishedSort === type) {
        appData.settings.finishedSortDir = appData.settings.finishedSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        appData.settings.finishedSort = type;
        appData.settings.finishedSortDir = 'desc';
    }
    saveData();
}

function renderFinishedTab() {
    const finishedContainer = document.getElementById('finished-list-container');
    const finishedGames = getSortedGames(appData.games.filter(g => g.state === 'finished'), appData.settings.finishedSort, true);
    document.getElementById('count-finished').innerText = finishedGames.length;

    Object.keys(sortLabels).forEach(k => {
        const el = document.getElementById(`sort-fin-${k}`);
        if (el) { el.classList.remove('active'); el.innerText = sortLabels[k]; }
    });
    const activeChip = document.getElementById(`sort-fin-${appData.settings.finishedSort}`);
    if(activeChip) {
        activeChip.classList.add('active');
        const arrow = appData.settings.finishedSortDir === 'asc' ? ' ↑' : ' ↓';
        activeChip.innerText = sortLabels[appData.settings.finishedSort] + arrow;
    }

    if (finishedGames.length === 0) {
        finishedContainer.innerHTML = `<div class="empty-state">Nenhum jogo finalizado ainda. Hora de focar no backlog!</div>`;
        return;
    }

    const isDateSort = appData.settings.finishedSort === 'date';
    const years = {};
    finishedGames.forEach(game => {
        let group = "Todos";
        if(isDateSort) {
            group = "Sem Data";
            if(game.dateFinished) {
                const parts = game.dateFinished.split('/');
                if(parts.length === 3) group = parts[2];
            }
        }
        if(!years[group]) years[group] =[];
        years[group].push(game);
    });

    const sortedGroups = isDateSort ? Object.keys(years).sort((a, b) => {
        let cmp = b.localeCompare(a);
        return appData.settings.finishedSortDir === 'asc' ? -cmp : cmp;
    }) : ["Todos"];

    sortedGroups.forEach(year => {
        const yearId = `finished-year-${year.replace(/\s/g, '')}`;
        const yearDiv = document.createElement('div');
        yearDiv.className = `category ${appData.collapsedCats.includes(yearId) ? 'collapsed' : ''}`;
        yearDiv.id = yearId;
        
        let titleText = isDateSort ? `🏆 Concluídos em ${year}` : (appData.settings.finishedSort === 'rating' ? '🌟 Ordenados por Nota' : (appData.settings.finishedSort === 'time' ? '⏱️ Ordenados por Tempo' : '🎒 Ordenados por Portátil'));

        yearDiv.innerHTML = `
            <div class="category-header" onclick="toggleCollapse('${yearId}', event)">
                <div class="cat-title-area"><span class="chevron">▼</span><h2 style="color: var(--accent-finished)">${titleText}</h2></div>
                <div class="cat-actions"><span style="font-size: 0.8em; color: var(--text-muted); font-weight: bold;">${years[year].length} jogos</span></div>
            </div>
            <div class="game-list-wrapper"><ul class="game-list"></ul></div>
        `;
        
        const listEl = yearDiv.querySelector('ul');
        years[year].forEach(game => listEl.appendChild(createGameElement(game)));
        finishedContainer.appendChild(yearDiv);
    });
}

function createGameElement(game) {
    const li = document.createElement('li'); 
    li.className = `game-item`;
    li.dataset.platform = game.platform;
    li.dataset.portable = game.isPortable ? 'true' : 'false';
    
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';
    
    const isPlaying = game.state === 'playing' ? 'checked' : ''; const isFinished = game.state === 'finished' ? 'checked' : '';
    
    let imgContent = game.image ? `<img src="${game.image}" class="game-icon" style="width: 75px; height: 75px; min-width: 75px;" onclick="openImageModal('${game.id}')" title="Trocar Capa">` : `<div class="game-icon" style="width: 75px; height: 75px; min-width: 75px;" onclick="openImageModal('${game.id}')" title="Adicionar Capa">🎮</div>`;
    
    const platObj = appData.platforms.find(p => p.name === game.platform) || { icon: '🎮', name: game.platform };

    let metaDisplay = `<span style="display:flex; align-items:center; gap:4px; white-space:nowrap;">${platObj.icon} <span>${platObj.name}</span></span>`;
    if (game.meta) metaDisplay += `<span>⏱️ ${game.meta}</span>`;
    if (game.isPortable) metaDisplay += `<span style="color: #fff; background: var(--accent-playing); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8em;">🎒 Portátil</span>`;
    
    if (game.state === 'finished') {
        const originCat = appData.categories.find(c => c.id === game.catId);
        if (originCat) metaDisplay += `<span class="cat-tag-badge">📂 ${originCat.name}</span>`;
        if (game.is100) metaDisplay += `<span style="color: var(--star-color); font-weight: bold; background: rgba(255, 215, 0, 0.1); padding: 2px 6px; border-radius: 4px;">💎 100%</span>`;
        if (game.userRating) metaDisplay += `<span class="user-rating">🌟 ${game.userRating}/10</span>`;
        if (game.dateFinished) metaDisplay += `<span class="date-finished">📅 ${game.dateFinished}</span>`;
    }

    let editBtn = '';
    if (game.state === 'finished') {
        editBtn = `<button class="btn-icon" onclick="openCardGenerator('${game.id}')" title="Compartilhar Status">📤</button><button class="btn-icon" onclick="openEditFinishedModal('${game.id}')" title="Editar Conclusão">✏️</button>`;
    } else {
        editBtn = `<button class="btn-icon" onclick="openEditGameModal('${game.id}')" title="Editar Informações">✏️</button>`;
    }

    li.innerHTML = `
        <div class="game-title" style="width: 100%; text-align: left; margin-bottom: 8px; font-size: 1.15em; white-space: normal;">${game.title}</div>
        <div style="display: flex; width: 100%; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px; flex-grow: 1;">
                ${imgContent}
                <div class="actions" style="margin-right: 10px; min-width: 80px;"><label><input type="checkbox" class="chk-playing" onchange="toggleState('${game.id}', 'playing')" ${isPlaying}> Jogando</label><label><input type="checkbox" class="chk-finished" onchange="toggleState('${game.id}', 'finished')" ${isFinished}> Final</label></div>
                <div class="game-info" style="flex-grow: 1;"><div class="game-meta" style="margin-top: 0;">${metaDisplay}</div></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">${editBtn}<button class="btn-icon btn-delete" onclick="askDeleteGame('${game.id}')" title="Remover Jogo">🗑️</button></div>
        </div>
    `;
    return li;
}

function toggleState(gameId, action) { const game = appData.games.find(g => g.id === gameId); if (action === 'playing') { saveStateForUndo(); game.state = game.state === 'playing' ? null : 'playing'; saveData(); triggerToast(game.state ? 'Movido para Jogando.' : 'Removido.'); } else if (action === 'finished') { if (game.state === 'finished') { saveStateForUndo(); game.state = null; game.userRating = null; game.dateFinished = null; game.is100 = false; saveData(); triggerToast('Removido dos Troféus.'); } else { openRatingModal(gameId); } } }
function askDeleteGame(gameId) { const game = appData.games.find(g => g.id === gameId); if(confirm(`Remover "${game.title}"?`)) { saveStateForUndo(); appData.games = appData.games.filter(g => g.id !== gameId); saveData(); triggerToast('Excluído.'); } }
function askDeleteCategory(catId) { const cat = appData.categories.find(c => c.id === catId); const hasGames = appData.games.some(g => g.catId === catId); if(confirm(hasGames ? `Excluir APAGARÁ OS JOGOS nela. Continuar?` : `Excluir "${cat.name}"?`)) { saveStateForUndo(); appData.categories = appData.categories.filter(c => c.id !== catId); appData.games = appData.games.filter(g => g.catId !== catId); saveData(); triggerToast('Excluída.'); } }

function openRatingModal(gameId) { 
    const game = appData.games.find(g => g.id === gameId); 
    document.getElementById('rating-game-id').value = gameId; 
    document.getElementById('rating-game-name').innerText = game.title; 
    document.getElementById('game-rating').value = '10'; 
    document.getElementById('game-completed-100').checked = false; 
    
    document.getElementById('game-review-text').value = '';
    document.getElementById('game-is-portable').checked = game.isPortable || false;
    
    document.getElementById('modal-rating').showModal(); 
}

function openEditFinishedModal(gameId) { 
    const game = appData.games.find(g => g.id === gameId); 
    document.getElementById('edit-fin-game-id').value = gameId; 
    document.getElementById('edit-fin-game-name').innerText = game.title; 
    document.getElementById('edit-fin-rating').value = game.userRating || ''; 
    document.getElementById('edit-fin-date').value = game.dateFinished || ''; 
    document.getElementById('edit-fin-100').checked = game.is100 || false; 
    
    document.getElementById('edit-fin-review').value = game.review || '';
    document.getElementById('edit-fin-portable').checked = game.isPortable || false;

    document.getElementById('modal-edit-finished').showModal(); 
}

function openEditGameModal(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    document.getElementById('game-modal-title').innerText = 'Editar Informações';
    document.getElementById('edit-game-id').value = gameId;
    document.getElementById('game-cat-id').value = game.catId;
    document.getElementById('game-title').value = game.title;
    document.getElementById('game-is-portable-backlog').checked = game.isPortable || false;
    
    const select = document.getElementById('game-platform');
    select.innerHTML = '';
    appData.platforms.forEach(p => {
        const selected = p.name === game.platform ? 'selected' : '';
        select.innerHTML += `<option value="${p.name}" ${selected}>${p.name}</option>`;
    });

    if (game.meta) {
        const unit = game.meta.includes('m') ? 'm' : 'h';
        const val = game.meta.replace(/[^\d.,]/g, '');
        document.getElementById('game-time-val').value = val;
        document.getElementById('game-time-unit').value = unit;
    } else {
        document.getElementById('game-time-val').value = '';
        document.getElementById('game-time-unit').value = 'h';
    }

    document.getElementById('modal-game').showModal();
}

function cancelRating() { closeModal('modal-rating'); render(); }

function skipRating() { 
    const gameId = document.getElementById('rating-game-id').value; 
    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.state = 'finished'; 
        game.dateFinished = new Date().toLocaleDateString('pt-BR'); 
        game.isPortable = document.getElementById('game-is-portable').checked;
    } 
    closeModal('modal-rating'); saveData(); triggerToast('Zerado!'); 
}

function saveRating() { 
    const gameId = document.getElementById('rating-game-id').value; 
    const rating = document.getElementById('game-rating').value; 
    const is100 = document.getElementById('game-completed-100').checked; 
    const review = document.getElementById('game-review-text').value;
    const isPortable = document.getElementById('game-is-portable').checked;
    
    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.state = 'finished'; 
        game.userRating = rating; 
        game.dateFinished = new Date().toLocaleDateString('pt-BR'); 
        game.is100 = is100; 
        game.review = review;
        game.isPortable = isPortable;
    } 
    closeModal('modal-rating'); saveData(); triggerToast(is100 ? 'Mestre do Jogo! 100% concluído!' : 'Zerado com nota!'); 
}

function saveFinishedEdit() { 
    const gameId = document.getElementById('edit-fin-game-id').value; 
    const rating = document.getElementById('edit-fin-rating').value; 
    const dateStr = document.getElementById('edit-fin-date').value; 
    const is100 = document.getElementById('edit-fin-100').checked; 
    const review = document.getElementById('edit-fin-review').value;
    const isPortable = document.getElementById('edit-fin-portable').checked;

    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.userRating = rating; 
        game.dateFinished = dateStr; 
        game.is100 = is100; 
        game.review = review;
        game.isPortable = isPortable;
    } 
    closeModal('modal-edit-finished'); saveData(); triggerToast('Atualizado.'); 
}

function openCatModal() { document.getElementById('cat-modal-title').innerText = 'Nova Categoria'; document.getElementById('edit-cat-id').value = ''; document.getElementById('cat-name').value = ''; document.getElementById('modal-cat').showModal(); }
function openEditCatModal(catId) { const cat = appData.categories.find(c => c.id === catId); document.getElementById('cat-modal-title').innerText = 'Editar Categoria'; document.getElementById('edit-cat-id').value = cat.id; document.getElementById('cat-name').value = cat.name; document.getElementById('modal-cat').showModal(); }

function openGameModal(catId) { 
    document.getElementById('game-modal-title').innerText = 'Adicionar Jogo';
    document.getElementById('edit-game-id').value = ''; 
    document.getElementById('game-cat-id').value = catId; 
    document.getElementById('game-title').value = ''; 
    document.getElementById('game-time-val').value = ''; 
    document.getElementById('game-is-portable-backlog').checked = false;
    
    const select = document.getElementById('game-platform');
    select.innerHTML = '';
    appData.platforms.forEach(p => {
        select.innerHTML += `<option value="${p.name}">${p.name}</option>`;
    });
    
    document.getElementById('modal-game').showModal(); 
}

function closeModal(id) { document.getElementById(id).close(); }

function saveCategory() { const name = document.getElementById('cat-name').value; const editId = document.getElementById('edit-cat-id').value; if(!name) return; saveStateForUndo(); if (editId) { const cat = appData.categories.find(c => c.id === editId); if(cat) cat.name = name; } else { appData.categories.push({ id: 'c' + Date.now(), name: name }); } closeModal('modal-cat'); saveData(); triggerToast(editId ? 'Categoria editada.' : 'Categoria criada.'); }

function openImageModal(gameId) { const game = appData.games.find(g => g.id === gameId); document.getElementById('edit-img-game-id').value = gameId; document.getElementById('edit-game-name').innerText = game.title; const previewEl = document.getElementById('image-preview'); if(game.image) previewEl.innerHTML = `<img src="${game.image}" style="max-width: 100%; max-height: 200px; object-fit: contain;">`; else previewEl.innerHTML = `🎮`; document.getElementById('modal-image').showModal(); }

function searchCoverOnGoogle() { 
    const gameId = document.getElementById('edit-img-game-id').value; 
    const game = appData.games.find(g => g.id === gameId); 
    if (game) window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(game.title + " cover")}&tbs=isz:i`, '_blank'); 
}

function previewImageEdit(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('image-preview').innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px; object-fit: contain;">`; }; reader.readAsDataURL(input.files[0]); } }
function saveEditedImage() { const gameId = document.getElementById('edit-img-game-id').value; const fileInput = document.getElementById('edit-game-icon'); const game = appData.games.find(g => g.id === gameId); if (fileInput.files && fileInput.files[0]) { const reader = new FileReader(); reader.onload = function(e) { saveStateForUndo(); game.image = e.target.result; fileInput.value = ''; closeModal('modal-image'); saveData(); triggerToast('Capa atualizada.'); }; reader.readAsDataURL(fileInput.files[0]); } else { closeModal('modal-image'); } }

function openCardGenerator(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    if(!game) return;

    const wrapper = document.getElementById('export-card-wrapper');
    
    // Reseta para as cores padrão (caso o jogo não tenha capa)
    wrapper.style.setProperty('--dynamic-color', 'var(--accent-finished)');
    wrapper.style.setProperty('--dynamic-text', 'white');

    const bgLayer = document.getElementById('card-bg-layer');
    
    if (game.image) {
        bgLayer.style.display = 'block';

        // Lógica Mágica 1: Pega a cor média da capa e aplica no layout
        getAverageRGB(game.image, (color) => {
            const rgbString = `rgb(${color.r}, ${color.g}, ${color.b})`;
            const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
            const textColor = luminance > 140 ? '#000000' : '#ffffff';

            wrapper.style.setProperty('--dynamic-color', rgbString);
            wrapper.style.setProperty('--dynamic-text', textColor);
        });

        // Lógica Mágica 2: Renderiza a imagem fisicamente borrada para o print funcionar
        const imgBlur = new Image();
        imgBlur.crossOrigin = "Anonymous";
        imgBlur.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = 100; // Tamanho pequeno força desfoque natural e melhora performance
            canvas.height = 100;
            
            ctx.filter = 'blur(8px)'; // Aplica o desfoque de verdade
            // Desenha a imagem um pouco maior que o canvas para esconder bordas transparentes do blur
            ctx.drawImage(imgBlur, -10, -10, 120, 120);
            
            // Converte para imagem real e injeta no CSS
            bgLayer.style.backgroundImage = `url(${canvas.toDataURL('image/jpeg', 0.8)})`;
        };
        imgBlur.src = game.image;

    } else {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.display = 'none';
    }

    document.getElementById('card-title').innerText = game.title;
    
    const platObj = appData.platforms.find(p => p.name === game.platform) || { icon: '🎮', name: game.platform };
    document.getElementById('card-platform').innerHTML = `<span style="display:flex; align-items:center; gap:6px;">${platObj.icon} <span>${platObj.name}</span></span>`;
    
    const cat = appData.categories.find(c => c.id === game.catId);
    document.getElementById('card-cat').innerHTML = cat ? `📂 ${cat.name}` : '';

    let ratingText = game.userRating ? `🌟 ${game.userRating}/10` : '✔️ Zerado';
    if (game.is100) ratingText += ' 💎 100%';
    document.getElementById('card-rating-badge').innerText = ratingText;

    const portableBadge = game.isPortable ? '<div style="margin-top: 10px; color: var(--accent-playing); font-weight: bold; font-size: 0.95em;">🎒 Selo Anywhere Gamer: Ideal para Portáteis</div>' : '';
    document.getElementById('card-date').innerHTML = (game.dateFinished ? `Finalizado em: ${game.dateFinished}` : '') + portableBadge;

    const reviewEl = document.getElementById('card-review');
    if (game.review && game.review.trim() !== '') {
        reviewEl.innerText = `"${game.review}"`;
        reviewEl.style.display = 'block';
    } else {
        reviewEl.style.display = 'none';
    }

    if(game.image) {
        document.getElementById('card-img-preview').innerHTML = `<img src="${game.image}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
    } else {
        document.getElementById('card-img-preview').innerHTML = `🎮`;
    }

    document.getElementById('modal-card-generator').showModal();
}

function downloadCard() {
    const cardElement = document.getElementById('export-card-wrapper');
    
    html2canvas(cardElement, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(),
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `ZeraLog_Card_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        triggerToast('Imagem salva!');
    });
}

render();
checkWelcome();
