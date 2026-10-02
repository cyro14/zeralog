import { icon, platformIcons } from './icons.js';
import { searchGames, getGameDetails, coverToDataURL, esc, resizeUrl, describeError, getRawgKey, setRawgKey, hasCustomRawgKey } from './gameApi.js';
import { appData, defaultData, setAppData, backupData, setBackupData, saveData, homeSortLabels, sortLabels, migrateData } from './store.js';

let toastTimeout = null;
export let chartInstance = null;
export let state = {
    currentPlatformFilter: 'All',
    filterPortableOnly: false,
    tempPlatformIcon: '',
    editPlatformIndex: -1,
    currentRouletteId: null
};

// ================= UTILITÁRIOS =================
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

// ================= BUSCA AUTOMÁTICA (RAWG) =================
let pendingCover = null;   // capa baixada, aguardando o "Salvar"
let lastResults = [];

function updateCoverPreview(src) {
    const el = document.getElementById('game-cover-preview');
    el.innerHTML = src ? `<img src="${esc(src)}" alt="Capa">` : '';
    el.style.display = src ? 'block' : 'none';
}

function resetAutoFill() {
    pendingCover = null;
    lastResults = [];
    document.getElementById('rawg-results').innerHTML = '';
    ['game-description', 'game-genres', 'game-released', 'game-metacritic', 'game-hours-played', 'game-journal-notes']
        .forEach(id => document.getElementById(id).value = '');
    document.getElementById('game-extra').open = false;
    updateCoverPreview(null);
}

export async function fetchGameFromRAWG() {
    const query = document.getElementById('game-title').value.trim();
    if (!query) { triggerToast('Digite o nome do jogo primeiro.'); return; }
    const box = document.getElementById('rawg-results');
    box.innerHTML = '<div class="rawg-msg">Buscando...</div>';
    try {
        lastResults = await searchGames(query);
        if (!lastResults.length) { box.innerHTML = '<div class="rawg-msg">Nada encontrado. Preencha manualmente.</div>'; return; }
        box.innerHTML = lastResults.map((g, i) => `
            <button type="button" class="rawg-item" onclick="pickRawgResult(${i})">
                ${g.image ? `<img src="${esc(resizeUrl(g.image, 200))}" loading="lazy" alt="">` : `<span class="rawg-noimg">${icon('gamepad', { size: '1.6em' })}</span>`}
                <span><strong>${esc(g.title)}</strong><small>${g.released ? esc(g.released.slice(0, 4)) : '—'}${g.genres.length ? ' · ' + esc(g.genres.slice(0, 2).join(', ')) : ''}</small></span>
            </button>`).join('');
    } catch (err) {
        console.error(err);
        box.innerHTML = `<div class="rawg-msg rawg-err">${esc(describeError(err))} Você pode preencher manualmente.</div>`;
    }
}

export async function pickRawgResult(i) {
    const base = lastResults[i];
    if (!base) return;
    const box = document.getElementById('rawg-results');
    box.innerHTML = '<div class="rawg-msg">Carregando dados...</div>';
    let g = base;
    try { g = { ...base, ...(await getGameDetails(base.rawgId)) }; } catch (e) { /* segue só com os dados da busca */ }

    document.getElementById('game-title').value = g.title;
    document.getElementById('game-description').value = g.description;
    document.getElementById('game-genres').value = g.genres.join(', ');
    document.getElementById('game-released').value = g.released;
    document.getElementById('game-metacritic').value = g.metacritic ?? '';
    if (g.playtime && !document.getElementById('game-time-val').value) {
        document.getElementById('game-time-val').value = g.playtime;
        document.getElementById('game-time-unit').value = 'h';
    }
    document.getElementById('game-extra').open = true;
    if (g.image) { pendingCover = await coverToDataURL(g.image); updateCoverPreview(pendingCover); }
    box.innerHTML = `<div class="rawg-msg rawg-ok">${icon('check')} Dados de <strong>${esc(g.title)}</strong> preenchidos. Revise e salve.</div>`;
}

