import { appData, saveData, backupData, setAppData, defaultData, initStore, purgeOldLegacyCopy } from './store.js';
import { initStorageUI, restoreSnapshotUI, clearLegacyCopyUI } from './storage-ui.js';
import { openShare, openCardGenerator, initShare, shareSetStyle, sharePage, shareTitleChanged, shareTitlesChanged, shareDownload, shareShare, canShareFiles } from './share.js';
import { initFilters, openFilters, filtersClear, filtersSaveCurrent, filterSummary } from './filters.js';
import { checkReleases, refreshReleaseDates, registerPeriodicCheck, fmtDate } from './releases.js';
import { getTabGames, setWishSort, toggleWishNotify, refreshDatesUI, paintWishNotify } from './ui.js';
import { hydrateIcons } from './icons.js';
import { applyTheme, currentTheme } from './themes.js';
import { iconSearch, iconWeightChange, iconMore, ensureForData } from './phosphor.js';
import { initSession, startSession, openEndSession, sessionPreview, sessionFinish, openJournalEntry, saveJournalEntry, togglePauseSession, pauseSession, resumeSession, setSessionNotify, askNotifyPermission } from './session.js';
import { qmSetTime, qmSetGenre, qmTogglePortable, qmReset, qmSetDiff, qmToggleEmulated, qmSetPlatform, qmSetFranchise, qmSetScore } from './quickmatch.js';
import { genreSetBase, genreSetYear } from './genres.js';
import { coversSearch } from './covers.js';
import { viewImage } from './gameApi.js';
import { cropApply, cropCancel, cropReset, cropFit } from './crop.js';
import { coversSearchGoogle } from './covers.js';
import { coverCropFromGameModal, coverRemoveFromGameModal, cropEditImage, upgradeCovers, pickCategoryIcon, clearCategoryIcon, pickPlatformIcon, setPlatformDisplay, setStatsPane, openAddFromSuggestion, coverPickFromGameModal, coverPickFromImageModal, shelfDo, openShelfDetail, openGamePage, gpClose, gpDo, toggleModalFlags, openGameDataFromFinished, wishToBacklog, wishToPlaying, backlogToWish, askDeleteWish, openEditWishModal, setFinishedView, setTimelineDir, filterByFranchise } from './ui.js';
import { openWiki, wikiChangeSource, wikiSearch, wikiSearchFab, wikiBack, wikiLinkGame, wikiToggleAdd, wikiAddSource, wikiFindFandom, wikiFindToggle, wikiFindStep, wikiFindClose } from './wiki.js';
import { initSteam, steamLogin, steamLogout, steamSaveKey, steamSaveProxy, steamSaveManualId, steamSync } from './steam.js';
import { initGameMatch, gmSubShow, gmSwipe, gmExplore, gmExploreWish, gmBuy, gmClassicDecade, gmOnboardOpen, gmObGo, gmObToggle, gmObPick, gmObToggleUpcoming, gmObSetName, gmUseLibrary, gmObFinish, gmUnreject, gmXMore, gmXOpen, gmXClose, gmXWish, gmXBacklog, gmGoogle, gmExploreBacklog, gmXFilterGenre, gmXFilterPlat } from './gamematch.js';
import { initStores, storeImport, gogLogin, gogSaveCode, gogSync, gogDisconnect, epicLogin, epicSaveCode, epicSync, epicDisconnect, itchSaveKey, itchSync, itchDisconnect, enrichStoreGames } from './stores.js';
import { 
    render, checkWelcome, closeWelcome, closeModal, triggerToast, 
    changeTheme, toggleShelfPlain, saveStateForUndo, undoAction, switchTab, 
    filterGames, setPlatformFilter, togglePortableFilter, setHomeSort, toggleTimeSortMenu, setTimeSort,
    setFinishedSort, toggleCollapse, renderFinishedTab, saveGame,
    openCatModal, openEditCatModal, saveCategory, askDeleteCategory, moveCategory,
    openGameModal, openEditGameModal, askDeleteGame, toggleState,
    openRatingModal, openEditFinishedModal, cancelRating, skipRating, saveRating, saveFinishedEdit,
    spinRoulette, acceptRoulette, quickSearch, openImageModal, searchCoverOnGoogle, previewImageEdit, saveEditedImage, openBrowser, closeBrowser,
    openBackupModal, exportBackup, importBackup, openSettings, openFactoryReset, confirmFactoryReset,
    renderPlatformAdmin, previewPlatformIcon, searchPlatformIconOnGoogle, editPlatform, cancelEditPlatform, savePlatform, removePlatform, fetchGameFromRAWG, pickRawgResult, toggleJournal, saveRawgKey, saveIGDBKey, saveCoverPref, openSettingsSection, backToSettingsHub, welcomeSteam, buyOnAmazon, checkAppUpdate
} from './ui.js';

