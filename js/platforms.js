// Como mostrar a plataforma nos cards: ícone (padrão) ou nome.
import { appData } from './store.js';
import { esc } from './gameApi.js';

export const platformMode = () => (appData.settings && appData.settings.platformDisplay === 'name' ? 'name' : 'icon');

export function platformLabel(name) {
    const p = appData.platforms.find(x => x.name === name);
    if (platformMode() === 'icon' && p && p.icon) {
        return `<span class="plat-ico" role="img" title="${esc(name)}" aria-label="${esc(name)}">${p.icon}</span>`;
    }
    return esc(name);
}