// ================= RENDERIZAÇÃO E LISTAS =================
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
            
            if (titleMatch && platformMatch && portableMatch) { item.style.display = ''; hasVisibleGames = true; } 
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

export function setHomeSort(type) {
    if (appData.settings.sort === type && type !== 'manual') {
        appData.settings.homeSortDir = appData.settings.homeSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        appData.settings.sort = type;
        appData.settings.homeSortDir = (type === 'az' || type === 'time') ? 'asc' : 'desc';
    }
    saveData(() => render());
}

export function setFinishedSort(type) {
    if (appData.settings.finishedSort === type) {
        appData.settings.finishedSortDir = appData.settings.finishedSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        appData.settings.finishedSort = type;
        appData.settings.finishedSortDir = 'desc';
    }
    saveData(() => renderFinishedTab());
}

export function toggleCollapse(id, event) { 
    if(event && event.target.closest('button')) return; 
    const idx = appData.collapsedCats.indexOf(id); 
    if (idx > -1) appData.collapsedCats.splice(idx, 1); 
    else appData.collapsedCats.push(id); 
    const catDiv = document.getElementById(id); 
    if(catDiv) catDiv.classList.toggle('collapsed'); 
    saveData(); 
}

export function render() {
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
    filterContainer.innerHTML += `<div class="filter-chip ${state.filterPortableOnly ? 'active' : ''}" onclick="togglePortableFilter()" id="filter-chip-portable" style="border-color: var(--accent-playing); ${state.filterPortableOnly ? '' : 'color: var(--accent-playing);'}">Portáteis</div>`;

    appData.platforms.forEach(p => {
        filterContainer.innerHTML += `<div class="filter-chip ${state.currentPlatformFilter === p.name ? 'active' : ''}" onclick="setPlatformFilter('${p.name}', this)" style="display:inline-flex; align-items:center; gap:6px;">${p.icon} <span>${p.name}</span></div>`;
    });

    const playingGames = getSortedGames(appData.games.filter(g => g.state === 'playing'), null, false);
    const playingCatDiv = document.createElement('div');
    playingCatDiv.className = `category ${appData.collapsedCats.includes('playing-category') ? 'collapsed' : ''}`; playingCatDiv.id = 'playing-category';
    if(playingGames.length > 0) playingCatDiv.style.display = 'block';
    playingCatDiv.innerHTML = `<div class="category-header" onclick="toggleCollapse('playing-category', event)"><div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span><h2>Jogando Atualmente</h2></div></div><div class="game-list-wrapper"><ul class="game-list" id="list-playing"></ul></div>`;
    containerHome.appendChild(playingCatDiv);
    const listPlaying = playingCatDiv.querySelector('#list-playing'); playingGames.forEach(game => listPlaying.appendChild(createGameElement(game)));

    appData.categories.forEach(cat => {
        const catGames = getSortedGames(appData.games.filter(g => g.catId === cat.id && g.state === null), null, false);
        const catDiv = document.createElement('div'); catDiv.className = `category ${appData.collapsedCats.includes(cat.id) ? 'collapsed' : ''}`; catDiv.id = cat.id;
        catDiv.innerHTML = `
            <div class="category-header" onclick="toggleCollapse('${cat.id}', event)">
                <div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span><h2>${esc(cat.name)}</h2></div>
                <div class="cat-actions">
                    <button class="btn-icon" onclick="moveCategory('${cat.id}', -1)" title="Mover para Cima">${ICONS.up}</button>
                    <button class="btn-icon" onclick="moveCategory('${cat.id}', 1)" title="Mover para Baixo">${ICONS.down}</button>
                    <button class="btn-icon" onclick="openEditCatModal('${cat.id}')" title="Editar Categoria">${ICONS.edit}</button>
                    <button class="btn-icon btn-delete" onclick="askDeleteCategory('${cat.id}')" title="Excluir Categoria">${ICONS.trash}</button>
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

export function renderFinishedTab() {
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
        
        let titleText = isDateSort ? `Concluídos em ${year}` : (appData.settings.finishedSort === 'rating' ? 'Ordenados por Nota' : (appData.settings.finishedSort === 'time' ? 'Ordenados por Tempo' : 'Ordenados por Portátil'));
        yearDiv.innerHTML = `
            <div class="category-header" onclick="toggleCollapse('${yearId}', event)">
                <div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span><h2 style="color: var(--accent-finished)">${titleText}</h2></div>
                <div class="cat-actions"><span style="font-size: 0.8em; color: var(--text-muted); font-weight: bold;">${years[year].length} ${years[year].length === 1 ? 'jogo' : 'jogos'}</span></div>
            </div>
            <div class="game-list-wrapper"><ul class="game-list"></ul></div>
        `;
        const listEl = yearDiv.querySelector('ul');
        years[year].forEach(game => listEl.appendChild(createGameElement(game)));
        finishedContainer.appendChild(yearDiv);
    });
}

// Ícones de linha (SVG) para os botões
const ICONS = Object.fromEntries(['edit', 'share', 'trash', 'up', 'down'].map(n => [n, icon(n, { size: '18px' })]));

// Diário com mais que isso (ou muitas linhas) começa recolhido, com botão "Ver tudo"
const JOURNAL_LIMIT = 140;

export function toggleJournal(btn) {
    const box = btn.closest('.gi-journal');
    const collapsed = box.classList.toggle('collapsed');
    btn.textContent = collapsed ? 'Ver tudo' : 'Recolher';
    btn.setAttribute('aria-expanded', String(!collapsed));
}

const fmtTime = t => String(t).endsWith('m') ? `${String(t).slice(0, -1)} min` : String(t);

export function createGameElement(game) {
    const li = document.createElement('li');
    li.className = 'game-item';
    li.dataset.platform = game.platform;
    li.dataset.portable = game.isPortable ? 'true' : 'false';

    const finished = game.state === 'finished';
    const isPlaying = game.state === 'playing' ? 'checked' : '';
    const isFinished = finished ? 'checked' : '';
    const title = esc(game.title);

    const cover = game.image
        ? `<img src="${esc(game.image)}" alt="" class="gi-cover" onclick="openImageModal('${game.id}')" title="Trocar capa">`
        : `<div class="gi-cover gi-cover-empty" onclick="openImageModal('${game.id}')" title="Adicionar capa">${esc((game.title.trim()[0] || '?').toUpperCase())}</div>`;

    // Linha secundária: plataforma · ano · gênero · tempo estimado
    const sub = [esc(game.platform)];
    if (game.released) sub.push(esc(game.released.slice(0, 4)));
    if (game.genres && game.genres.length) sub.push(esc(game.genres.slice(0, 2).join(', ')));
    if (game.meta) sub.push(`${esc(fmtTime(game.meta))} p/ zerar`);

    // Barra de progresso (só se houver tempo estimado e horas jogadas)
    let progress = '';
    if (game.meta && game.hoursPlayed) {
        let total = parseFloat(String(game.meta).replace(',', '.')) || 0;
        if (String(game.meta).includes('m')) total /= 60;
        const played = parseFloat(game.hoursPlayed) || 0;
        if (total > 0) {
            const pct = Math.min(100, Math.round(played / total * 100));
            const left = total - played;
            progress = `<div class="gi-progress"><div class="gi-bar"><span style="width:${pct}%"></span></div><small>${played}h de ${total % 1 ? total.toFixed(1) : total}h · ${left > 0 ? `faltam ~${left.toFixed(1)}h` : 'meta atingida'}</small></div>`;
        }
    } else if (game.hoursPlayed) {
        progress = `<div class="gi-progress"><small>${esc(game.hoursPlayed)}h jogadas</small></div>`;
    }

    // Etiquetas
    const chips = [];
    if (game.metacritic) chips.push(`<span class="chip score ${game.metacritic >= 75 ? 'good' : game.metacritic >= 50 ? 'mid' : 'bad'}" title="Nota Metacritic">Metacritic ${esc(game.metacritic)}</span>`);
    if (game.isPortable) chips.push('<span class="chip chip-accent">Portátil</span>');
    if (finished) {
        const originCat = appData.categories.find(c => c.id === game.catId);
        if (originCat) chips.push(`<span class="chip">${esc(originCat.name)}</span>`);
        if (game.is100) chips.push('<span class="chip chip-gold">100%</span>');
        if (game.userRating) chips.push(`<span class="chip chip-gold">Nota ${esc(game.userRating)}/10</span>`);
        if (game.dateFinished) chips.push(`<span class="chip">Zerado em ${esc(game.dateFinished)}</span>`);
    }

    const editBtn = finished
        ? `<button type="button" class="icon-btn" onclick="openCardGenerator('${game.id}')" title="Compartilhar" aria-label="Compartilhar">${ICONS.share}</button>
           <button type="button" class="icon-btn" onclick="openEditFinishedModal('${game.id}')" title="Editar conclusão" aria-label="Editar conclusão">${ICONS.edit}</button>`
        : `<button type="button" class="icon-btn" onclick="openEditGameModal('${game.id}')" title="Editar" aria-label="Editar">${ICONS.edit}</button>`;

    // Diário de bordo: recolhível quando for grande
    let journal = '';
    if (game.journalNotes && !finished) {
        const notes = String(game.journalNotes);
        const long = notes.length > JOURNAL_LIMIT || notes.split('\n').length > 3;
        journal = `<div class="gi-journal${long ? ' collapsed' : ''}">
            <div class="gi-journal-head"><span>Diário de bordo</span>${long ? '<button type="button" class="link-btn" aria-expanded="false" onclick="toggleJournal(this)">Ver tudo</button>' : ''}</div>
            <div class="gi-journal-text">${esc(notes)}</div>
        </div>`;
    }

    const desc = game.description
        ? `<details class="game-desc"><summary>Sobre o jogo</summary><p>${esc(game.description)}</p></details>` : '';

    li.innerHTML = `
        ${cover}
        <div class="gi-body">
            <div class="game-title">${title}</div>
            <div class="gi-sub">${sub.join('<span class="dot">·</span>')}</div>
            ${chips.length ? `<div class="gi-chips">${chips.join('')}</div>` : ''}
            ${progress}
            <div class="gi-status">
                <label class="pill pill-playing"><input type="checkbox" class="chk-playing" onchange="toggleState('${game.id}', 'playing')" ${isPlaying}><span>Jogando</span></label>
                <label class="pill pill-finished"><input type="checkbox" class="chk-finished" onchange="toggleState('${game.id}', 'finished')" ${isFinished}><span>Zerado</span></label>
            </div>
        </div>
        <div class="gi-actions">${editBtn}<button type="button" class="icon-btn danger" onclick="askDeleteGame('${game.id}')" title="Remover" aria-label="Remover">${ICONS.trash}</button></div>
        ${journal}
        ${desc}
    `;
    return li;
}

// ================= STATS E CONQUISTAS =================
export function notifyAchievement(name) {
    const el = document.getElementById('achievement-notif');
    document.getElementById('ach-notif-name').innerText = name;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); }, 4000);
}

export function checkNewAchievements() {
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
            saveData(null); 
        }
    });
}

export function updateStatsAndCharts() {
    const filteredGames = appData.games.filter(g => state.currentPlatformFilter === 'All' || g.platform === state.currentPlatformFilter);
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

// ================= CRUD JOGOS E CATEGORIAS =================
export function openCatModal() { document.getElementById('cat-modal-title').innerText = 'Nova Categoria'; document.getElementById('edit-cat-id').value = ''; document.getElementById('cat-name').value = ''; document.getElementById('modal-cat').showModal(); }
export function openEditCatModal(catId) { const cat = appData.categories.find(c => c.id === catId); document.getElementById('cat-modal-title').innerText = 'Editar Categoria'; document.getElementById('edit-cat-id').value = cat.id; document.getElementById('cat-name').value = cat.name; document.getElementById('modal-cat').showModal(); }
export function saveCategory() { const name = document.getElementById('cat-name').value; const editId = document.getElementById('edit-cat-id').value; if(!name) return; saveStateForUndo(); if (editId) { const cat = appData.categories.find(c => c.id === editId); if(cat) cat.name = name; } else { appData.categories.push({ id: 'c' + Date.now(), name: name }); } closeModal('modal-cat'); saveData(() => render()); triggerToast(editId ? 'Categoria editada.' : 'Categoria criada.'); }
export function askDeleteCategory(catId) { const cat = appData.categories.find(c => c.id === catId); const hasGames = appData.games.some(g => g.catId === catId); if(confirm(hasGames ? `Excluir APAGARÁ OS JOGOS nela. Continuar?` : `Excluir "${cat.name}"?`)) { saveStateForUndo(); appData.categories = appData.categories.filter(c => c.id !== catId); appData.games = appData.games.filter(g => g.catId !== catId); saveData(() => render()); triggerToast('Excluída.'); } }
export function moveCategory(catId, direction) {
    const index = appData.categories.findIndex(c => c.id === catId);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < appData.categories.length) {
        saveStateForUndo();
        const temp = appData.categories[index];
        appData.categories[index] = appData.categories[newIndex];
        appData.categories[newIndex] = temp;
        saveData(() => render());
    }
}

export function openGameModal(catId) { 
    document.getElementById('game-modal-title').innerText = 'Adicionar Jogo';
    document.getElementById('edit-game-id').value = ''; 
    document.getElementById('game-cat-id').value = catId; 
    document.getElementById('game-title').value = ''; 
    document.getElementById('game-time-val').value = ''; 
    resetAutoFill();
    document.getElementById('game-is-portable-backlog').checked = false;
    
    const select = document.getElementById('game-platform');
    select.innerHTML = '';
    appData.platforms.forEach(p => {
        select.innerHTML += `<option value="${p.name}">${p.name}</option>`;
    });
    document.getElementById('modal-game').showModal(); 
}

export function openEditGameModal(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    document.getElementById('game-modal-title').innerText = 'Editar Informações';
    document.getElementById('edit-game-id').value = gameId;
    document.getElementById('game-cat-id').value = game.catId;
    document.getElementById('game-title').value = game.title;
    document.getElementById('game-is-portable-backlog').checked = game.isPortable || false;
    resetAutoFill();
    document.getElementById('game-hours-played').value = game.hoursPlayed || '';
    document.getElementById('game-journal-notes').value = game.journalNotes || '';
    document.getElementById('game-description').value = game.description || '';
    document.getElementById('game-genres').value = (game.genres || []).join(', ');
    document.getElementById('game-released').value = game.released || '';
    document.getElementById('game-metacritic').value = game.metacritic ?? '';
    document.getElementById('game-extra').open = !!(game.description || (game.genres && game.genres.length) || game.released || game.metacritic);
    updateCoverPreview(game.image);
    
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

export function saveGame() {
    const val = id => document.getElementById(id).value;
    const gameId = val('edit-game-id');
    const catId = val('game-cat-id');
    const title = val('game-title').trim();
    if (!title) return;

    const timeVal = val('game-time-val');
    const extra = {
        platform: val('game-platform'),
        meta: timeVal ? `${timeVal}${val('game-time-unit')}` : '',
        hoursPlayed: val('game-hours-played'),
        journalNotes: val('game-journal-notes'),
        isPortable: document.getElementById('game-is-portable-backlog').checked,
        description: val('game-description').trim(),
        genres: val('game-genres').split(',').map(x => x.trim()).filter(Boolean),
        released: val('game-released'),
        metacritic: val('game-metacritic') === '' ? null : Number(val('game-metacritic'))
    };
    saveStateForUndo();

    if (gameId) {
        const game = appData.games.find(g => g.id === gameId);
        if (game) {
            Object.assign(game, extra, { title });
            if (pendingCover) game.image = pendingCover;
        }
    } else {
        appData.games.push({
            id: 'g' + Date.now(), catId, title, ...extra,
            state: null, image: pendingCover || null, userRating: null, dateFinished: null,
            is100: false, review: ''
        });
    }
    pendingCover = null;
    closeModal('modal-game'); saveData(() => render()); triggerToast(gameId ? 'Informações atualizadas.' : 'Jogo adicionado com sucesso!');
}

export function askDeleteGame(gameId) { const game = appData.games.find(g => g.id === gameId); if(confirm(`Remover "${game.title}"?`)) { saveStateForUndo(); appData.games = appData.games.filter(g => g.id !== gameId); saveData(() => render()); triggerToast('Excluído.'); } }

export function toggleState(gameId, action) { 
    const game = appData.games.find(g => g.id === gameId); 
    if (action === 'playing') { 
        saveStateForUndo(); 
        game.state = game.state === 'playing' ? null : 'playing'; 
        saveData(() => render()); 
        triggerToast(game.state ? 'Movido para Jogando.' : 'Removido.'); 
    } else if (action === 'finished') { 
        if (game.state === 'finished') { 
            saveStateForUndo(); 
            game.state = null; game.userRating = null; game.dateFinished = null; game.is100 = false; 
            saveData(() => render()); 
            triggerToast('Removido dos Troféus.'); 
        } else { 
            openRatingModal(gameId); 
        } 
    } 
}

// ================= AVALIAÇÃO E ZERAMENTO =================
export function openRatingModal(gameId) { 
    const game = appData.games.find(g => g.id === gameId); 
    document.getElementById('rating-game-id').value = gameId; 
    document.getElementById('rating-game-name').innerText = game.title; 
    document.getElementById('game-rating').value = '10'; 
    document.getElementById('game-completed-100').checked = false; 
    document.getElementById('game-review-text').value = '';
    document.getElementById('game-is-portable').checked = game.isPortable || false;
    document.getElementById('modal-rating').showModal(); 
}

export function openEditFinishedModal(gameId) { 
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

export function cancelRating() { closeModal('modal-rating'); render(); }

export function skipRating() { 
    const gameId = document.getElementById('rating-game-id').value; 
    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.state = 'finished'; 
        game.dateFinished = new Date().toLocaleDateString('pt-BR'); 
        game.isPortable = document.getElementById('game-is-portable').checked;
    } 
    closeModal('modal-rating'); saveData(() => render()); triggerToast('Zerado!'); 
}

export function saveRating() { 
    const gameId = document.getElementById('rating-game-id').value; 
    const rating = document.getElementById('game-rating').value; 
    const is100 = document.getElementById('game-completed-100').checked; 
    const review = document.getElementById('game-review-text').value;
    const isPortable = document.getElementById('game-is-portable').checked;
    
    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.state = 'finished'; game.userRating = rating; game.dateFinished = new Date().toLocaleDateString('pt-BR'); game.is100 = is100; game.review = review; game.isPortable = isPortable;
    } 
    closeModal('modal-rating'); saveData(() => render()); checkNewAchievements(); triggerToast(is100 ? 'Mestre do Jogo! 100% concluído!' : 'Zerado com nota!'); 
}

export function saveFinishedEdit() { 
    const gameId = document.getElementById('edit-fin-game-id').value; 
    const rating = document.getElementById('edit-fin-rating').value; 
    const dateStr = document.getElementById('edit-fin-date').value; 
    const is100 = document.getElementById('edit-fin-100').checked; 
    const review = document.getElementById('edit-fin-review').value;
    const isPortable = document.getElementById('edit-fin-portable').checked;

    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.userRating = rating; game.dateFinished = dateStr; game.is100 = is100; game.review = review; game.isPortable = isPortable;
    } 
    closeModal('modal-edit-finished'); saveData(() => render()); triggerToast('Atualizado.'); 
}

// ================= ROLETA E UTILITÁRIOS =================
export function spinRoulette() {
    const pool = appData.games.filter(g => g.state !== 'finished');
    if(pool.length === 0) return alert('Seu backlog está vazio! Adicione mais jogos.');
    const winner = pool[Math.floor(Math.random() * pool.length)];
    state.currentRouletteId = winner.id;
    document.getElementById('roulette-game-name').innerText = winner.title;
    document.getElementById('modal-roulette').showModal();
}

export function acceptRoulette() {
    closeModal('modal-roulette');
    toggleState(state.currentRouletteId, 'playing');
}

export function quickSearch(site) {
    const title = document.getElementById('game-title').value;
    if(!title) return alert('Digite o nome do jogo primeiro!');
    if(site === 'hltb') window.open(`https://howlongtobeat.com/?q=${encodeURIComponent(title)}`, '_blank');
    if(site === 'meta') window.open(`https://www.metacritic.com/search/${encodeURIComponent(title)}/`, '_blank');
}

export function openImageModal(gameId) { const game = appData.games.find(g => g.id === gameId); document.getElementById('edit-img-game-id').value = gameId; document.getElementById('edit-game-name').innerText = game.title; const previewEl = document.getElementById('image-preview'); if(game.image) previewEl.innerHTML = `<img src="${game.image}" style="max-width: 100%; max-height: 200px; object-fit: contain;">`; else previewEl.innerHTML = icon('gamepad', { size: '3em' }); document.getElementById('modal-image').showModal(); }
export function searchCoverOnGoogle() { const gameId = document.getElementById('edit-img-game-id').value; const game = appData.games.find(g => g.id === gameId); if (game) window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(game.title + " cover")}&tbs=isz:i`, '_blank'); }
export function previewImageEdit(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('image-preview').innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px; object-fit: contain;">`; }; reader.readAsDataURL(input.files[0]); } }
export function saveEditedImage() { const gameId = document.getElementById('edit-img-game-id').value; const fileInput = document.getElementById('edit-game-icon'); const game = appData.games.find(g => g.id === gameId); if (fileInput.files && fileInput.files[0]) { const reader = new FileReader(); reader.onload = function(e) { saveStateForUndo(); game.image = e.target.result; fileInput.value = ''; closeModal('modal-image'); saveData(() => render()); triggerToast('Capa atualizada.'); }; reader.readAsDataURL(fileInput.files[0]); } else { closeModal('modal-image'); } }

