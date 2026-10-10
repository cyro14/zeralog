import { appData, saveData, backupData, setAppData, defaultData, initStore, purgeOldLegacyCopy } from './store.js';
import { initStorageUI, restoreSnapshotUI, clearLegacyCopyUI } from './storage-ui.js';
import { openShare, openCardGenerator, initShare, shareSetStyle, sharePage, shareTitleChanged, shareTitlesChanged, shareDownload, shareShare, canShareFiles } from './share.js';
import { initFilters, openFilters, filtersClear, filtersSaveCurrent, filterSummary } from './filters.js';
import { checkReleases, refreshReleaseDates, registerPeriodicCheck, fmtDate } from './releases.js';
import { getTabGames, setWishSort, setWishView, toggleWishNotify, refreshDatesUI, paintWishNotify } from './ui.js';
import { hydrateIcons } from './icons.js';
import { applyTheme, currentTheme } from './themes.js';
import { iconSearch, iconWeightChange, iconMore, ensureForData } from './phosphor.js';
import { initSession, startSession, openEndSession, sessionPreview, sessionFinish, openJournalEntry, saveJournalEntry, togglePauseSession, pauseSession, resumeSession, setSessionNotify, askNotifyPermission } from './session.js';
import { qmSetTime, qmSetGenre, qmTogglePortable, qmReset, qmSetDiff, qmToggleEmulated } from './quickmatch.js';
import { genreSetBase, genreSetYear } from './genres.js';
import { coversSearch } from './covers.js';
import { cropApply, cropCancel, cropReset, cropFit } from './crop.js';
import { coverCropFromGameModal, coverRemoveFromGameModal, cropEditImage, upgradeCovers, pickCategoryIcon, clearCategoryIcon, pickPlatformIcon, setPlatformDisplay, setStatsPane, openAddFromSuggestion, coverPickFromGameModal, coverPickFromImageModal, setHomeView, shelfDo, openShelfDetail, toggleModalFlags, openGameDataFromFinished, wishToBacklog, wishToPlaying, askDeleteWish, openEditWishModal, setFinishedView, setTimelineDir, filterByFranchise } from './ui.js';
import { openWiki, wikiChangeSource, wikiSearch, wikiBack, wikiLinkGame, wikiToggleAdd, wikiAddSource, wikiFindFandom, wikiFindToggle, wikiFindStep, wikiFindClose } from './wiki.js';
import { 
    render, checkWelcome, closeWelcome, closeModal, triggerToast, 
    changeTheme, toggleCompact, saveStateForUndo, undoAction, switchTab, 
    filterGames, setPlatformFilter, togglePortableFilter, setHomeSort,
    setFinishedSort, toggleCollapse, renderFinishedTab, saveGame,
    openCatModal, openEditCatModal, saveCategory, askDeleteCategory, moveCategory,
    openGameModal, openEditGameModal, askDeleteGame, toggleState,
    openRatingModal, openEditFinishedModal, cancelRating, skipRating, saveRating, saveFinishedEdit,
    spinRoulette, acceptRoulette, quickSearch, openImageModal, searchCoverOnGoogle, previewImageEdit, saveEditedImage,
    openBackupModal, exportBackup, importBackup, openSettings, openFactoryReset, confirmFactoryReset,
    renderPlatformAdmin, previewPlatformIcon, searchPlatformIconOnGoogle, editPlatform, cancelEditPlatform, savePlatform, removePlatform, fetchGameFromRAWG, pickRawgResult, toggleJournal, saveRawgKey
} from './ui.js';

// Anexando ao escopo global para que o index.html possa ler os onlicks
window.openCardGenerator = openCardGenerator;
Object.assign(window, {
    openFilters, filtersClear, filtersSaveCurrent, shareSetStyle, sharePage, shareTitleChanged, shareTitlesChanged, shareDownload, shareShare,
    setWishSort, setWishView, toggleWishNotify, refreshDatesUI, paintWishNotify,
    openShare: tab => {
        const items = getTabGames(tab);
        if (!items.length) { triggerToast('Não há jogos para compartilhar nesta tela (confira os filtros).', false); return; }
        const names = { home: 'Minha fila de jogos', finished: 'Jogos zerados', wish: 'Minha wishlist' };
        const view = tab === 'home' ? appData.settings.homeView : tab === 'finished' ? appData.settings.finishedView : appData.settings.wishView;
        const filt = filterSummary(tab);
        openShare({ items, mode: tab, title: names[tab], subtitle: `${items.length} ${items.length === 1 ? 'jogo' : 'jogos'}${filt.length ? ' · ' + filt.join(' · ') : ''}`, style: view === 'shelf' ? 'shelf' : 'cards' });
    }
});

