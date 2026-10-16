// Testes da página do jogo (js/ui.js): banner "capa de Facebook", atalhos da
// capa/fundo, screenshots do usuário e extras da RAWG. Hermético: o fetch é
// mockado, nenhuma rede é necessária.
import { test, assert, mockFetch, elById, created, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { openGamePage } from '../js/ui.js';

const DETAILS = {
    id: 3328, name: 'The Witcher 3: Wild Hunt',
    description_raw: 'RPG de mundo abitermo.'.repeat(20),
    released: '2015-05-18', tba: false,
    background_image: 'https://media.rawg.io/media/games/618/game.jpg',
    background_image_additional: 'https://media.rawg.io/media/screenshots/3e4/arte-extra.jpg',
    genres: [{ id: 5, name: 'RPG' }, { id: 4, name: 'Action' }],
    metacritic: 92, playtime: 43,
    developers: [{ id: 9023, name: 'CD PROJEKT RED' }],
    publishers: [{ id: 7411, name: 'CD PROJEKT RED' }],
};
const SHOTS = { count: 3, results: [
    { id: 1, image: 'https://media.rawg.io/media/screenshots/1ac/s1.jpg' },
    { id: 2, image: 'https://media.rawg.io/media/screenshots/1ac/s2.jpg' },
    { id: 3, image: 'https://media.rawg.io/media/screenshots/1ac/s3.jpg' },
] };

function addGame(id, extra = {}) {
    const g = { id, title: `Jogo ${id}`, state: 'playing', platform: 'PC', genres: ['RPG'], catId: 'c1', rawgId: 3328, description: 'Descrição.', ...extra };
    appData.games.push(g);
    return g;
}
const lastPage = () => created[0];
const hydrate = () => sleep(30);   // fetch mockado resolve na hora

test('página do jogo abre sem erro e com a seção Sobre já expandida', async () => {
    addGame('g1');
    await openGamePage('g1', false);
    const page = lastPage();
    assert(page.innerHTML.includes('<details class="gp-sec" open>'), 'Sobre o jogo começa aberto');
    assert(page.innerHTML.includes('gp-banner'), 'container do fundo existe');
    assert(page.innerHTML.includes('gp-bg-file'), 'input de fundo existe');
});

test('hero do desktop: a capa do jogo em andamento vira o fundo --hero-bg', async () => {
    appData.games.push({ id: 'hp1', title: 'Jogo Hero', platform: 'PC', state: 'playing', image: 'data:image/jpeg;base64,CAPAHERO', catId: 'c1' });
    const { render } = await import('../js/ui.js');
    // o render monta o DOM todo; o playing-category recebe a variável CSS
    try { render(); } catch (e) { /* DOM falso pode falhar em partes; o essencial é o hero */ }
    // o elemento é criado via createElement, não getElementById: procurar no created
    const playing = created.find(c => c.id === 'playing-category');
    assert(playing, 'seção Jogando Atualmente existe');
    const bg = playing.style.getPropertyValue('--hero-bg');
    assert(bg && String(bg).includes('CAPAHERO'), `fundo do hero com a capa do jogo (${bg ? String(bg).slice(0, 40) : 'vazio'})`);
});

test('capa é um atalho para Trocar capa (gpDo openImageModal)', async () => {
    addGame('g2', { image: 'data:image/jpeg;base64,CAPA' });
    await openGamePage('g2', false);
    assert(lastPage().innerHTML.includes(`gpDo('openImageModal', 'g2')`), 'clique na capa abre a troca');
});

test('sem fundo próprio: a arte da RAWG vira a capa de Facebook', async () => {
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    addGame('g3');
    await openGamePage('g3', false);
    await hydrate();
    const banner = elById('gp-banner').innerHTML;
    assert(banner.includes('/media/resize/1280/-/screenshots/'), 'arte extra em alta resolução');
    assert(banner.includes('arte-extra.jpg'), 'usa a arte adicional da RAWG');
    const extra = elById('gp-extra').innerHTML;
    assert(extra.includes('Desenvolvedora:'), 'créditos hidratam');
    assert(extra.includes('CD PROJEKT RED'), 'nome do estúdio');
    assert(extra.includes('gp-shots'), 'galeria de screenshots');
});

test('fundo próprio do usuário tem prioridade e a RAWG não sobrescreve', async () => {
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    addGame('g4', { userBanner: 'data:image/jpeg;base64,MEUFUNDO' });
    await openGamePage('g4', false);
    const page = lastPage();
    assert(page.innerHTML.includes('MEUFUNDO'), 'fundo próprio entra na abertura');
    assert(page._cls.includes('with-banner'), 'página recebe with-banner');
    await hydrate();
    const b = elById('gp-banner');
    assert(!((b && b.innerHTML) || '').includes('rawg'), 'RAWG não sobrescreveu o fundo do usuário');
    assert(page.innerHTML.includes('MEUFUNDO'), 'o fundo do usuário segue na página');
});

test('bloco "Suas screenshots" sempre aparece (mesmo sem RAWG)', async () => {
    addGame('g5');
    await openGamePage('g5', false);
    const mine = elById('gp-mine').innerHTML;
    assert(mine.includes('Suas screenshots'), 'título do bloco');
    assert(mine.includes('Adicionar'), 'botão de adicionar');
    assert(mine.includes('gp-shot-file'), 'campo de arquivo');
});

test('jogo manual (sem rawgId) abre a página sem crashar', async () => {
    addGame('g6', { rawgId: undefined });
    await openGamePage('g6', false);
    assert(lastPage().innerHTML.includes('Jogo g6'), 'página renderiza');
    await hydrate();
    const b = elById('gp-banner');
    assert(!((b && b.innerHTML) || ''), 'sem RAWG não injeta fundo');
});

test('wishlist também ganha a página completa', async () => {
    appData.wishlist.push({ id: 'w1', title: 'Desejo Teste', platform: 'PC', genres: [], rawgId: 3328 });
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    await openGamePage('w1', true);
    await hydrate();
    assert(lastPage().innerHTML.includes('Desejo Teste'), 'página do desejo abre');
    assert(elById('gp-extra').innerHTML.includes('Desenvolvedora:'), 'extras hidratam no desejo também');
});