// ================= SETTINGS E DADOS =================
export function openBackupModal() { document.getElementById('modal-backup-info').showModal(); }
export function exportBackup() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData)); const dlAnchor = document.createElement('a'); dlAnchor.setAttribute("href", dataStr); dlAnchor.setAttribute("download", "ZeraLog_Backup_" + new Date().toISOString().slice(0,10) + ".json"); document.body.appendChild(dlAnchor); dlAnchor.click(); dlAnchor.remove(); closeModal('modal-backup-info'); triggerToast('Backup Salvo!'); }
export function importBackup(event) { 
    const file = event.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        try { 
            const imported = JSON.parse(e.target.result); 
            if (imported && imported.games) { 
                saveStateForUndo(); 
                setAppData(migrateData(imported)); 
                if (!appData.settings) appData.settings = { sort: 'manual', compact: false, finishedSortDir: 'desc', homeSortDir: 'asc' }; 
                if (!appData.settings.homeSortDir) appData.settings.homeSortDir = 'asc';
                if (!appData.collapsedCats) appData.collapsedCats =[]; 
                if (!appData.platforms) appData.platforms = defaultData.platforms;
                document.body.classList.toggle('compact-mode', appData.settings.compact); 
                saveData(() => render()); 
                closeModal('modal-backup-info'); 
                triggerToast('Restaurado!'); 
            } 
        } catch (err) { alert("Erro ao ler o arquivo."); } 
        event.target.value = ''; 
    }; 
    reader.readAsText(file); 
}

