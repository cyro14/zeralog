import { appData, saveData, backupData, setAppData, defaultData } from './store.js';
import { openCardGenerator, downloadCard } from './card.js';
import { 
    render, checkWelcome, closeWelcome, closeModal, triggerToast, 
    changeTheme, toggleCompact, saveStateForUndo, undoAction, switchTab, 
    filterGames, setPlatformFilter, togglePortableFilter, saveGame,
    // (Importe aqui o restante das suas funções exportadas do ui.js)
} from './ui.js';

// Anexando ao escopo global (O Truque do Window)
window.openCardGenerator = openCardGenerator;
window.downloadCard = () => downloadCard(triggerToast);
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
window.saveGame = saveGame;

// (Continue pendurando todas as funções de clique da UI que você importou, ex: window.saveCategory = saveCategory)

// Inicialização Principal
document.addEventListener("DOMContentLoaded", () => {
    if(appData.settings.compact) document.body.classList.add('compact-mode');
    render();
    checkWelcome();
});
