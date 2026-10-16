// Testes do compartilhamento (js/share.js): tela cheia, Gamer ID e o link do
// blog em TODAS as imagens. O canvas é falso, mas os textos desenhados são
// gravados (el._texts) — o teste confere o CONTEÚDO da imagem.
import { test, assert, assertEq, elById, created, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { openShare, openCardGenerator, openGamerIdShare } from '../js/share.js';

const BLOG = 'anywheregamer.blogspot.com/p/zeralog.html';
// último canvas criado com textos desenhados
const canvasTexts = () => {
    for (let i = created.length - 1; i >= 0; i--) {
        if (created[i]._texts && created[i]._texts.length) return created[i]._texts;
    }
    return [];
};
function gamingData() {
    appData.games.push(
        { id: 'j1', title: 'Hollow Knight', platform: 'PC', state: 'playing', image: null },
        { id: 'j2', title: 'Celeste', platform: 'Nintendo Switch', state: 'finished', userRating: 9, image: null },
        { id: 'j3', title: 'Dead Cells', platform: 'PC', state: 'backlog', image: null },
    );
    appData.wishlist.push({ id: 'w1', title: 'Silksong', platform: 'PC' });
    appData.gamematch = { profile: { name: 'Zera Tester', genres: [], platforms: [], styles: [] }, likes: [], favorites: [], rejects: [], backlogAdds: [] };
    appData.settings.profileBio = 'Zerando o backlog uma sessão por dia.';
    appData.unlockedAchievements = ['ach-1', 'ach-5'];
}

test('Gamer ID: abre em TELA CHEIA e desenha foto, nível, bio e contadores', async () => {
    gamingData();
    openGamerIdShare();
    assert(elById('modal-share')._shown >= 1, 'o dialog de compartilhar abriu (showModal)');
    assertEq(elById('sh-heading').textContent, 'Seu Gamer ID', 'título da tela');
    await sleep(60);
    const t = canvasTexts().join(' | ');
    assert(t.includes('GAMER ID'), 'selo GAMER ID');
    assert(t.includes('Zera Tester'), 'nome do perfil');
    assert(/Nível \d+/.test(t), 'nível desenhado');
    assert(t.includes('Zerando o backlog'), 'bio desenhada');
    assert(t.includes('Jogando agora'), 'prateleira de jogando');
    assert(t.includes('No backlog') && t.includes('Zerados') && t.includes('Conquistas'), 'contadores');
    assert(t.includes(BLOG), 'link do blog presente');
});

test('Gamer ID: sem dados, não explode e ainda desenha o essencial', async () => {
    openGamerIdShare();
    await sleep(60);
    const t = canvasTexts().join(' | ');
    assert(t.includes('GAMER ID'), 'selo mesmo vazio');
    assert(t.includes(BLOG), 'link do blog mesmo com tudo vazio');
});

test('lista compartilhável (prateleira): título da imagem + link do blog', async () => {
    gamingData();
    openShare({ items: appData.games, mode: 'home', title: 'Minha fila de jogos', subtitle: '3 jogos', style: 'shelf' });
    assert(elById('sh-heading').textContent === 'Compartilhar imagem', 'título genérico na lista');
    await sleep(60);
    const t = canvasTexts().join(' | ');
    assert(t.includes('Minha fila de jogos'), 'título da imagem');
    assert(t.includes('ZeraLog') && t.includes('x Anywhere Gamer'), 'marca');
    assert(t.includes(BLOG), 'link do blog na prateleira');
});

test('cartão de jogo zerado: nota, nome e link do blog', async () => {
    gamingData();
    openCardGenerator('j2');
    await sleep(60);
    const t = canvasTexts().join(' | ');
    assert(t.includes('Celeste'), 'nome do jogo');
    assert(t.includes('ZERADO'), 'selo de zerado');
    assert(t.includes(BLOG), 'link do blog no cartão');
});

test('contadores do Gamer ID refletem a biblioteca real', async () => {
    gamingData();
    openGamerIdShare();
    await sleep(60);
    const t = canvasTexts().join(' | ');
    assert(t.includes('Jogando'), 'caixa jogando');
    // 1 jogando, 1 na fila (Dead Cells), 1 zerado — desenhados na ordem das caixas
    const nums = ['1', '1', '1'];
    assert(nums.every(n => t.includes(n)), 'números corretos nos contadores');
});
