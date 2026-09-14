import { appData, saveData, backupData, setAppData, defaultData } from './store.js';
import { openCardGenerator, downloadCard } from './card.js';
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
    renderPlatformAdmin, previewPlatformIcon, searchPlatformIconOnGoogle, editPlatform, cancelEditPlatform, savePlatform, removePlatform, fetchGameFromRAWG, updateQuickLinks
} from './ui.js';

// Anexando ao escopo global para que o index.html possa ler os onlicks
window.openCardGenerator = openCardGenerator;
window.downloadCard = () => downloadCard(triggerToast);

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
window.updateQuickLinks = updateQuickLinks;

// Inicialização Principal
document.addEventListener("DOMContentLoaded", () => {
    if(appData.settings.compact) document.body.classList.add('compact-mode');
    render();
    checkWelcome();
});
