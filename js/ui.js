import { icon, platformIcons } from './icons.js';
import { getSession } from './session.js';
import { detectNewAchievements, renderAchievements } from './achievements.js';
import { renderGenreStats } from './genres.js';
import { applyTheme, renderThemePicker } from './themes.js';
import { phHtml, openIconPicker } from './phosphor.js';
import { platformLabel } from './platforms.js';
import { getMatches, filtersActive, describeFilters, renderQuickMatch } from './quickmatch.js';
import { searchGames, getGameDetails, coverToDataURL, fileToSmallJpeg, esc, resizeUrl, describeError, getRawgKey, setRawgKey, hasCustomRawgKey } from './gameApi.js';
import { openCoverPicker, getSgdbKey } from './covers.js';
import { renderFranchiseStats } from './franchises.js';
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
export function triggerToast(message, withUndo = true) {
    const toast = document.getElementById('undo-toast'); 
    document.getElementById('undo-message').innerText = message;
    toast.querySelector('.btn-undo').style.display = withUndo ? '' : 'none';
    toast.classList.add('show'); 
    clearTimeout(toastTimeout); 
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 6000);
}

export function checkWelcome() { if (!localStorage.getItem('zeralog_welcomed')) document.getElementById('modal-welcome').showModal(); }
export function closeWelcome() { localStorage.setItem('zeralog_welcomed', 'true'); closeModal('modal-welcome'); }
export function closeModal(id) { document.getElementById(id).close(); }
export function changeTheme(theme) {
    applyTheme(theme);
    if (document.getElementById('tab-stats').classList.contains('active')) updateStatsAndCharts();   // gráficos pegam as cores do tema
}

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
let pendingRawgId = null;  // id da RAWG do jogo escolhido na busca automática
let lastResults = [];

function updateCoverPreview(src) {
    const el = document.getElementById('game-cover-preview');
    el.innerHTML = src ? `<img src="${esc(src)}" alt="Capa">` : '';
    el.style.display = src ? 'block' : 'none';
}

