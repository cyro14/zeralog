# AGENTS.md — guia para agentes de IA trabalhando no ZeraLog

O ZeraLog é um app de backlog de jogos 100% front-end (PWA): HTML/CSS/JS puro,
sem build, sem dependências, módulos ES (`js/*.js`) carregados por
`index.html`. Os dados do usuário ficam no navegador (IndexedDB via `js/db.js`,
migrados por `migrateData` em `js/store.js`). Ações de tela usam `onclick`
inline no HTML — toda função chamada assim precisa estar anexada em `window`
(veja os `Object.assign(window, {...})` do `js/main.js`).

## Regras críticas

### 1. Encoding — NUNCA edite arquivos do app via PowerShell
O Windows PowerShell 5.1 lê arquivos como ANSI e grava UTF-16/UTF-8 com BOM.
Isso JÁ DESTRUIU os acentos do app uma vez (commit `1dab095`, corrigido em
`0a6f4b7`). **Use sempre as ferramentas de edição do agente** (que gravam
UTF-8 puro). O teste `ENCODING` da suíte vigia isso — ele falha se qualquer
arquivo virar mojibake ou UTF-8 inválido.

### 2. Testes — rode a suíte em TODA mudança, sem exceção
```bash
node tests/run.mjs     # ou: npm test
```
- Sai com código 1 se qualquer teste falhar. **Não encerre uma tarefa de
  código com a suíte vermelha.**
- O Node precisa ser 18+. No DSH, o Node embutido vem de
  `load_workspace_dependencies` (o Node do sistema pode não estar no PATH).
- Testes "AO VIVO" chamam a API real da RAWG e **pulam** (não falham) se
  estiver sem rede, no limite de requisições ou com chave inválida.

### 3. Toda funcionalidade nova vem com teste automatizado
Antes de fechar qualquer funcionalidade, crie os testes dela em `tests/`:

| Tipo | Onde | Como |
|---|---|---|
| Lógica/função nova | `tests/<modulo>.test.mjs` | `import` o módulo real + `test()` + `assert()` do `tests/shim.mjs` |
| Tela/HTML gerado | idem | rode a função real (ex.: `openGamePage`) com o shim e confira o HTML pintado em `elById('id').innerHTML` |
| API externa | idem | marcada "AO VIVO" com `live()` (pula offline) ou hermética com `mockFetch()` |
| Integridade | `tests/static.test.mjs` | novo id essencial, novo binding, novo import — os guardas cobrem automaticamente |

Convenções do `tests/shim.mjs`:
- `test(nome, fn)` registra; o `run.mjs` roda tudo com estado limpo por teste
  (banco em memória novo — o caminho real do `initStore`).
- `assert(cond, msg)` / `assertEq(a, b, msg)` / `skipTest(motivo)`.
- `mockFetch([['pedaço-da-url', resposta], ...])` para testes sem rede;
  `elById(id)` lê o que foi pintado; `created[0]` é o último elemento criado.
- Para telas que desenham em canvas (share.js): o shim finge o contexto 2D e
  **grava todo texto desenhado em `el._texts`** — teste o CONTEÚDO da imagem
  por ali (ex.: nível, bio e o link do blog no Gamer ID).
- A suíte inteira roda em ~15s, sem nenhuma dependência externa (npm install
  não é necessário — e não adicione dependências).

**Guarde um bug de cada classe para sempre:** o bug do `ic` (variável de
escopo errado que derrubava a página inteira) e o do `saveSgdbKey` (onclick
apontando pra função renomeada) existiam quando a suíte foi criada — os
testes `Botões` (bindings) e o padrão de rodar a função real com o shim
pegariam os dois hoje.

### 4. Git
- Commits em português, mensagem curta descrevendo o conjunto. Pode commitar
  ao concluir uma tarefa.
- **Não tente `git push`**: a linha de comando não tem as credenciais (o token
  vive no GitHub Desktop). O usuário mesmo clica em "Push origin". Avisar no
  final da resposta quando houver commit pendente.

## Mapa do app (o que testar quando mexer em cada parte)

- `js/gameApi.js` — toda a RAWG: busca, detalhes (dev/pub/arte extra),
  screenshots, estúdios, redimensionamento de imagens, `viewImage`, e o download
  de imagens com CORS (`fetchImageBlob` → `imageAttempts`: link direto, link com
  cache-buster e os proxies de `IMAGE_PROXIES`; 404 encerra na hora).
  Testes: `tests/gameapi.test.mjs`.
- `js/store.js` — formato do banco, `migrateData`, padrões (ex.: "Prateleira
  limpa" ligada por padrão). Testes: `tests/store.test.mjs`.
- `js/gamematch.js` — perfil, match, filtros do Explorar (todo gênero novo
  precisa de slug em `GENRE_RAWG` — o teste de integridade exige), bloqueio
  adulto. Testes: `tests/gamematch.test.mjs`.
- `js/franchises.js` — tela de Franquias (aba Estatísticas): caixa de capa
  grande com a % de zerados na base (a MESMA `shelf-prog` do hero "Jogando
  Atualmente", dourada com `.done` quando completa), sanfona de jogos e
  sugestões da RAWG. Testes: `tests/franchises.test.mjs`.
- `js/covers.js` — capas e fundos: `autoVerticalCover` (capa vertical em
  streaming), `autoBanner` (fundo horizontal automático — devolve só a URL, que
  fica no campo `banner` do jogo), `bannerUrlOf` (userBanner > banner) e o
  buscador manual. Testes: `tests/covers.test.mjs`.
- `js/ui.js` — página do jogo (banner "capa de Facebook" a partir de `banner`/
  `userBanner`, screenshots do usuário, atalhos de capa/fundo; a busca
  automática salva o fundo em `saveGame` e na primeira abertura).
  Testes: `tests/ui.test.mjs`.
- `js/steam.js` — persona/avatar (sempre `avatarfull`), chave, logout.
  Testes: `tests/steam.test.mjs`.
- `js/achievements.js` — gamificação: toda conquista tem `xp` único e positivo
  (o teste de integridade exige), `levelFromXp`/`gamerXp`/`rankOf` (níveis são
  derivados das conquistas — nada é migrado), `buildContext` alimenta os testes
  de detecção. Testes: `tests/achievements.test.mjs`.
- `js/icons.js` — ícones Phosphor + `STORE_ICONS`/`brandImg`: os logos das lojas
  (Steam, GOG, Epic, Itch.io, Amazon Games) usam SEMPRE `brandImg` (classe
  `.brand-ico`) em hub, categoria e plataforma — é o que mantém a proporção
  igual em todo lugar. O teste confere que todo `icons/...` citado existe.
- `js/stores.js` + `js/steam.js` — categorias e plataformas das lojas ganham o
  logo pela passada idempotente `applyStoreCatIcons()` (boot): preserva ícone
  que o usuário escolheu, só troca os padrões antigos do app.
  Testes: `tests/stores.test.mjs`.
- `js/share.js` — imagens compartilháveis: TODAS levam o link
  `anywheregamer.blogspot.com/p/zeralog.html` no rodapé (teste confere), a
  janela `#modal-share` é tela cheia, e o Gamer ID (foto, nível, contadores,
  bio e prateleira de jogando) é renderizado por `renderGamerId()`.
  Testes: `tests/share.test.mjs`.
- `index.html` — onclicks, ids usados pelo JS, encoding.
  Testes: `tests/static.test.mjs`.