export function saveRawgKey(value) { setRawgKey(value); triggerToast(value.trim() ? 'Chave da RAWG salva.' : 'Voltou para a chave padrão.'); }

export function openSettings() { 
    document.getElementById('rawg-key-input').value = hasCustomRawgKey() ? getRawgKey() : '';
    document.getElementById('theme-selector').value = localStorage.getItem('zeralog_theme') || 'dark'; 
    document.getElementById('compact-toggle').checked = appData.settings.compact; 
    cancelEditPlatform(); 
    renderPlatformAdmin();
    document.getElementById('modal-settings').showModal(); 
}
export function openFactoryReset() { document.getElementById('reset-confirm-input').value = ''; document.getElementById('modal-factory-reset').showModal(); }
export function confirmFactoryReset() { if (document.getElementById('reset-confirm-input').value === 'APAGAR') { saveStateForUndo(); setAppData({ settings: { sort: 'manual', compact: false, finishedSortDir: 'desc', homeSortDir: 'asc' }, collapsedCats:[], categories:[], platforms: defaultData.platforms, games:[], unlockedAchievements:[] }); saveData(() => render()); closeModal('modal-factory-reset'); closeModal('modal-settings'); localStorage.removeItem('zeralog_welcomed'); triggerToast('Apagado.'); setTimeout(checkWelcome, 500); } else { alert('Digite APAGAR'); } }