function resetAutoFill() {
    pendingCover = null;
    pendingRawgId = null;
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

// Preenche o formulário com um jogo da RAWG (busca automática ou sugestão de franquia)
export async function applyRawgGame(base) {
    const box = document.getElementById('rawg-results');
    box.innerHTML = '<div class="rawg-msg">Carregando dados...</div>';
    let g = base;
    try { g = { ...base, ...(await getGameDetails(base.rawgId)) }; } catch (e) { /* segue só com os dados da busca */ }
    pendingRawgId = g.rawgId || null;

    document.getElementById('game-title').value = g.title;
    document.getElementById('game-description').value = g.description || '';
    document.getElementById('game-genres').value = (g.genres || []).join(', ');
    document.getElementById('game-released').value = g.released || '';
    document.getElementById('game-metacritic').value = g.metacritic ?? '';
    if (g.playtime && !document.getElementById('game-time-val').value) {
        document.getElementById('game-time-val').value = g.playtime;
        document.getElementById('game-time-unit').value = 'h';
    }
    document.getElementById('game-extra').open = true;
    if (g.image) { pendingCover = await coverToDataURL(g.image); updateCoverPreview(pendingCover); }
    box.innerHTML = `<div class="rawg-msg rawg-ok">${icon('check')} Dados de <strong>${esc(g.title)}</strong> preenchidos. Revise e salve.</div>`;
}

export async function pickRawgResult(i) {
    const base = lastResults[i];
    if (base) await applyRawgGame(base);
}

// Abre o cadastro (jogo ou desejo) já preenchido com uma sugestão de franquia
export async function openAddFromSuggestion(kind, item, franchise) {
    let catId = 'wishlist';
    if (kind !== 'wish') {
        const counts = {};
        appData.games.filter(g => !g.continuous && g.franchise && normKey(g.franchise) === normKey(franchise)).forEach(g => { counts[g.catId] = (counts[g.catId] || 0) + 1; });
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        catId = best ? best[0] : (appData.categories[0] && appData.categories[0].id);
        if (!catId) { triggerToast('Crie uma categoria na aba Fila antes de adicionar jogos.', false); return; }
    }
    openGameModal(catId);
    document.getElementById('game-franchise').value = franchise;
    await applyRawgGame(item);
}

// Buscador de capas verticais (Wikipédia, Steam, SteamGridDB...)
export function coverPickFromGameModal() {
    openCoverPicker({
        title: document.getElementById('game-title').value.trim(),
        rawgId: pendingRawgId,
        onPick: src => { pendingCover = src; updateCoverPreview(src); }
    });
}
export function coverPickFromImageModal() {
    const id = document.getElementById('edit-img-game-id').value;
    const game = appData.games.find(g => g.id === id);
    if (!game) return;
    openCoverPicker({
        title: game.title,
        rawgId: game.rawgId,
        onPick: src => {
            saveStateForUndo();
            game.image = src;
            closeModal('modal-image');
            saveData(() => render());
            triggerToast('Capa atualizada.');
        }
    });
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
        cat.querySelectorAll('.game-item, .tl-item, .shelf-item').forEach(item => {
            const titleMatch = item.querySelector('.game-title').innerText.toLowerCase().includes(term) || (item.dataset.franchise || '').includes(term) || (item.dataset.tags || '').includes(term);
            const platformMatch = state.currentPlatformFilter === 'All' || item.dataset.platform === state.currentPlatformFilter;
            const portableMatch = !state.filterPortableOnly || item.dataset.portable === 'true';
            
            if (titleMatch && platformMatch && portableMatch) { item.style.display = ''; hasVisibleGames = true; } 
            else { item.style.display = 'none'; }
        });
        if (term !== '' || state.currentPlatformFilter !== 'All' || state.filterPortableOnly) { 
            cat.style.display = hasVisibleGames ? 'block' : 'none'; 
        } else { 
            if (cat.id === 'playing-category') cat.style.display = cat.querySelectorAll('.game-item, .shelf-item').length > 0 ? 'block' : 'none'; 
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

    const playingGames = getSortedGames(appData.games.filter(g => g.state === 'playing' && !g.continuous), null, false);
    const playingCatDiv = document.createElement('div');
    playingCatDiv.className = `category ${appData.collapsedCats.includes('playing-category') ? 'collapsed' : ''}`; playingCatDiv.id = 'playing-category';
    if(playingGames.length > 0) playingCatDiv.style.display = 'block';
    playingCatDiv.innerHTML = `<div class="category-header" onclick="toggleCollapse('playing-category', event)"><div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span><h2>Jogando Atualmente</h2></div></div><div class="game-list-wrapper"><ul class="game-list" id="list-playing"></ul></div>`;
    containerHome.appendChild(playingCatDiv);
    const listPlaying = playingCatDiv.querySelector('#list-playing'); fillList(listPlaying, playingGames);

    // Seção de Jogos Contínuos (live service / sandbox): só horas e diário, sem "Zerado"
    const contGames = appData.games.filter(g => g.continuous).sort((a, b) => hoursNum(b.hoursPlayed) - hoursNum(a.hoursPlayed));
    if (contGames.length) {
        const total = contGames.reduce((a, g) => a + hoursNum(g.hoursPlayed), 0);
        const contDiv = document.createElement('div');
        contDiv.className = `category continuous ${appData.collapsedCats.includes('continuous-category') ? 'collapsed' : ''}`; contDiv.id = 'continuous-category';
        contDiv.innerHTML = `<div class="category-header" onclick="toggleCollapse('continuous-category', event)"><div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span><h2>Jogos Contínuos</h2><span class="chip chip-live">${fmtHours(total)} jogadas</span></div><div class="cat-actions"><button onclick="openGameModal('continuous')">+ Jogo</button></div></div><div class="game-list-wrapper"><ul class="game-list" id="list-continuous"></ul></div>`;
        containerHome.appendChild(contDiv);
        const listCont = contDiv.querySelector('#list-continuous'); fillList(listCont, contGames);
    } else {
        const addDiv = document.createElement('div');
        addDiv.className = 'add-continuous-wrap';
        addDiv.innerHTML = `<button type="button" class="add-continuous" onclick="openGameModal('continuous')">+ Jogo Contínuo <small>(live service / sandbox infinito)</small></button>`;
        containerHome.appendChild(addDiv);
    }

    appData.categories.forEach(cat => {
        const catGames = getSortedGames(appData.games.filter(g => g.catId === cat.id && g.state === null && !g.continuous), null, false);
        const catDiv = document.createElement('div'); catDiv.className = `category ${appData.collapsedCats.includes(cat.id) ? 'collapsed' : ''}`; catDiv.id = cat.id;
        catDiv.innerHTML = `
            <div class="category-header" onclick="toggleCollapse('${cat.id}', event)">
                <div class="cat-title-area"><span class="chevron">${icon('chevron', { size: '1em' })}</span>${cat.icon ? `<span class="cat-ico">${phHtml(cat.icon)}</span>` : ''}<h2>${esc(cat.name)}</h2></div>
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
        const listEl = catDiv.querySelector(`#list-${cat.id}`); fillList(listEl, catGames);
    });

    renderWishlist();
    renderQuickMatch();
    renderViewToggles();
    renderFinishedTab();
    filterGames();
    checkNewAchievements();
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

    const view = ['timeline', 'shelf'].includes(appData.settings.finishedView) ? appData.settings.finishedView : 'list';
    ['list', 'timeline', 'shelf'].forEach(v => document.getElementById(`fin-view-${v}`).classList.toggle('active', view === v));
    document.getElementById('fin-sort-bar').style.display = view === 'timeline' ? 'none' : '';

    if (finishedGames.length === 0) {
        finishedContainer.innerHTML = `<div class="empty-state">Nenhum jogo finalizado ainda. Hora de focar no backlog!</div>`;
        return;
    }
    if (view === 'timeline') { renderTimeline(finishedContainer, finishedGames); return; }

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
        fillList(listEl, years[year], view === 'shelf');
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

const DIFF_LABELS = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', extreme: 'Extremo' };
const CONSOLES = ['NES', 'Super Nintendo', 'Nintendo 64', 'GameCube', 'Wii', 'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS', 'Master System', 'Mega Drive', 'Saturn', 'Dreamcast', 'PlayStation', 'PlayStation 2', 'PlayStation Portable', 'Neo Geo', 'Arcade', 'Atari 2600', 'PC Engine'];

// Selos extras (emulado, console original, dificuldade) usados em todos os cards
// Texto pesquisável (sem acento e com acento) para a barra de busca
export function tagsOf(g) {
    const parts = [];
    if (g.emulated) parts.push('emulado', g.originalConsole || '');
    if (g.difficulty && DIFF_LABELS[g.difficulty]) parts.push(DIFF_LABELS[g.difficulty], 'dificuldade');
    if (g.continuous) parts.push('contínuo', 'continuo', 'live service', 'sandbox');
    const t = parts.join(' ').toLowerCase();
    return t + ' ' + t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function flagChips(g) {
    const out = [];
    if (g.emulated) out.push(`<span class="chip chip-emu" title="Jogado em emulador">Emulado${g.originalConsole ? ' · ' + esc(g.originalConsole) : ''}</span>`);
    if (g.difficulty && DIFF_LABELS[g.difficulty]) out.push(`<span class="chip chip-diff chip-diff-${esc(g.difficulty)}" title="Dificuldade">${DIFF_LABELS[g.difficulty]}</span>`);
    return out;
}
const hoursNum = h => { const n = parseFloat(String(h || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtHours = n => (Math.round(n * 10) / 10).toString().replace('.', ',') + 'h';

const fmtTime = t => String(t).endsWith('m') ? `${String(t).slice(0, -1)} min` : String(t);

export function createGameElement(game) {
    const li = document.createElement('li');
    li.className = 'game-item';
    li.dataset.platform = game.platform;
    li.dataset.portable = game.isPortable ? 'true' : 'false';
    li.dataset.franchise = (game.franchise || '').toLowerCase();
    li.dataset.tags = tagsOf(game);

    const finished = game.state === 'finished';
    const isPlaying = game.state === 'playing' ? 'checked' : '';
    const isFinished = finished ? 'checked' : '';
    const title = esc(game.title);

    const cover = game.image
        ? `<img src="${esc(game.image)}" alt="" class="gi-cover" onclick="openImageModal('${game.id}')" title="Trocar capa">`
        : `<div class="gi-cover gi-cover-empty" onclick="openImageModal('${game.id}')" title="Adicionar capa">${esc((game.title.trim()[0] || '?').toUpperCase())}</div>`;

    // Linha secundária: plataforma · ano · gênero · tempo estimado
    const sub = [platformLabel(game.platform)];
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
    } else if (game.continuous) {
        progress = `<div class="gi-hours"><strong>${fmtHours(hoursNum(game.hoursPlayed))}</strong> jogadas</div>`;
    } else if (game.hoursPlayed) {
        progress = `<div class="gi-progress"><small>${esc(game.hoursPlayed)}h jogadas</small></div>`;
    }

    // Etiquetas
    const chips = [];
    if (game.continuous) chips.push('<span class="chip chip-live">Contínuo</span>');
    if (game.franchise) chips.push(franchiseChip(game.franchise));
    chips.push(...flagChips(game));
    if (game.metacritic) chips.push(`<span class="chip score ${game.metacritic >= 75 ? 'good' : game.metacritic >= 50 ? 'mid' : 'bad'}" title="Nota Metacritic">Metacritic ${esc(game.metacritic)}</span>`);
    if (game.isPortable) chips.push('<span class="chip chip-accent">Portátil</span>');
    if (finished) {
        const originCat = appData.categories.find(c => c.id === game.catId);
        if (originCat) chips.push(`<span class="chip">${esc(originCat.name)}</span>`);
        if (game.is100) chips.push('<span class="chip chip-gold">100%</span>');
        if (game.userRating) chips.push(`<span class="chip chip-gold">Nota ${esc(game.userRating)}/10</span>`);
        if (game.dateFinished) chips.push(`<span class="chip">Zerado em ${esc(game.dateFinished)}</span>`);
    }

    const sess = getSession();
    const running = !!(sess && sess.gameId === game.id);
    const playBtn = (game.state === 'playing' && !game.continuous)
        ? (running
            ? `<button type="button" class="icon-btn session-running" onclick="openEndSession()" title="Encerrar sessão" aria-label="Encerrar sessão">${icon('stop', { size: '18px' })}</button>`
            : `<button type="button" class="icon-btn" onclick="startSession('${game.id}')" title="Iniciar sessão de jogo" aria-label="Iniciar sessão de jogo">${icon('play', { size: '18px' })}</button>`)
        : '';
    if (running) chips.unshift('<span class="chip chip-accent">Em sessão</span>');
    const infoBtn = `<button type="button" class="icon-btn" onclick="openEditGameModal('${game.id}')" title="Dados do jogo (editar / buscar automático)" aria-label="Dados do jogo">${icon('info', { size: '18px' })}</button>`;
    const wikiBtn = playBtn + `<button type="button" class="icon-btn" onclick="openWiki('${game.id}')" title="Wiki do jogo" aria-label="Wiki do jogo">${icon('search', { size: '18px' })}</button>`;
    const editBtn = wikiBtn + (finished
        ? `<button type="button" class="icon-btn" onclick="openCardGenerator('${game.id}')" title="Compartilhar" aria-label="Compartilhar">${ICONS.share}</button>
           ${infoBtn}
           <button type="button" class="icon-btn" onclick="openEditFinishedModal('${game.id}')" title="Editar conclusão (nota, data, review)" aria-label="Editar conclusão">${ICONS.edit}</button>`
        : `<button type="button" class="icon-btn" onclick="openEditGameModal('${game.id}')" title="Editar" aria-label="Editar">${ICONS.edit}</button>`);

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

    const statusRow = game.continuous
        ? `<div class="gi-status">
                ${running
                    ? '<button type="button" class="pill-btn session-live" onclick="openEndSession()">Encerrar sessão</button>'
                    : `<button type="button" class="pill-btn primary" onclick="startSession('${game.id}')">Iniciar sessão</button>`}
                <button type="button" class="pill-btn" onclick="openJournalEntry('${game.id}')">Anotar no diário</button>
            </div>`
        : `<div class="gi-status">
                <label class="pill pill-playing"><input type="checkbox" class="chk-playing" onchange="toggleState('${game.id}', 'playing')" ${isPlaying}><span>Jogando</span></label>
                <label class="pill pill-finished"><input type="checkbox" class="chk-finished" onchange="toggleState('${game.id}', 'finished')" ${isFinished}><span>Zerado</span></label>
            </div>`;

    li.innerHTML = `
        ${cover}
        <div class="gi-body">
            <div class="game-title">${title}</div>
            <div class="gi-sub">${sub.join('<span class="dot">·</span>')}</div>
            ${chips.length ? `<div class="gi-chips">${chips.join('')}</div>` : ''}
            ${progress}
            ${statusRow}
        </div>
        <div class="gi-actions">${editBtn}<button type="button" class="icon-btn danger" onclick="askDeleteGame('${game.id}')" title="Remover" aria-label="Remover">${ICONS.trash}</button></div>
        ${journal}
        ${desc}
    `;
    return li;
}

// ================= STATS E CONQUISTAS =================
let achQueue = [], achBusy = false;
export function notifyAchievement(name) {
    achQueue.push(name);
    if (!achBusy) nextAchievement();
}
function nextAchievement() {
    const name = achQueue.shift();
    const el = document.getElementById('achievement-notif');
    if (!name) { achBusy = false; return; }
    achBusy = true;
    document.getElementById('ach-notif-name').innerText = name;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(nextAchievement, 450); }, 3500);
}

export function checkNewAchievements() {
    const wasSeeded = appData.achSeeded;
    const before = (appData.unlockedAchievements || []).length;
    const fresh = detectNewAchievements();
    if (!wasSeeded || appData.unlockedAchievements.length !== before) saveData(null);
    fresh.forEach(a => notifyAchievement(a.name));
}

export function setStatsPane(p) {
    appData.settings.statsPane = p;
    saveData(null);
    updateStatsAndCharts();
}

function applyStatsPane() {
    const p = ['overview', 'genres', 'franchises', 'continuous', 'achievements'].includes(appData.settings.statsPane) ? appData.settings.statsPane : 'overview';
    document.querySelectorAll('#stats-subnav button').forEach(b => { const on = b.dataset.pane === p; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.stats-pane').forEach(s => s.classList.toggle('active', s.dataset.pane === p));
    return p;
}

export function updateStorageMeter() {
    let bytes = 0;
    try { bytes = new Blob([localStorage.getItem('myBacklogData') || '']).size; } catch (e) {}
    const limit = 5 * 1024 * 1024;
    const pct = Math.min(100, Math.round(bytes / limit * 100));
    document.getElementById('storage-bar').style.width = pct + '%';
    document.getElementById('storage-text').textContent = `${(bytes / 1048576).toFixed(2).replace('.', ',')} MB de ~5 MB (${pct}%). Se encher, faça backup e use capas menores.`;
}

export function updateStatsAndCharts() {
    const pane = applyStatsPane();
    const regularGames = appData.games.filter(g => !g.continuous);
    const filteredGames = regularGames.filter(g => state.currentPlatformFilter === 'All' || g.platform === state.currentPlatformFilter);
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

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (pane === 'overview' && typeof Chart !== 'undefined') {
        const ctx = document.getElementById('statusChart');
        const css = getComputedStyle(document.documentElement);
        const textColor = css.getPropertyValue('--text-main').trim();
        const col = n => css.getPropertyValue(n).trim();

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels:['Backlog', 'Jogando', 'Finalizados'],
                datasets:[{ data:[backlog, playing, finished], backgroundColor:[col('--accent-add'), col('--accent-playing'), col('--accent-finished')], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor } } } }
        });
    }

    renderAchievements();
    if (pane === 'genres') renderGenreStats();
    renderContinuousStats();
    renderFranchiseStats();
    const contCount = appData.games.filter(g => g.continuous).length;
    document.getElementById('sn-continuous').textContent = contCount || '';
}

// ================= CRUD JOGOS E CATEGORIAS =================
let catIconDraft = null;
function paintCatIcon() {
    const el = document.getElementById('cat-icon-preview');
    el.innerHTML = catIconDraft ? phHtml(catIconDraft) : '<span class="icon-none">Sem ícone</span>';
    document.getElementById('cat-icon-clear').style.display = catIconDraft ? '' : 'none';
}
export function pickCategoryIcon() {
    openIconPicker({ current: catIconDraft, onPick: ic => { catIconDraft = ic; paintCatIcon(); } });
}
export function clearCategoryIcon() { catIconDraft = null; paintCatIcon(); }
export function openCatModal() { document.getElementById('cat-modal-title').innerText = 'Nova Categoria'; document.getElementById('edit-cat-id').value = ''; document.getElementById('cat-name').value = ''; catIconDraft = null; paintCatIcon(); document.getElementById('modal-cat').showModal(); }
export function openEditCatModal(catId) { const cat = appData.categories.find(c => c.id === catId); document.getElementById('cat-modal-title').innerText = 'Editar Categoria'; document.getElementById('edit-cat-id').value = cat.id; document.getElementById('cat-name').value = cat.name; catIconDraft = cat.icon ? { ...cat.icon } : null; paintCatIcon(); document.getElementById('modal-cat').showModal(); }
export function saveCategory() {
    const name = document.getElementById('cat-name').value.trim();
    const editId = document.getElementById('edit-cat-id').value;
    if (!name) return;
    saveStateForUndo();
    if (editId) {
        const cat = appData.categories.find(c => c.id === editId);
        if (cat) { cat.name = name; if (catIconDraft) cat.icon = catIconDraft; else delete cat.icon; }
    } else {
        const cat = { id: 'c' + Date.now(), name };
        if (catIconDraft) cat.icon = catIconDraft;
        appData.categories.push(cat);
    }
    closeModal('modal-cat');
    saveData(() => render());
    triggerToast(editId ? 'Categoria atualizada.' : 'Categoria criada.');
}
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

const normKey = s => String(s).trim().toLowerCase();

function franchiseNames() {
    const map = new Map();
    [...appData.games, ...(appData.wishlist || [])].forEach(g => {
        const f = (g.franchise || '').trim();
        if (f && !map.has(normKey(f))) map.set(normKey(f), f);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
}

const canonicalFranchise = raw => { const t = raw.trim(); return franchiseNames().find(f => normKey(f) === normKey(t)) || t; };

// Prepara o modal compartilhado entre "jogo" (fila) e "desejo" (wishlist)
function prepareGameModal(mode) {
    const wish = mode === 'wish';
    document.getElementById('game-mode').value = mode;
    document.getElementById('game-play-fields').style.display = wish ? 'none' : '';
    document.getElementById('game-wish-fields').style.display = wish ? '' : 'none';
    document.getElementById('franchise-list').innerHTML = franchiseNames().map(f => `<option value="${esc(f)}"></option>`).join('');
    document.getElementById('game-wish-cat').innerHTML = appData.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    document.getElementById('game-platform').innerHTML = appData.platforms.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    document.getElementById('console-list').innerHTML = [...new Set([...CONSOLES, ...appData.platforms.map(p => p.name)])].map(c => `<option value="${esc(c)}"></option>`).join('');
    document.getElementById('game-continuous').disabled = false;
}

export function toggleModalFlags() {
    const cont = document.getElementById('game-continuous').checked;
    document.getElementById('game-time-fields').style.display = cont ? 'none' : '';
    document.getElementById('game-emu-fields').style.display = document.getElementById('game-emulated').checked ? 'block' : 'none';
}

function resetFlagFields() {
    document.getElementById('game-continuous').checked = false;
    document.getElementById('game-emulated').checked = false;
    document.getElementById('game-orig-console').value = '';
    document.getElementById('game-difficulty').value = '';
}

export function openGameModal(catId) {
    const wish = catId === 'wishlist';
    document.getElementById('game-modal-title').innerText = wish ? 'Adicionar à Wishlist' : (catId === 'continuous' ? 'Adicionar Jogo Contínuo' : 'Adicionar Jogo');
    document.getElementById('edit-game-id').value = '';
    document.getElementById('game-cat-id').value = catId;
    document.getElementById('game-title').value = '';
    document.getElementById('game-time-val').value = '';
    document.getElementById('game-time-unit').value = 'h';
    resetAutoFill();
    document.getElementById('game-franchise').value = '';
    document.getElementById('game-wish-note').value = '';
    document.getElementById('game-is-portable-backlog').checked = false;
    prepareGameModal(wish ? 'wish' : 'game');
    resetFlagFields();
    document.getElementById('game-continuous').checked = catId === 'continuous';
    toggleModalFlags();
    document.getElementById('modal-game').showModal();
}

export function openEditWishModal(id) { openEditGameModal(id, true); }

export function openEditGameModal(gameId, isWish = false) {
    const game = (isWish ? appData.wishlist : appData.games).find(g => g.id === gameId);
    if (!game) return;
    document.getElementById('game-modal-title').innerText = isWish ? 'Editar Desejo' : 'Editar Informações';
    document.getElementById('edit-game-id').value = gameId;
    document.getElementById('game-cat-id').value = isWish ? 'wishlist' : game.catId;
    document.getElementById('game-title').value = game.title;
    document.getElementById('game-is-portable-backlog').checked = game.isPortable || false;
    resetAutoFill();
    prepareGameModal(isWish ? 'wish' : 'game');
    document.getElementById('game-franchise').value = game.franchise || '';
    resetFlagFields();
    document.getElementById('game-continuous').checked = !!game.continuous;
    document.getElementById('game-continuous').disabled = game.state === 'finished';   // zerado não vira contínuo
    document.getElementById('game-emulated').checked = !!game.emulated;
    document.getElementById('game-orig-console').value = game.originalConsole || '';
    document.getElementById('game-difficulty').value = game.difficulty || '';
    toggleModalFlags();
    document.getElementById('game-hours-played').value = game.hoursPlayed || '';
    document.getElementById('game-journal-notes').value = game.journalNotes || '';
    document.getElementById('game-description').value = game.description || '';
    document.getElementById('game-genres').value = (game.genres || []).join(', ');
    document.getElementById('game-released').value = game.released || '';
    document.getElementById('game-metacritic').value = game.metacritic ?? '';
    document.getElementById('game-extra').open = !!(game.description || (game.genres && game.genres.length) || game.released || game.metacritic);
    updateCoverPreview(game.image);
    if (isWish) {
        document.getElementById('game-wish-note').value = game.note || '';
        if (game.catId) document.getElementById('game-wish-cat').value = game.catId;
    }
    document.getElementById('game-platform').value = game.platform;

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
    const wish = val('game-mode') === 'wish';
    const title = val('game-title').trim();
    if (!title) return;

    const continuous = document.getElementById('game-continuous').checked;
    const emulated = document.getElementById('game-emulated').checked;
    const timeVal = val('game-time-val');
    const base = {
        platform: val('game-platform'),
        meta: (timeVal && !continuous) ? `${timeVal}${val('game-time-unit')}` : '',
        isPortable: document.getElementById('game-is-portable-backlog').checked,
        continuous,
        emulated,
        originalConsole: emulated ? val('game-orig-console').trim() : '',
        difficulty: val('game-difficulty'),
        description: val('game-description').trim(),
        genres: val('game-genres').split(',').map(x => x.trim()).filter(Boolean),
        released: val('game-released'),
        metacritic: val('game-metacritic') === '' ? null : Number(val('game-metacritic')),
        franchise: canonicalFranchise(val('game-franchise'))
    };
    if (continuous && gameId && !wish) {
        const cur = appData.games.find(g => g.id === gameId);
        if (cur && cur.state === 'finished') { triggerToast('Jogos zerados não podem virar contínuos.', false); return; }
    }
    saveStateForUndo();
    const idPatch = pendingRawgId ? { rawgId: pendingRawgId } : {};

    if (wish) {
        const extra = { ...base, ...idPatch, catId: val('game-wish-cat') || (appData.categories[0] && appData.categories[0].id) || '', note: val('game-wish-note').trim() };
        if (gameId) {
            const item = appData.wishlist.find(g => g.id === gameId);
            if (item) { Object.assign(item, extra, { title }); if (pendingCover) item.image = pendingCover; }
        } else {
            appData.wishlist.push({ id: 'w' + Date.now(), title, ...extra, image: pendingCover || null, addedAt: Date.now() });
        }
    } else {
        const extra = { ...base, ...idPatch, hoursPlayed: val('game-hours-played'), journalNotes: val('game-journal-notes') };
        const existing = gameId ? appData.games.find(g => g.id === gameId) : null;
        // Jogos contínuos vivem em "continuous"; ao desmarcar, voltam para a categoria de origem
        let cat = existing ? existing.catId : catId;
        let homeCatId = existing ? existing.homeCatId : undefined;
        if (continuous) {
            if (cat !== 'continuous') homeCatId = cat;
            else if (!homeCatId && appData.categories[0]) homeCatId = appData.categories[0].id;
            cat = 'continuous';
        } else if (cat === 'continuous') {
            const back = appData.categories.find(c => c.id === homeCatId) || appData.categories[0];
            if (!back) { triggerToast('Crie uma categoria na aba Fila antes de desmarcar "Jogo Contínuo".', false); return; }
            cat = back.id;
        }
        if (gameId) {
            const game = existing;
            if (game) {
                Object.assign(game, extra, { title, catId: cat, homeCatId });
                if (continuous && game.state !== 'finished') game.state = null;
                if (pendingCover) game.image = pendingCover;
            }
        } else {
            appData.games.push({
                id: 'g' + Date.now(), catId: cat, homeCatId, title, ...extra,
                state: null, image: pendingCover || null, userRating: null, dateFinished: null,
                is100: false, review: ''
            });
        }
    }
    pendingCover = null;
    pendingRawgId = null;
    closeModal('modal-game'); saveData(() => render());
    triggerToast(gameId ? 'Informações atualizadas.' : (wish ? 'Adicionado à wishlist.' : 'Jogo adicionado com sucesso!'));
}

// ================= PRATELEIRA (SHELF VIEW) =================
export function fillList(listEl, games, shelf = appData.settings.homeView === 'shelf') {
    listEl.classList.toggle('shelf', !!shelf);
    games.forEach(g => listEl.appendChild(shelf ? createShelfItem(g) : createGameElement(g)));
}

export function renderViewToggles() {
    const v = appData.settings.homeView === 'shelf' ? 'shelf' : 'list';
    document.getElementById('home-view-list').classList.toggle('active', v === 'list');
    document.getElementById('home-view-shelf').classList.toggle('active', v === 'shelf');
}

export function createShelfItem(g) {
    const li = document.createElement('li');
    const sess = getSession();
    const live = !!(sess && sess.gameId === g.id);
    li.className = `shelf-item${g.is100 ? ' is100' : ''}`;
    li.dataset.platform = g.platform;
    li.dataset.portable = g.isPortable ? 'true' : 'false';
    li.dataset.franchise = (g.franchise || '').toLowerCase();
    li.dataset.tags = tagsOf(g);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', g.title);
    li.title = g.title;
    li.onclick = () => openShelfDetail(g.id);
    li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openShelfDetail(g.id); } };
    const badges = [];
    if (g.is100) badges.push(`<span class="shelf-badge gold">${icon('star', { size: '10px' })}100%</span>`);
    if (g.state === 'finished' && g.userRating) badges.push(`<span class="shelf-badge">${esc(g.userRating)}</span>`);
    li.innerHTML = `
        <div class="cart">
            <div class="cart-label">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : `<span class="cart-empty">${esc(g.title)}</span>`}</div>
            ${badges.length ? `<div class="shelf-badges">${badges.join('')}</div>` : ''}
            ${live ? '<span class="shelf-live" title="Em sessão"></span>' : (g.state === 'playing' ? '<span class="shelf-playing" title="Jogando"></span>' : '')}
        </div>
        <span class="game-title sr-only">${esc(g.title)}</span>`;
    return li;
}

export function openShelfDetail(id) {
    const g = appData.games.find(x => x.id === id);
    if (!g) return;
    const finished = g.state === 'finished';
    const sub = [platformLabel(g.platform)];
    if (g.released) sub.push(esc(g.released.slice(0, 4)));
    if (g.genres && g.genres.length) sub.push(esc(g.genres.slice(0, 3).join(', ')));
    const chips = [];
    if (g.continuous) chips.push('<span class="chip chip-live">Contínuo</span>');
    if (finished) chips.push('<span class="chip" style="color:var(--accent-finished);border-color:var(--accent-finished)">Zerado</span>');
    else if (g.state === 'playing') chips.push('<span class="chip chip-accent">Jogando</span>');
    if (g.franchise) chips.push(`<span class="chip chip-franchise">${esc(g.franchise)}</span>`);
    chips.push(...flagChips(g));
    if (g.metacritic) chips.push(scoreChip(g.metacritic));
    if (g.is100) chips.push('<span class="chip chip-gold">100%</span>');
    if (finished && g.userRating) chips.push(`<span class="chip chip-gold">Nota ${esc(g.userRating)}/10</span>`);
    const facts = [];
    if (finished && g.dateFinished) facts.push(`Zerado em <strong>${esc(g.dateFinished)}</strong>`);
    if (g.meta) facts.push(`Tempo estimado <strong>${esc(fmtTime(g.meta))}</strong>`);
    if (g.hoursPlayed) facts.push(`Jogadas <strong>${esc(fmtHours(hoursNum(g.hoursPlayed)))}</strong>`);
    const text = finished && g.review ? g.review : g.journalNotes;
    const btn = (label, fn, primary) => `<button type="button" class="pill-btn ${primary ? 'primary' : ''}" onclick="shelfDo('${fn}', '${g.id}')">${label}</button>`;
    const actions = [];
    if (g.continuous || g.state === 'playing') actions.push(btn('Iniciar sessão', 'startSession', true));
    if (!finished && !g.continuous && g.state !== 'playing') actions.push(btn('Jogar agora', 'playNow', true));
    if (finished) actions.push(btn('Compartilhar', 'openCardGenerator', true));
    actions.push(btn('Wiki', 'openWiki'), btn('Dados do jogo', 'openEditGameModal'));
    if (finished) actions.push(btn('Editar conclusão', 'openEditFinishedModal'));
    document.getElementById('shelf-detail-body').innerHTML = `
        <div class="sd-top">
            ${g.image ? `<img class="sd-cover" src="${esc(g.image)}" alt="">` : `<div class="sd-cover sd-empty">${esc((g.title.trim()[0] || '?').toUpperCase())}</div>`}
            <div class="sd-info"><h3>${esc(g.title)}</h3><div class="gi-sub">${sub.join('<span class="dot">·</span>')}</div><div class="gi-chips">${chips.join('')}</div></div>
        </div>
        ${facts.length ? `<div class="sd-facts">${facts.join('<span class="dot">·</span>')}</div>` : ''}
        ${text ? `<div class="sd-text">${esc(text)}</div>` : ''}
        <div class="sd-actions">${actions.join('')}</div>`;
    const dlg = document.getElementById('modal-shelf');
    if (!dlg.open) dlg.showModal();
}

export function shelfDo(fn, id) {
    closeModal('modal-shelf');
    if (fn === 'playNow') { toggleState(id, 'playing'); return; }
    if (typeof window[fn] === 'function') window[fn](id);
}

// ================= WISHLIST =================
const scoreChip = m => `<span class="chip score ${m >= 75 ? 'good' : m >= 50 ? 'mid' : 'bad'}" title="Nota Metacritic">Metacritic ${esc(m)}</span>`;
const franchiseChip = name => `<span class="chip chip-franchise" data-f="${esc(name)}" onclick="filterByFranchise(this.dataset.f)" title="Ver jogos da franquia">${esc(name)}</span>`;

export function createWishElement(w) {
    const li = document.createElement('li');
    li.className = 'game-item';
    li.dataset.platform = w.platform;
    li.dataset.portable = w.isPortable ? 'true' : 'false';
    li.dataset.franchise = (w.franchise || '').toLowerCase();
    li.dataset.tags = tagsOf(w);

    const cover = w.image
        ? `<img src="${esc(w.image)}" alt="" class="gi-cover" style="cursor:default">`
        : `<div class="gi-cover gi-cover-empty" style="cursor:default">${esc((w.title.trim()[0] || '?').toUpperCase())}</div>`;
    const sub = [platformLabel(w.platform)];
    if (w.released) sub.push(esc(w.released.slice(0, 4)));
    if (w.genres && w.genres.length) sub.push(esc(w.genres.slice(0, 2).join(', ')));
    if (w.meta) sub.push(`${esc(fmtTime(w.meta))} p/ zerar`);
    const chips = [];
    if (w.continuous) chips.push('<span class="chip chip-live">Contínuo</span>');
    if (w.franchise) chips.push(franchiseChip(w.franchise));
    chips.push(...flagChips(w));
    if (w.metacritic) chips.push(scoreChip(w.metacritic));
    if (w.isPortable) chips.push('<span class="chip chip-accent">Portátil</span>');

    li.innerHTML = `
        ${cover}
        <div class="gi-body">
            <div class="game-title">${esc(w.title)}</div>
            <div class="gi-sub">${sub.join('<span class="dot">·</span>')}</div>
            ${chips.length ? `<div class="gi-chips">${chips.join('')}</div>` : ''}
            ${w.note ? `<div class="wish-note">${esc(w.note)}</div>` : ''}
            <div class="gi-status">
                <button type="button" class="pill-btn primary" onclick="wishToBacklog('${w.id}')">Para a fila</button>
                <button type="button" class="pill-btn" onclick="wishToPlaying('${w.id}')">Jogar agora</button>
            </div>
        </div>
        <div class="gi-actions">
            <button type="button" class="icon-btn" onclick="openWiki('${w.id}')" title="Wiki do jogo" aria-label="Wiki do jogo">${icon('search', { size: '18px' })}</button>
            <button type="button" class="icon-btn" onclick="openEditWishModal('${w.id}')" title="Editar" aria-label="Editar">${ICONS.edit}</button>
            <button type="button" class="icon-btn danger" onclick="askDeleteWish('${w.id}')" title="Remover" aria-label="Remover">${ICONS.trash}</button>
        </div>
        ${w.description ? `<details class="game-desc"><summary>Sobre o jogo</summary><p>${esc(w.description)}</p></details>` : ''}
    `;
    return li;
}

export function renderWishlist() {
    const box = document.getElementById('wish-list-container');
    const items = [...(appData.wishlist || [])].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    document.getElementById('count-wish').innerText = items.length;
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<div class="empty-state">Sua wishlist está vazia. Adicione os jogos que pretende comprar ou baixar.</div>'; return; }
    const cat = document.createElement('div');
    cat.className = 'category';
    cat.id = 'wishlist-category';
    cat.innerHTML = '<div class="game-list-wrapper"><ul class="game-list"></ul></div>';
    items.forEach(w => cat.querySelector('ul').appendChild(createWishElement(w)));
    box.appendChild(cat);
}

// Move o desejo para a biblioteca sem redigitar nada (capa, dados e franquia vão junto)
function moveWish(id, toPlaying) {
    const idx = appData.wishlist.findIndex(w => w.id === id);
    if (idx < 0) return;
    const w = appData.wishlist[idx];
    const cat = appData.categories.find(c => c.id === w.catId) || appData.categories[0];
    if (!cat && !w.continuous) { triggerToast('Crie uma categoria na aba Fila antes de mover.'); return; }
    saveStateForUndo();
    const { note, addedAt, catId, ...rest } = w;
    appData.games.push({
        ...rest, id: 'g' + Date.now(), catId: w.continuous ? 'continuous' : cat.id, homeCatId: cat ? cat.id : undefined, hoursPlayed: '', journalNotes: '',
        state: (toPlaying && !w.continuous) ? 'playing' : null, userRating: null, dateFinished: null, is100: false, review: ''
    });
    appData.wishlist.splice(idx, 1);
    appData.counters.wishMoved = (appData.counters.wishMoved || 0) + 1;
    saveData(() => render());
    triggerToast(w.continuous ? 'Movido para Jogos Contínuos.' : (toPlaying ? 'Movido para Jogando.' : `Movido para a fila (${cat.name}).`));
}
export const wishToBacklog = id => moveWish(id, false);
export const wishToPlaying = id => moveWish(id, true);

export function askDeleteWish(id) {
    const w = appData.wishlist.find(x => x.id === id);
    if (w && confirm(`Remover "${w.title}" da wishlist?`)) {
        saveStateForUndo();
        appData.wishlist = appData.wishlist.filter(x => x.id !== id);
        saveData(() => render());
        triggerToast('Excluído.');
    }
}

// ================= LINHA DO TEMPO (ZERADOS) =================
export function setFinishedView(view) { appData.settings.finishedView = ['timeline', 'shelf'].includes(view) ? view : 'list'; saveData(() => render()); }
export function setHomeView(view) { appData.settings.homeView = view === 'shelf' ? 'shelf' : 'list'; saveData(() => render()); }
export function setTimelineDir() { appData.settings.timelineDir = appData.settings.timelineDir === 'asc' ? 'desc' : 'asc'; saveData(() => render()); }

function parseFinishedDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    let y, mo, d, m;
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
    const date = new Date(y, mo - 1, d);
    return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

function renderTimeline(container, finishedGames) {
    const dir = appData.settings.timelineDir === 'asc' ? 1 : -1;
    const items = finishedGames.map((g, i) => ({ g, i, d: parseFinishedDate(g.dateFinished) }));
    items.sort((a, b) => {
        if (!a.d && !b.d) return a.i - b.i;
        if (!a.d) return 1;
        if (!b.d) return -1;
        const diff = a.d - b.d;
        if (diff) return diff * dir;
        const fa = a.g.finishedAt || 0, fb = b.g.finishedAt || 0;
        return fa !== fb ? (fa - fb) * dir : (a.i - b.i) * dir;
    });

    const groups = [];
    items.forEach(it => {
        const key = it.d ? `${it.d.getFullYear()}-${String(it.d.getMonth() + 1).padStart(2, '0')}` : 'none';
        let grp = groups.find(g => g.key === key);
        if (!grp) {
            const label = it.d ? it.d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data';
            grp = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
            groups.push(grp);
        }
        grp.items.push(it);
    });

    const rated = finishedGames.filter(g => g.userRating).map(g => parseFloat(g.userRating)).filter(n => !isNaN(n));
    const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : null;
    const n100 = finishedGames.filter(g => g.is100).length;
    const summary = [`${finishedGames.length} ${finishedGames.length === 1 ? 'jogo' : 'jogos'}`, n100 ? `${n100} com 100%` : '', avg ? `nota média ${avg}` : ''].filter(Boolean).join(' · ');

    const entry = ({ g, d }) => {
        const cover = g.image
            ? `<img src="${esc(g.image)}" alt="" class="gi-cover" onclick="openImageModal('${g.id}')" title="Trocar capa">`
            : `<div class="gi-cover gi-cover-empty" onclick="openImageModal('${g.id}')" title="Adicionar capa">${esc((g.title.trim()[0] || '?').toUpperCase())}</div>`;
        const chips = [];
        if (g.franchise) chips.push(franchiseChip(g.franchise));
        chips.push(...flagChips(g));
        if (g.userRating) chips.push(`<span class="chip chip-gold">Nota ${esc(g.userRating)}/10</span>`);
        if (g.is100) chips.push('<span class="chip chip-gold">100%</span>');
        if (g.isPortable) chips.push('<span class="chip chip-accent">Portátil</span>');
        const sub = [platformLabel(g.platform)];
        if (g.meta) sub.push(esc(fmtTime(g.meta)));
        const when = d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : esc(g.dateFinished || 'Sem data');
        return `<li class="tl-item ${g.is100 ? 'is100' : ''}" data-platform="${esc(g.platform)}" data-portable="${g.isPortable ? 'true' : 'false'}" data-franchise="${esc((g.franchise || '').toLowerCase())}" data-tags="${esc(tagsOf(g))}">
            <span class="tl-dot"></span>
            <div class="tl-date">${when}</div>
            <div class="tl-card">
                ${cover}
                <div class="tl-body">
                    <div class="game-title">${esc(g.title)}</div>
                    <div class="gi-sub">${sub.join('<span class="dot">·</span>')}</div>
                    ${chips.length ? `<div class="gi-chips">${chips.join('')}</div>` : ''}
                    ${g.review ? `<div class="tl-review">${esc(g.review)}</div>` : ''}
                </div>
                <div class="gi-actions">
                    <button type="button" class="icon-btn" onclick="openCardGenerator('${g.id}')" title="Compartilhar" aria-label="Compartilhar">${ICONS.share}</button>
                    <button type="button" class="icon-btn" onclick="openEditGameModal('${g.id}')" title="Dados do jogo (editar / buscar automático)" aria-label="Dados do jogo">${icon('info', { size: '18px' })}</button>
                    <button type="button" class="icon-btn" onclick="openEditFinishedModal('${g.id}')" title="Editar conclusão (nota, data, review)" aria-label="Editar conclusão">${ICONS.edit}</button>
                </div>
            </div>
        </li>`;
    };

    const wrap = document.createElement('div');
    wrap.className = 'category';
    wrap.id = 'finished-timeline';
    wrap.innerHTML = `
        <div class="tl-top">
            <span class="tl-summary">${esc(summary)}</span>
            <button type="button" class="wiki-tool" onclick="setTimelineDir()">${dir === -1 ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}</button>
        </div>
        ${groups.map(grp => `<section class="tl-month"><h3 class="tl-month-title">${esc(grp.label)}<small>${grp.items.length} ${grp.items.length === 1 ? 'jogo' : 'jogos'}</small></h3><ol class="tl-list">${grp.items.map(entry).join('')}</ol></section>`).join('')}
    `;
    container.appendChild(wrap);
}

// ================= JOGOS CONTÍNUOS (HORAS ISOLADAS) =================
export function renderContinuousStats() {
    const box = document.getElementById('continuous-stats');
    if (!box) return;
    const list = appData.games
        .filter(g => g.continuous && (state.currentPlatformFilter === 'All' || g.platform === state.currentPlatformFilter))
        .map(g => ({ g, h: hoursNum(g.hoursPlayed) }))
        .sort((a, b) => b.h - a.h);
    if (!list.length) {
        box.innerHTML = '<div class="franchise-summary">Marque um jogo como "Jogo Contínuo" (live service, sandbox, competitivo) para acompanhar as horas dele separadamente. Esse tempo não afeta Zerados, Fila nem conquistas.</div>';
        return;
    }
    const total = list.reduce((a, x) => a + x.h, 0);
    const max = Math.max(...list.map(x => x.h), 0.0001);
    box.innerHTML = `
        <div class="stats-grid cont-grid">
            <div class="stat-box"><span class="stat-num" style="color: var(--accent-live);">${fmtHours(total)}</span><span class="stat-label">Horas em contínuos</span></div>
            <div class="stat-box"><span class="stat-num" style="color: var(--accent-live);">${list.length}</span><span class="stat-label">${list.length === 1 ? 'Jogo' : 'Jogos'}</span></div>
        </div>
        <div class="franchise-summary">Tempo isolado: não entra em Zerados, Fila nem nas conquistas.</div>
        ${list.map(({ g, h }) => `<div class="fr-item cont-item">
            <div class="fr-head"><strong>${esc(g.title)}</strong><span>${fmtHours(h)} · ${total ? Math.round(h / total * 100) : 0}%</span></div>
            <div class="gi-bar"><span style="width:${Math.round(h / max * 100)}%"></span></div>
        </div>`).join('')}`;
}

// ================= FRANQUIAS (lista e busca em franchises.js) =================
export function filterByFranchise(name) {
    document.getElementById('search-bar').value = name;
    if (document.getElementById('tab-stats').classList.contains('active')) switchTab('home'); else filterGames();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function askDeleteGame(gameId) { const game = appData.games.find(g => g.id === gameId); if(confirm(`Remover "${game.title}"?`)) { saveStateForUndo(); appData.games = appData.games.filter(g => g.id !== gameId); saveData(() => render()); triggerToast('Excluído.'); } }

export function toggleState(gameId, action) { 
    const game = appData.games.find(g => g.id === gameId); 
    if (game && game.continuous) { triggerToast('Jogos contínuos não têm status de Jogando/Zerado: use a sessão de jogo.', false); render(); return; }
    if (action === 'playing') { 
        saveStateForUndo(); 
        game.state = game.state === 'playing' ? null : 'playing'; 
        saveData(() => render()); 
        triggerToast(game.state ? 'Movido para Jogando.' : 'Removido.'); 
    } else if (action === 'finished') { 
        if (game.state === 'finished') { 
            saveStateForUndo(); 
            game.state = null; game.userRating = null; game.dateFinished = null; game.finishedAt = null; game.is100 = false; 
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

export function openGameDataFromFinished() {
    const id = document.getElementById('edit-fin-game-id').value;
    closeModal('modal-edit-finished');
    openEditGameModal(id);
}

export function cancelRating() { closeModal('modal-rating'); render(); }

export function skipRating() { 
    const gameId = document.getElementById('rating-game-id').value; 
    const game = appData.games.find(g => g.id === gameId); 
    saveStateForUndo(); 
    if (game) { 
        game.state = 'finished'; 
        game.dateFinished = new Date().toLocaleDateString('pt-BR'); 
        game.finishedAt = Date.now();
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
        game.state = 'finished'; game.userRating = rating; game.dateFinished = new Date().toLocaleDateString('pt-BR'); game.finishedAt = Date.now(); game.is100 = is100; game.review = review; game.isPortable = isPortable;
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
    const modal = document.getElementById('modal-roulette');
    let pool = getMatches();
    if (pool.length === 0) {
        if (filtersActive()) return triggerToast('Nenhum jogo da fila combina com esses filtros.');
        return alert('Seu backlog está vazio! Adicione mais jogos.');
    }
    const total = pool.length;
    if (modal.open && pool.length > 1) pool = pool.filter(g => g.id !== state.currentRouletteId);   // "sortear outro"
    const winner = pool[Math.floor(Math.random() * pool.length)];
    state.currentRouletteId = winner.id;
    document.getElementById('roulette-game-name').innerText = winner.title;
    document.getElementById('roulette-pool-info').textContent = filtersActive() ? `Entre ${total} ${total === 1 ? 'jogo' : 'jogos'}: ${describeFilters()}` : `Entre ${total} ${total === 1 ? 'jogo' : 'jogos'} da sua fila`;
    document.getElementById('roulette-reroll').style.display = total > 1 ? '' : 'none';
    if (!modal.open) modal.showModal();
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
export async function saveEditedImage() {
    const gameId = document.getElementById('edit-img-game-id').value;
    const fileInput = document.getElementById('edit-game-icon');
    const game = appData.games.find(g => g.id === gameId);
    if (fileInput.files && fileInput.files[0] && game) {
        const data = await fileToSmallJpeg(fileInput.files[0]);
        saveStateForUndo();
        game.image = data;
        fileInput.value = '';
        closeModal('modal-image');
        saveData(() => render());
        triggerToast('Capa atualizada.');
    } else { closeModal('modal-image'); }
}

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
    renderThemePicker();
    paintPlatformDisplay();
    updateStorageMeter();
    document.getElementById('sgdb-key-input').value = getSgdbKey();
    document.getElementById('compact-toggle').checked = appData.settings.compact; 
    cancelEditPlatform(); 
    renderPlatformAdmin();
    document.getElementById('modal-settings').showModal(); 
}
export function openFactoryReset() { document.getElementById('reset-confirm-input').value = ''; document.getElementById('modal-factory-reset').showModal(); }
export function confirmFactoryReset() { if (document.getElementById('reset-confirm-input').value === 'APAGAR') { saveStateForUndo(); setAppData({ settings: { sort: 'manual', compact: false, finishedSort: 'date', finishedSortDir: 'desc', homeSortDir: 'asc', finishedView: 'list', timelineDir: 'desc' }, collapsedCats:[], categories:[], platforms: defaultData.platforms, games:[], wikis:[], wishlist:[], counters: { sessions: 0, sessionMinutes: 0, wishMoved: 0 }, achSeeded: true, unlockedAchievements:[] }); saveData(() => render()); closeModal('modal-factory-reset'); closeModal('modal-settings'); localStorage.removeItem('zeralog_welcomed'); triggerToast('Apagado.'); setTimeout(checkWelcome, 500); } else { alert('Digite APAGAR'); } }

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
export function pickPlatformIcon() {
    openIconPicker({ current: null, onPick: ic => {
        state.tempPlatformIcon = phHtml(ic);
        document.getElementById('new-platform-icon-preview').innerHTML = state.tempPlatformIcon;
    } });
}
export function setPlatformDisplay(mode) {
    appData.settings.platformDisplay = mode === 'name' ? 'name' : 'icon';
    saveData(() => render());
    paintPlatformDisplay();
}
export function paintPlatformDisplay() {
    const m = appData.settings.platformDisplay === 'name' ? 'name' : 'icon';
    document.getElementById('plat-disp-icon').classList.toggle('active', m === 'icon');
    document.getElementById('plat-disp-name').classList.toggle('active', m === 'name');
}
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
