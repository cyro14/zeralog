// Testes do Quick Match (js/quickmatch.js): o carrossel de perguntas do sorteio —
// uma pergunta por vez, opção padrão marcada, botão de confirmar só no final.
import { test, assert, assertEq, elById } from './shim.mjs';
import { appData } from '../js/store.js';
import {
    renderQuickMatch, qmNext, qmPrev, qmConfirmSorteio,
    qmSetTime, qmSetGenre, qmReset
} from '../js/quickmatch.js';

const body = () => elById('qm-body').innerHTML;
const fila = (n = 1) => { for (let i = 0; i < n; i++) appData.games.push({ id: 'q' + i + '-' + Math.random().toString(36).slice(2, 6), title: 'Jogo ' + i, platform: 'PC', state: null, meta: '3h' }); };

test('carrossel: abre na primeira pergunta, uma por vez, padrão já marcado', () => {
    fila();
    renderQuickMatch();
    const h = body();
    assert(h.includes('Pergunta 1 de 7'), 'começa na primeira pergunta');
    assert(h.includes('Quanto tempo você tem?'), 'a pergunta da vez');
    assert(h.includes('Qualquer duração'), 'opção padrão (qualquer) presente');
    assert(!h.includes('Pergunta 2 de 7'), 'só uma pergunta por vez');
    assert(!h.includes('qm-list'), 'sem a lista antiga de jogos');
    assert(!h.includes('Confirmar sorteio'), 'o botão de confirmar NÃO aparece no começo');
    assert(h.includes('qmNext()'), 'botão de avançar');
    assert(!h.includes('qmPrev()'), 'sem voltar na primeira pergunta');
    assertEq((h.match(/<i class="on"><\/i>/g) || []).length, 1, 'uma bolinha de progresso acesa');
});

test('carrossel: trocar a opção mantém ela marcada e navegar leva até o confirmar', () => {
    fila();
    renderQuickMatch();
    qmSetTime('fast');
    let h = body();
    assert(h.includes(`class="qm-chip active" onclick="qmSetTime('fast')"`), 'a opção escolhida fica marcada');
    assert(h.includes('class="qm-chip " onclick="qmSetTime(null)"'), 'o padrão desmarca ao escolher outra');
    qmNext(); qmNext(); qmNext();
    h = body();
    assert(h.includes('Pergunta 4 de 7'), 'avançou até a quarta pergunta');
    assert(h.includes('qmPrev()'), 'botão de voltar a partir da segunda');
    qmPrev();
    assert(body().includes('Pergunta 3 de 7'), 'voltar funciona');
    // percorre o resto até a tela final
    qmNext(); qmNext(); qmNext(); qmNext(); qmNext();
    h = body();
    assert(h.includes('Tudo pronto'), 'tela de confirmação no final');
    assert(h.includes('Confirmar sorteio'), 'o botão de confirmar aparece no final');
    assert(h.includes('Rápido'), 'o filtro escolhido aparece no resumo');
    assert(h.includes('1 jogo combina'), 'contagem de quem entra no sorteio');
    assert(!h.includes('qmNext()'), 'sem avançar depois da última');
    assert(!h.includes('Sortear agora!'), 'sem o botão antigo "Sortear agora!"');
});

test('confirmar (no final) fecha o painel e dispara a roleta', () => {
    fila();
    renderQuickMatch();
    let sorteou = 0;
    window.spinRoulette = () => { sorteou++; };   // no app real, o main.js anexa no window
    qmConfirmSorteio();
    assertEq(sorteou, 1, 'a roleta foi chamada ao confirmar');
    assertEq(elById('quick-match').open, false, 'o painel do carrossel fechou');
    delete window.spinRoulette;
});

test('limpar filtros volta ao padrão (a fila inteira entra no sorteio)', () => {
    fila(2);
    renderQuickMatch();
    qmSetTime('fast');
    qmSetGenre('RPG', true);
    qmReset();
    for (let i = 0; i < 7; i++) qmNext();
    const h = body();
    assert(h.includes('Sem filtros — a fila inteira entra no sorteio'), 'resumo sem filtros após limpar');
    assert(h.includes('2 jogos combinam'), 'contagem da fila inteira');
});