// ================= PLATAFORMAS =================
export function renderPlatformAdmin() {
    const list = document.getElementById('platforms-list-admin');
    list.innerHTML = '';
    appData.platforms.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'platform-list-item';
        item.innerHTML = `
            <span style="display:flex; align-items:center; gap:8px;">${p.icon} <span>${p.name}</span></span>
            <div style="display:flex; gap:5px;">
                <button class="btn-icon" onclick="editPlatform(${index})" title="Editar">${ICONS.edit}</button>
                <button class="btn-icon btn-delete" onclick="removePlatform(${index})" title="Remover">${ICONS.trash}</button>
            </div>
        `;
        list.appendChild(item);
    });
}
export function previewPlatformIcon(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { state.tempPlatformIcon = `<img src="${e.target.result}" style="width: 1.2em; height: 1.2em; vertical-align: middle; border-radius: 4px; object-fit: cover; flex-shrink: 0;">`; document.getElementById('new-platform-icon-preview').innerHTML = state.tempPlatformIcon; }; reader.readAsDataURL(input.files[0]); } }
export function searchPlatformIconOnGoogle() { const name = document.getElementById('new-platform-name').value; const query = name ? `${name} logo icon transparent png` : 'video game console platform logo icon transparent png'; window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&tbs=ic:trans`, '_blank'); }
export function editPlatform(index) { state.editPlatformIndex = index; const p = appData.platforms[index]; document.getElementById('new-platform-name').value = p.name; state.tempPlatformIcon = p.icon; document.getElementById('new-platform-icon-preview').innerHTML = p.icon; document.getElementById('btn-save-platform').innerText = 'Salvar'; document.getElementById('btn-cancel-platform').style.display = 'inline-block'; }
export function cancelEditPlatform() { state.editPlatformIndex = -1; document.getElementById('new-platform-name').value = ''; state.tempPlatformIcon = ''; document.getElementById('new-platform-icon-preview').innerHTML = platformIcons.default; document.getElementById('btn-save-platform').innerText = 'Add'; document.getElementById('btn-cancel-platform').style.display = 'none'; }
export function savePlatform() {
    const icon = state.tempPlatformIcon || platformIcons.default;
    const name = document.getElementById('new-platform-name').value;
    if(!name) return;
    saveStateForUndo();
    if (state.editPlatformIndex >= 0) {
        const oldName = appData.platforms[state.editPlatformIndex].name;
        appData.platforms[state.editPlatformIndex] = { name, icon };
        if (oldName !== name) { appData.games.forEach(g => { if (g.platform === oldName) g.platform = name; }); }
    } else { appData.platforms.push({ name, icon }); }
    cancelEditPlatform(); renderPlatformAdmin(); saveData(() => render());
}
export function removePlatform(index) { if(confirm("Remover esta plataforma? Jogos nela continuarão existindo, mas sem o ícone correto.")) { saveStateForUndo(); appData.platforms.splice(index, 1); renderPlatformAdmin(); saveData(() => render()); } }
