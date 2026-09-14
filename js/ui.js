import { appData, defaultData, setAppData, backupData, setBackupData, saveData, homeSortLabels, sortLabels } from './store.js';

let toastTimeout = null;
let chartInstance = null;
export let state = {
    currentPlatformFilter: 'All',
    filterPortableOnly: false,
    tempPlatformIcon: '',
    editPlatformIndex: -1,
    currentRouletteId: null
};

export function triggerToast(message) {
    const toast = document.getElementById('undo-toast'); 
    document.getElementById('undo-message').innerText = message;
    toast.classList.add('show'); 
    clearTimeout(toastTimeout); 
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 6000);
}

export function checkWelcome() { if (!localStorage.getItem('zeralog_welcomed')) document.getElementById('modal-welcome').showModal(); }
export function closeWelcome() { localStorage.setItem('zeralog_welcomed', 'true'); closeModal('modal-welcome'); }
export function closeModal(id) { document.getElementById(id).close(); }
export function changeTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('zeralog_theme', theme); }

export function toggleCompact(val) { 
    appData.settings.compact = val; 
    document.body.classList.toggle('compact-mode', val); 
    saveData(); 
}

export function saveStateForUndo() { setBackupData(JSON.stringify(appData)); }

export function undoAction() { 
    if (backupData) { 
        setAppData(JSON.parse(backupData)); 
        document.body.classList.toggle('compact-mode', appData.settings.compact); 
        saveData(() => { render(); filterGames(); }); 
        document.getElementById('undo-toast').classList.remove('show'); 
        setBackupData(null); 
    } 
}

export function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`btn-tab-${tabId}`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if(tabId === 'stats') updateStatsAndCharts();
    else filterGames();
}