// Mapeamento massivo da UI
window.checkWelcome = checkWelcome;
window.closeWelcome = closeWelcome;
window.closeModal = closeModal;
window.changeTheme = changeTheme;
window.toggleCompact = toggleCompact;
window.undoAction = undoAction;
window.switchTab = switchTab;
window.filterGames = filterGames;
window.setPlatformFilter = setPlatformFilter;
window.togglePortableFilter = togglePortableFilter;
window.setHomeSort = setHomeSort;
window.setFinishedSort = setFinishedSort;
window.toggleCollapse = toggleCollapse;
window.saveGame = saveGame;
window.openCatModal = openCatModal;
window.openEditCatModal = openEditCatModal;
window.saveCategory = saveCategory;
window.askDeleteCategory = askDeleteCategory;
window.moveCategory = moveCategory;
window.openGameModal = openGameModal;
window.openEditGameModal = openEditGameModal;
window.askDeleteGame = askDeleteGame;
window.toggleState = toggleState;
window.openRatingModal = openRatingModal;
window.openEditFinishedModal = openEditFinishedModal;
window.cancelRating = cancelRating;
window.skipRating = skipRating;
window.saveRating = saveRating;
window.saveFinishedEdit = saveFinishedEdit;
window.spinRoulette = spinRoulette;
window.acceptRoulette = acceptRoulette;
window.quickSearch = quickSearch;
window.openImageModal = openImageModal;
window.searchCoverOnGoogle = searchCoverOnGoogle;
window.previewImageEdit = previewImageEdit;
window.saveEditedImage = saveEditedImage;
window.openBackupModal = openBackupModal;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.openSettings = openSettings;
window.openFactoryReset = openFactoryReset;
window.confirmFactoryReset = confirmFactoryReset;
window.previewPlatformIcon = previewPlatformIcon;
window.searchPlatformIconOnGoogle = searchPlatformIconOnGoogle;
window.editPlatform = editPlatform;
window.cancelEditPlatform = cancelEditPlatform;
window.savePlatform = savePlatform;
window.removePlatform = removePlatform;
window.fetchGameFromRAWG = fetchGameFromRAWG;
window.pickRawgResult = pickRawgResult;
window.toggleJournal = toggleJournal;
window.saveRawgKey = saveRawgKey;
window.openWiki = openWiki;
window.wikiChangeSource = wikiChangeSource;
window.wikiSearch = () => wikiSearch();
window.wikiBack = wikiBack;
window.wikiLinkGame = wikiLinkGame;
window.wikiToggleAdd = wikiToggleAdd;
window.wikiAddSource = wikiAddSource;
window.wikiFindFandom = wikiFindFandom;
window.wikiFindToggle = wikiFindToggle;
window.wikiFindStep = wikiFindStep;
window.wikiFindClose = () => wikiFindClose();
Object.assign(window, { coverCropFromGameModal, coverRemoveFromGameModal, cropEditImage, upgradeCovers, cropApply, cropCancel, cropReset, cropFit, togglePauseSession, pauseSession, resumeSession, setSessionNotify, askNotifyPermission, pickCategoryIcon, clearCategoryIcon, pickPlatformIcon, setPlatformDisplay, iconSearch, iconWeightChange, iconMore, setStatsPane, openAddFromSuggestion, coverPickFromGameModal, coverPickFromImageModal, coversSearch, qmSetDiff, qmToggleEmulated, genreSetBase, genreSetYear, setHomeView, shelfDo, openShelfDetail, openJournalEntry, saveJournalEntry, toggleModalFlags, startSession, openEndSession, sessionPreview, sessionFinish, qmSetTime, qmSetGenre, qmTogglePortable, qmReset, openGameDataFromFinished, wishToBacklog, wishToPlaying, askDeleteWish, openEditWishModal, setFinishedView, setTimelineDir, filterByFranchise });

// Inicialização Principal (o banco é aberto de forma assíncrona antes de desenhar a tela)
window.restoreSnapshotUI = restoreSnapshotUI;
window.clearLegacyCopy = clearLegacyCopyUI;
window.__zlData = () => appData;   // leitura dos dados em memória (usado nos testes)

// Confere lançamentos ao abrir, ao voltar para o app e a cada hora; atualiza as datas 1x por dia
async function releaseTick() {
    const due = await checkReleases();
    if (due.length) { due.forEach(w => triggerToast(`${w.title} já está disponível! (${fmtDate(w.released)})`, false)); render(); }
}
function startReleaseWatch() {
    releaseTick();
    registerPeriodicCheck();
    const DAY = 86400000;
    if (Date.now() - (appData.settings.lastReleaseRefresh || 0) > DAY) {
        refreshReleaseDates().then(r => { appData.settings.lastReleaseRefresh = Date.now(); saveData(null); if (r.changed) { render(); triggerToast(`${r.changed} ${r.changed === 1 ? 'data de lançamento atualizada' : 'datas de lançamento atualizadas'}.`, false); } });
    }
    setInterval(releaseTick, 3600000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) releaseTick(); });
}

async function start() {
    try { await initStore(); } catch (e) { console.error('Falha ao abrir o banco:', e); }
    if (appData.settings.compact) document.body.classList.add('compact-mode');
    applyTheme(currentTheme());
    ensureForData(appData);
    hydrateIcons();
    render();
    initSession({ render, toast: msg => triggerToast(msg, false), undo: saveStateForUndo });
    initStorageUI({ render, toast: (msg, undo) => triggerToast(msg, undo !== false) });
    initFilters({ render });
    initShare({ toast: msg => triggerToast(msg, false) });
    if (!canShareFiles()) document.getElementById('sh-share-btn').style.display = 'none';
    startReleaseWatch();
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam === 'wish') { switchTab('wish'); history.replaceState(null, '', location.pathname); }
    purgeOldLegacyCopy();
    checkWelcome();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.__zeralogReady = true;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
