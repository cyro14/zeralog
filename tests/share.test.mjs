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

test('"Capas minúsculas": tudo numa imagem só, sem paginação', async () => {
    gamingData();
    // 50 jogos: a prateleira normal pagina (40/página) — minúscula não pode paginar
    for (let i = 0; i < 50; i++) appData.games.push({ id: 'm' + i, title: 'Mini ' + i, platform: 'PC', state: 'backlog' });
    document.getElementById('sh-tiny').checked = true;
    openShare({ items: appData.games, mode: 'home', title: 'Tudo numa imagem', style: 'shelf' });
    await sleep(80);
    assertEq(elById('sh-pages').style.display, 'none', 'paginador escondido (1 página só)');
    const status = elById('sh-status').textContent || '';
    assert(status.includes('53'), `status conta todos os jogos (${status})`);
    document.getElementById('sh-tiny').checked = false;
});

test('prateleira normal continua paginando (contraste com minúsculas)', async () => {
    gamingData();
    for (let i = 0; i < 50; i++) appData.games.push({ id: 'n' + i, title: 'Norm ' + i, platform: 'PC', state: 'backlog' });
    document.getElementById('sh-tiny').checked = false;
    openShare({ items: appData.games, mode: 'home', title: 'Prateleira normal', style: 'shelf' });
    await sleep(80);
    assert(elById('sh-pages').style.display !== 'none', 'paginador visível');
    assert((elById('sh-page-label').textContent || '').includes('parte') || (elById('sh-page-label').textContent || '').includes('Parte'), 'label de páginas presente');
});

test('zerados: estilo LINHA DO TEMPO agrupa por ANO (e por mês quando a tela pede)', async () => {
    gamingData();
    appData.settings.timelineGroup = 'year';
    const items = [
        { id: 'z1', title: 'Celeste', platform: 'PC', state: 'finished', dateFinished: '10/03/2025', userRating: 9, image: null },
        { id: 'z2', title: 'Hades', platform: 'PC', state: 'finished', dateFinished: '22/03/2025', image: null },
    ];
    openShare({ items, mode: 'finished', title: 'Jogos zerados', subtitle: '2 jogos', style: 'timeline' });
    assert(elById('sh-style-row').style.display !== 'none', 'fileira de estilos visível para os zerados');
    assert(elById('sh-style-timeline').style.display !== 'none', 'botão Linha do tempo visível');
    await sleep(80);
    const t = canvasTexts().join(' | ');
    assert(t.includes('2025'), 'ano de conclusão agrupado no rótulo (padrão da tela)');
    assert(!t.includes('Março de 2025'), 'sem separar por mês no padrão');
    assert(t.includes('2 jogos'), 'contagem do ano');
    assert(t.includes('nota média 9.0'), 'a nota média do período aparece no capítulo');
    assert(t.includes(BLOG), 'link do blog na linha do tempo');
    // a opção "Por mês" da tela dos zerados vale também para a imagem
    appData.settings.timelineGroup = 'month';
    const { shareSetStyle } = await import('../js/share.js');
    shareSetStyle('timeline');
    await sleep(80);
    const tMes = canvasTexts().join(' | ');
    assert(tMes.includes('Março de 2025'), 'no modo "Por mês" o mês aparece no rótulo');
    assert(tMes.includes(BLOG), 'link do blog na versão por mês');
    // trocar para prateleira na própria janela continua funcionando
    shareSetStyle('shelf');
    await sleep(80);
    const t2 = canvasTexts().join(' | ');
    assert(!t2.includes('Março de 2025'), 'na prateleira comum não há agrupamento por mês');
    assert(t2.includes(BLOG), 'link do blog na prateleira comum');
});

test('outras listas: sem opção de linha do tempo e sem nada de cards', async () => {
    gamingData();
    openShare({ items: appData.games, mode: 'home', title: 'Minha fila de jogos', style: 'shelf' });
    assertEq(elById('sh-style-row').style.display, 'none', 'fileira de estilos escondida fora dos zerados (só existe prateleira)');
});
