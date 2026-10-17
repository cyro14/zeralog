// Debug rápido do picker modo banner
import './tests/shim.mjs';
import { sleep } from './tests/shim.mjs';
import { openCoverPicker } from './js/covers.js';
import { mockFetch } from './tests/shim.mjs';

mockFetch([
    ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
    ['store.steampowered.com', {}],
    ['wikipedia.org', { query: { pages: [] } }],
    ['howlongtobeat.com', {}],
    ['/api/games/42?', { id: 42, name: 'Jogo Teste', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg', background_image_additional: 'https://media.rawg.io/media/games/abc/extra.jpg' }],
    ['/api/games/42/screenshots', { results: [{ image: 'https://media.rawg.io/media/screenshots/x/shot1.jpg' }] }],
]);
openCoverPicker({ title: 'Jogo Teste', rawgId: 42, mode: 'banner', onPick: () => {} });
await sleep(150);
const grid = document.getElementById('cv-grid');
console.log('CLASSES:', grid.className);
console.log('HTML:', grid.innerHTML.slice(0, 1500));
console.log('STATUS:', document.getElementById('cv-status').textContent);