// ================= Lógica de Ordenação e Renderização =================
export function getSortedGames(gamesArray, sortType, isFinishedTab = false) {
    const sort = sortType || (isFinishedTab ? appData.settings.finishedSort : appData.settings.sort); 
    let arr = [...gamesArray];
    let mult = isFinishedTab ? (appData.settings.finishedSortDir === 'asc' ? 1 : -1) : (appData.settings.homeSortDir === 'asc' ? 1 : -1);
    
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

export function filterGames() {
    const term = document.getElementById('search-bar').value.toLowerCase();
    document.querySelectorAll('.category').forEach(cat => {
        let hasVisibleGames = false;
        cat.querySelectorAll('.game-item').forEach(item => {
            const titleMatch = item.querySelector('.game-title').innerText.toLowerCase().includes(term);
            const platformMatch = state.currentPlatformFilter === 'All' || item.dataset.platform === state.currentPlatformFilter;
            const portableMatch = !state.filterPortableOnly || item.dataset.portable === 'true';
            
            if (titleMatch && platformMatch && portableMatch) { item.style.display = 'flex'; hasVisibleGames = true; } 
            else { item.style.display = 'none'; }
        });
        if (term !== '' || state.currentPlatformFilter !== 'All' || state.filterPortableOnly) { 
            cat.style.display = hasVisibleGames ? 'block' : 'none'; 
        } else { 
            if (cat.id === 'playing-category') cat.style.display = cat.querySelectorAll('.game-item').length > 0 ? 'block' : 'none'; 
            else cat.style.display = 'block'; 
        }
    });
}

export function setPlatformFilter(platform, el) {
    state.currentPlatformFilter = platform;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    filterGames();
    if (document.getElementById('tab-stats').classList.contains('active')) updateStatsAndCharts();
}

export function togglePortableFilter() {
    state.filterPortableOnly = !state.filterPortableOnly;
    render();
}

export function render() {
    // Topo de ordenação
    Object.keys(homeSortLabels).forEach(k => {
        const el = document.getElementById(`sort-home-${k}`);
        if (el) { el.classList.remove('active'); el.innerText = homeSortLabels[k]; }
    });
    const activeHomeChip = document.getElementById(`sort-home-${appData.settings.sort}`);
    if(activeHomeChip) {
        activeHomeChip.classList.add('active');
        if (appData.settings.sort !== 'manual') activeHomeChip.innerText = homeSortLabels[appData.settings.sort] + (appData.settings.homeSortDir === 'asc' ? ' ↑' : ' ↓');
    }

    const containerHome = document.getElementById('app-container'); 
    const finishedContainer = document.getElementById('finished-list-container');
    containerHome.innerHTML = ''; finishedContainer.innerHTML = '';

    const filterContainer = document.getElementById('platform-chips-container');
    filterContainer.innerHTML = `<div class="filter-chip ${state.currentPlatformFilter === 'All' ? 'active' : ''}" onclick="setPlatformFilter('All', this)">Todas</div>`;
    filterContainer.innerHTML += `<div class="filter-chip ${state.filterPortableOnly ? 'active' : ''}" onclick="togglePortableFilter()" id="filter-chip-portable" style="border-color: var(--accent-playing); ${state.filterPortableOnly ? '' : 'color: var(--accent-playing);'}">🎒 Portáteis</div>`;

    appData.platforms.forEach(p => {
        filterContainer.innerHTML += `<div class="filter-chip ${state.currentPlatformFilter === p.name ? 'active' : ''}" onclick="setPlatformFilter('${p.name}', this)" style="display:inline-flex; align-items:center; gap:6px;">${p.icon} <span>${p.name}</span></div>`;
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
        activeChip.innerText = sortLabels[appData.settings.finishedSort] + (appData.settings.finishedSortDir === 'asc' ? ' ↑' : ' ↓');
    }

    if (finishedGames.length === 0) {
        finishedContainer.innerHTML = `<div class="empty-state">Nenhum jogo finalizado ainda. Hora de focar no backlog!</div>`;
        return;
    }

    const isDateSort = appData.settings.finishedSort === 'date';
    const years = {};
    finishedGames.forEach(game => {
        let group = "Todos";
        if(isDateSort) { group = "Sem Data"; if(game.dateFinished) { const parts = game.dateFinished.split('/'); if(parts.length === 3) group = parts[2]; } }
        if(!years[group]) years[group] = []; years[group].push(game);
    });

    const sortedGroups = isDateSort ? Object.keys(years).sort((a, b) => { let cmp = b.localeCompare(a); return appData.settings.finishedSortDir === 'asc' ? -cmp : cmp; }) : ["Todos"];
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

export function createGameElement(game) {
    const li = document.createElement('li'); 
    li.className = `game-item`; li.dataset.platform = game.platform; li.dataset.portable = game.isPortable ? 'true' : 'false';
    li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
    
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

    let editBtn = game.state === 'finished' ? `<button class="btn-icon" onclick="openCardGenerator('${game.id}')" title="Compartilhar Status">📤</button><button class="btn-icon" onclick="openEditFinishedModal('${game.id}')" title="Editar Conclusão">✏️</button>` : `<button class="btn-icon" onclick="openEditGameModal('${game.id}')" title="Editar Informações">✏️</button>`;

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

// Stats & Conquistas Omitido por brevidade, mas você move o block `updateStatsAndCharts` e `checkNewAchievements` para cá
// (A estrutura segue exatamente a lógica monolítica, só transferida para o escopo deste módulo)
// Para que esta resposta caiba de forma segura, os handlers de modais e botões (saveGame, saveCategory, etc) também residirão aqui.

export function saveGame() {
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
        if (game) { game.title = title; game.platform = platform; game.meta = meta; game.isPortable = isPortable; }
    } else {
        appData.games.push({ id: 'g' + Date.now(), catId: catId, title: title, platform: platform, meta: meta, state: null, image: null, userRating: null, dateFinished: null, is100: false, review: '', isPortable: isPortable });
    }
    closeModal('modal-game'); saveData(() => render()); triggerToast(gameId ? 'Informações atualizadas.' : 'Jogo adicionado.');
}