// Anexando ao escopo global para que o index.html possa ler os onlicks
window.openCardGenerator = openCardGenerator;
window.viewImage = viewImage;   // visualizador de screenshot (os cards da galeria chamam por onclick)
Object.assign(window, {
    openFilters, filtersClear, filtersSaveCurrent, shareSetStyle, sharePage, shareTitleChanged, shareTitlesChanged, shareDownload, shareShare,
    setWishSort, toggleWishNotify, refreshDatesUI, paintWishNotify,
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
window.welcomeSteam = welcomeSteam;
window.closeModal = closeModal;
window.changeTheme = changeTheme;
window.toggleShelfPlain = toggleShelfPlain;
window.undoAction = undoAction;
window.switchTab = switchTab;
window.filterGames = filterGames;
window.setPlatformFilter = setPlatformFilter;
window.togglePortableFilter = togglePortableFilter;
window.setHomeSort = setHomeSort;
window.toggleTimeSortMenu = toggleTimeSortMenu;
window.setTimeSort = setTimeSort;
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
window.openBrowser = openBrowser;
window.closeBrowser = closeBrowser;
window.coversSearchGoogle = coversSearchGoogle;
window.previewImageEdit = previewImageEdit;
window.saveEditedImage = saveEditedImage;
window.openBackupModal = openBackupModal;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.openSettings = openSettings;
window.openSettingsSection = openSettingsSection;
window.backToSettingsHub = backToSettingsHub;
window.buyOnAmazon = buyOnAmazon;
window.checkAppUpdate = checkAppUpdate;
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
window.saveIGDBKey = saveIGDBKey;
window.saveCoverPref = saveCoverPref;
window.openWiki = openWiki;
window.wikiChangeSource = wikiChangeSource;
window.wikiSearch = () => wikiSearch();
window.wikiSearchFab = () => wikiSearchFab();
window.wikiBack = wikiBack;
window.wikiLinkGame = wikiLinkGame;
window.wikiToggleAdd = wikiToggleAdd;
window.wikiAddSource = wikiAddSource;
window.wikiFindFandom = wikiFindFandom;
window.wikiFindToggle = wikiFindToggle;
window.wikiFindStep = wikiFindStep;
window.wikiFindClose = () => wikiFindClose();
Object.assign(window, { coverCropFromGameModal, coverRemoveFromGameModal, cropEditImage, upgradeCovers, cropApply, cropCancel, cropReset, cropFit, togglePauseSession, pauseSession, resumeSession, setSessionNotify, askNotifyPermission, pickCategoryIcon, clearCategoryIcon, pickPlatformIcon, setPlatformDisplay, iconSearch, iconWeightChange, iconMore, setStatsPane, openAddFromSuggestion, coverPickFromGameModal, coverPickFromImageModal, coversSearch, qmSetDiff, qmToggleEmulated, genreSetBase, genreSetYear, shelfDo, openShelfDetail, openGamePage, gpClose, gpDo, openJournalEntry, saveJournalEntry, toggleModalFlags, startSession, openEndSession, sessionPreview, sessionFinish, qmSetTime, qmSetGenre, qmTogglePortable, qmReset, qmSetPlatform, qmSetFranchise, qmSetScore, openGameDataFromFinished, wishToBacklog, wishToPlaying, backlogToWish, askDeleteWish, openEditWishModal, setFinishedView, setTimelineDir, filterByFranchise });

// Steam: login, sincronização e configurações
Object.assign(window, { steamLogin, steamLogout, steamSaveKey, steamSaveProxy, steamSaveManualId, steamSyncUI: steamSync });

// GameMatch: aba de descoberta estilo Tinder
Object.assign(window, { gmSubShow, gmSwipe, gmExplore, gmExploreWish, gmBuy, gmClassicDecade, gmOnboardOpen, gmObGo, gmObToggle, gmObPick, gmObToggleUpcoming, gmObSetName, gmUseLibrary, gmObFinish, gmUnreject, gmXMore, gmXOpen, gmXClose, gmXWish, gmXBacklog, gmGoogle, gmExploreBacklog, gmXFilterGenre, gmXFilterPlat });
Object.assign(window, { storeImport, gogLogin, gogSaveCode, gogSync, gogDisconnect, epicLogin, epicSaveCode, epicSync, epicDisconnect, itchSaveKey, itchSync, itchDisconnect });

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
    if (appData.settings.shelfPlain) document.body.classList.add('shelf-plain');
    applyTheme(currentTheme());
    ensureForData(appData);
    hydrateIcons();
    render();
    initSession({ render, toast: msg => triggerToast(msg, false), undo: saveStateForUndo });
    initStorageUI({ render, toast: (msg, undo) => triggerToast(msg, undo !== false) });
    initFilters({ render });
    initSteam({ render, toast: (msg, undo) => triggerToast(msg, undo === true), undo: saveStateForUndo, openSteamSettings: () => { openSettings(); openSettingsSection('steam'); } });
    initShare({ toast: msg => triggerToast(msg, false) });
    initGameMatch({ toast: msg => triggerToast(msg, false), hydrateIcons, render });
    initStores({ render, toast: (msg, undo) => triggerToast(msg, undo === true), undo: saveStateForUndo });
    // Retomada de capas: se o app foi interrompido no meio da sincronização (ou jogos ficaram
    // sem capa por qualquer motivo), retoma em segundo plano — no máximo 1x a cada 18h.
    setTimeout(() => {
        const missing = [...appData.games, ...(appData.wishlist || [])].filter(g => !g.image);
        if (!missing.length) return;
        let last = 0; try { last = +(localStorage.getItem('zl_last_enrich') || 0); } catch (e) {}
        if (Date.now() - last < 18 * 3600 * 1000) return;
        try { localStorage.setItem('zl_last_enrich', String(Date.now())); } catch (e) {}
        enrichStoreGames(missing.slice(0, 80));
    }, 4000);
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

// ================= Navegação por gesto/botão voltar (mobile e desktop) =================
// Pilha de "telas sobrepostas" abertas (diálogo ou página de jogo). O gesto de voltar
// fecha a do topo em vez de sair do app; se não tiver nada aberto, volta para a Fila.
const zlNavStack = [];
export function zlNavPush(closeFn) { try { history.pushState({ zl: 1 }, ''); } catch (e) {} zlNavStack.push(closeFn); }
window.addEventListener('popstate', () => {
    while (zlNavStack.length) {
        const close = zlNavStack.pop();
        try { if (close()) return; } catch (e) {}
    }
    if (!document.getElementById('tab-home').classList.contains('active')) switchTab('home');
});
// Qualquer <dialog> que abrir entra na pilha (funciona com todos os modais do app)
const zlObs = new MutationObserver(muts => {
    for (const m of muts) {
        const dlg = m.target;
        if (m.attributeName === 'open' && dlg.open) {
            zlNavPush(() => { if (dlg.open) { dlg.close(); return true; } return false; });
        }
    }
});
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('dialog').forEach(d => zlObs.observe(d, { attributes: true, attributeFilter: ['open'] }));
});
// A página de jogo (tela cheia) também entra: observa a criação do #gp-page
document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
        const pg = document.getElementById('gp-page');
        if (pg && !pg.dataset.nav) { pg.dataset.nav = '1'; zlNavPush(() => { if (document.getElementById('gp-page')) { window.gpClose && window.gpClose(); return true; } return false; }); }
    }).observe(document.body, { childList: true });
});

// ================= Menu lateral recolhível (desktop) =================
// Ao descer a página, os controles do topo viram uma trilha de ícones à esquerda;
// ao subir de volta, voltam ao normal.
let zlLastY = 0;
window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const goingDown = y > zlLastY + 4;
    const goingUp = y < zlLastY - 4;
    zlLastY = y;
    if (y > 140 && goingDown) document.body.classList.add('zl-rail');
    else if (goingUp || y < 90) document.body.classList.remove('zl-rail');
}, { passive: true });
window.zlNavPush = zlNavPush;
