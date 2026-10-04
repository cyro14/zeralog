# ZeraLog

**Seu backlog de jogos, do "quero jogar" ao "zerei".** O ZeraLog é um app web (PWA) para organizar a fila de jogos, acompanhar o que você está jogando, registrar o que já zerou e entender seus hábitos, tudo direto no navegador, sem conta e sem servidor.

| | |
|---|---|
| 🌐 **Abrir o app** | **<https://cyro14.github.io/zeralog/>** |
| 📝 **Página do projeto no blog Anywhere Gamer** | **<https://anywheregamer.blogspot.com/p/zeralog.html?m=1>** |

> No celular, abra o link e use **"Adicionar à tela inicial"** (Chrome/Android) ou **"Compartilhar → Adicionar à Tela de Início"** (Safari/iOS) para instalar como um app. A página do blog também traz o passo a passo de instalação.

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Galeria](#galeria)
3. [Funcionalidades](#funcionalidades)
4. [Guia rápido de uso](#guia-rápido-de-uso)
5. [Dados, backup e privacidade](#dados-backup-e-privacidade)
6. [Serviços externos usados](#serviços-externos-usados)
7. [Estrutura do projeto](#estrutura-do-projeto)
8. [Rodando localmente](#rodando-localmente)
9. [Modelo de dados](#modelo-de-dados)
10. [Limitações conhecidas](#limitações-conhecidas)
11. [Perguntas frequentes](#perguntas-frequentes)
12. [Créditos](#créditos)

---

## Visão geral

- **Sem cadastro e sem backend.** Tudo fica salvo no `localStorage` do seu navegador. Você é dono dos dados e pode exportá-los a qualquer momento em um arquivo `.json`.
- **Feito para o celular.** Layout pensado para telas verticais, com ajustes para paisagem e desktop. Instalável como PWA.
- **Automático quando você quer, manual quando precisa.** Digitou o nome do jogo? O app busca capa, gêneros, data de lançamento, nota do Metacritic, descrição e tempo médio. Prefere preencher na mão? Todos os campos continuam editáveis.
- **Mais que uma lista.** Wishlist, Timer de Sessão, diário de bordo, linha do tempo, prateleira de cartuchos, franquias com busca de novos jogos, gráficos de gênero, buscador de capas verticais, 12 temas e conquistas.

## Galeria

Capturas geradas com dados de exemplo (as capas são ilustrações de teste).

| Fila | Prateleira (Fila) | Quick Match |
|:---:|:---:|:---:|
| ![Fila](docs/screenshots/01-fila.jpg) | ![Prateleira](docs/screenshots/02-fila-prateleira.jpg) | ![Quick Match](docs/screenshots/03-quick-match.jpg) |

| Zerados: linha do tempo | Zerados: prateleira | Wishlist |
|:---:|:---:|:---:|
| ![Timeline](docs/screenshots/04-zerados-timeline.jpg) | ![Prateleira de zerados](docs/screenshots/05-zerados-prateleira.jpg) | ![Wishlist](docs/screenshots/06-wishlist.jpg) |

| Gêneros e contínuos | Franquias e conquistas | Conquistas |
|:---:|:---:|:---:|
| ![Gêneros](docs/screenshots/07-estatisticas-generos.jpg) | ![Franquias](docs/screenshots/08-franquias.jpg) | ![Conquistas](docs/screenshots/09-conquistas.jpg) |

| Jogos Contínuos | Wiki integrada | Cadastro automático |
|:---:|:---:|:---:|
| ![Contínuos](docs/screenshots/10-continuos.jpg) | ![Wiki](docs/screenshots/11-wiki.jpg) | ![Cadastro automático](docs/screenshots/12-adicionar-automatico.jpg) |

| Estatísticas em submenus | Franquia em sanfona | Adicionar da franquia |
|:---:|:---:|:---:|
| ![Submenus](docs/screenshots/14-estatisticas-submenus.jpg) | ![Sanfona](docs/screenshots/15-franquia-sanfona.jpg) | ![Adicionar da franquia](docs/screenshots/16-franquia-adicionar.jpg) |

| Buscador de capas | Temas | Tema Oceano |
|:---:|:---:|:---:|
| ![Capas](docs/screenshots/17-buscador-de-capas.jpg) | ![Temas](docs/screenshots/18-temas.jpg) | ![Oceano](docs/screenshots/19-tema-oceano.jpg) |

| Tema Papel | Tema Game Boy |
|:---:|:---:|
| ![Papel](docs/screenshots/20-tema-papel.jpg) | ![Game Boy](docs/screenshots/21-tema-gameboy.jpg) |

Versão desktop: ![Desktop](docs/screenshots/13-desktop.jpg)

---

## Funcionalidades

### 1. Fila e organização

- **Categorias personalizadas.** Crie, renomeie, reordene (setas) e exclua categorias (ex.: "RPGs", "Aventura"). Cada categoria pode ser recolhida e ganhar um **ícone da biblioteca [Phosphor](https://phosphoricons.com)** (veja [Ícones](#14-ícones-phosphor-e-plataformas-como-ícone)).
- **Jogando Atualmente.** Os jogos marcados como "Jogando" sobem para uma seção destacada no topo.
- **Plataformas editáveis.** PC, Nintendo, Playstation, Xbox e Mobile vêm de fábrica, com ícones em SVG. Adicione outras, renomeie e troque o ícone por um **Phosphor**, por uma imagem sua ou por um logo achado no Google. Nos cards, a plataforma aparece como **ícone** (em vez do nome), com opção de voltar ao nome em Configurações.
- **Filtros e busca.**
  - Barra de busca por título, franquia, **emulado**, **console original**, **dificuldade** e **contínuo** (ex.: digite `emulado`, `super nintendo` ou `dificil`; funciona sem acento).
  - Chips de plataforma e filtro **Portáteis** ("Ideal para portáteis").
- **Ordenação da fila:** Manual, A-Z, Tempo e Portátil (crescente/decrescente).
- **Modo compacto** (Configurações): lista densa, sem capas.
- **12 temas** com seletor visual em Configurações: Escuro, Preto Total (AMOLED), Claro, Papel (sépia), Oceano, Floresta, Pôr do Sol, Nord, Drácula, Rosa Pastel, Game Boy e Alto Contraste. Cada tema tem contraste revisado e ajusta os controles nativos do navegador (listas, datas, barras de rolagem).
- **Desfazer.** Ações de edição e exclusão aparecem com um aviso "Desfazer".

### 2. Cadastro de jogos (automático ou manual)

- **Busca automática (botão 🌐 Auto).** Digite o nome, toque em **Auto** e escolha o jogo certo entre até 6 resultados. O app preenche **capa**, **descrição**, **gêneros** (traduzidos para PT), **data de lançamento**, **nota Metacritic** e **tempo médio** (via RAWG).
- **Tudo editável.** Revise antes de salvar. Os campos extras ficam em "Mais detalhes".
- **Atalhos úteis:** buscar o tempo no **HowLongToBeat**, a nota no **Metacritic** e a capa no Google.
- **Capa leve.** A imagem é reduzida (lado maior de 420 px) e salva em JPEG pequeno para não estourar o limite do `localStorage`. Em Configurações há um **medidor de armazenamento**.
- **Buscador de capas verticais.** O botão **Buscar capa vertical** (no cadastro) e **Buscar capas automaticamente** (ao tocar na capa de um jogo) mostram candidatas de várias fontes e você escolhe a que preferir: **Wikipédia (EN/PT)** (capa do artigo), **Steam** (capa 600×900, achada pelo link da loja que a RAWG informa), **SteamGridDB** (capas da comunidade para qualquer plataforma; precisa de chave gratuita em Configurações) e **RAWG** (artes horizontais). Capas verticais deixam a prateleira bem mais bonita. Fotos enviadas por você também são reduzidas.
- **Campos do jogo:** plataforma, tempo estimado (horas ou minutos), franquia, horas jogadas, diário de bordo, "Ideal para portáteis".
- **Editar também os zerados.** Jogos concluídos têm o botão **ⓘ Dados do jogo** (editar e buscar automaticamente) e o botão de **editar conclusão** (nota, data, 100%, review).

### 3. Selos: Emulado, Console original e Dificuldade

- **Emulado:** marque quando o jogo é rodado em emulador e informe o **console original** (Super Nintendo, Mega Drive, PlayStation, Game Boy... com sugestões e autocompletar).
- **Dificuldade:** Fácil, Normal, Difícil ou Extremo, com cores próprias.
- Os selos aparecem em todos os cards (fila, zerados, linha do tempo, wishlist) e entram na busca e no Quick Match.

### 4. Zerados

- **Concluir um jogo** pede uma nota (até 10) e permite marcar **100%** e escrever uma review.
- **Três modos de exibição:** **Lista** (agrupada por ano), **Linha do tempo** e **Prateleira**.
- **Linha do tempo.** Feed vertical em ordem cronológica, agrupado por mês, com capa, nota, selo 100% (destacado em dourado), review resumida e botão para inverter a ordem. Jogos sem data vão para "Sem data".
- **Ordenação (lista e prateleira):** Data, Nota, Tempo e Portátil.
- **Cartão de compartilhamento.** Gera uma imagem do jogo concluído (capa, plataforma, nota, data e o selo **"Anywhere Gamer: Ideal para Portáteis"**) para salvar e postar.

### 5. Prateleira ("Shelf View")

Alterne **Cards ↔ Prateleira** na Fila e **Lista ↔ Linha do tempo ↔ Prateleira** nos Zerados. A prateleira mostra só as capas lado a lado, como uma estante de cartuchos retrô:

- cartuchos com moldura, "dedos" e tábua de madeira sob cada fileira;
- **selo dourado** nos 100%, nota no canto e ponto indicador de "jogando" ou "em sessão";
- **toque em um cartucho** para abrir os detalhes (capa grande, selos, horas, review ou diário) e as ações rápidas: iniciar sessão, jogar agora, compartilhar, wiki, dados do jogo e editar conclusão;
- busca e filtros continuam funcionando na prateleira.

### 6. Wishlist (Desejos)

- Aba própria para os jogos que você ainda quer comprar ou baixar, com o mesmo cadastro (inclusive busca automática), **observação** (preço, loja, link) e **categoria de destino**.
- **Para a fila** e **Jogar agora** movem o jogo com um clique, levando capa, dados e franquia, sem redigitar nada.

### 7. Timer de Sessão (modo imersivo)

- Jogos em "Jogando" têm um botão ▶. Ao tocar, uma **barra discreta fixa no topo** mostra o jogo e o cronômetro em tempo real.
- O horário de início fica salvo: o tempo continua correto mesmo se você **fechar a aba ou recarregar**.
- Ao **Encerrar**, você ajusta os minutos (se fez pausas), vê a prévia "3,5h → 4,5h" e escolhe **Somar às horas**, **Descartar** ou **Continuar jogando**. Também pode **anotar no diário** na hora.
- Uma sessão por vez.

### 8. Diário de Bordo

- Campo de texto livre por jogo, com **entradas datadas** (`[03/10/2026] texto`) sempre no topo.
- Botão **Anotar no diário** nos jogos contínuos e anotação rápida ao fim de cada sessão.
- Diários grandes aparecem **recolhidos** (2 linhas) com **Ver tudo / Recolher**.

### 9. Jogos Contínuos (Live Service / Sandbox infinito)

- Marque **Jogo Contínuo** para jogos sem fim (Minecraft, Rocket League, MMOs...). Eles ficam numa **seção própria** e **não têm "Zerado" nem 100%**.
- O foco é **somar horas** (Timer de Sessão) e manter o **diário** (feitos, mods, atualizações de saves).
- **Horas isoladas:** o painel Status mostra o tempo total e a divisão por jogo, e esse tempo **não entra** em Zerados, Fila, gráficos, conquistas, franquias, Quick Match nem na roleta.
- Desmarcando "contínuo", o jogo volta para a categoria de origem. Jogos já zerados não podem virar contínuos.

### 10. Quick Match e roleta

Para vencer a paralisia de escolha, o painel **Quick Match** filtra a fila por humor:

- **Duração:** Rápido (< 5h), Médio (5–20h), Denso (20h+).
- **Dificuldade:** Fácil, Normal, Difícil, Extremo.
- **Estilo:** RPG, Ideal para portátil, **Emulado** e qualquer gênero presente na fila.
- Exemplos: *RPG denso* = RPG + Denso; *algo rápido na cama* = Rápido + Ideal para portátil.
- A lista mostra os jogos que combinam (do mais curto ao mais longo), cada um com botão **Jogar**.
- O botão **Sortear** escolhe entre os jogos filtrados, informa "Entre N jogos: ..." e oferece **Sortear outro** sem repetir. A roleta só considera a fila (não sorteia o que já está em "Jogando").

### 11. Wiki integrada (leitor dentro do app)

Cada jogo tem um botão de **lupa** que abre a wiki dele numa janela do próprio app:

- **Vínculo automático.** No primeiro uso, o app procura a wiki do jogo: Yugipedia (títulos Yu-Gi-Oh), Bulbapedia (Pokémon), wikis do **Fandom** (pelo nome do jogo ou da franquia) e Wikipédia PT/EN. Achou, vincula e lembra.
- **Seletor manual.** Escolha a wiki, pesquise, abra a página certa e toque em **Vincular a este jogo**.
- **Outra wiki.** Cole o endereço de qualquer wiki MediaWiki (ex.: `hollowknight.fandom.com`); o app descobre a API sozinho.
- **Leitor básico:** pesquisa com lupa, links internos abrem na própria janela, botão Voltar e "Abrir no navegador".
- **Localizar no texto (Ctrl+F).** Botão de lupa ou **Ctrl+F**: destaca todas as ocorrências (sem diferenciar maiúsculas ou acentos), mostra "3/12", navega com **Enter / Shift+Enter** e **Esc** fecha só a busca.
- O conteúdo é buscado pela API e **sanitizado** (sem scripts, estilos ou eventos embutidos), por isso funciona mesmo em sites que bloqueiam iframe.

### 12. Estatísticas (em submenus)

A aba **Status** é dividida em submenus, e a escolha fica salva:

- **Visão geral:** zerados, jogando, fila, 100%, horas estimadas, nota média e gráfico de distribuição.
- **Gêneros:** gráfico de pizza/rosca (Chart.js) com a proporção dos gêneros, legenda com contagem e %, bases **Jogados**, **Só zerados** (com filtro por **ano**) ou **Biblioteca inteira**. Sem Chart.js (offline), o app desenha uma pizza equivalente em SVG.
- **Franquias:** veja abaixo.
- **Contínuos:** horas isoladas por jogo (seção 9).
- **Conquistas:** grade com todas as conquistas e o progresso (ex.: 12/21).

**Franquias.** Agrupe jogos por franquia/coleção (Zelda, Metroid, Dark Souls...) e veja barra e % de conclusão por franquia, progresso geral e quantas estão completas.

- **Toque em uma franquia** para abrir a lista dos jogos dela (capa, plataforma, status e nota; inclui os da wishlist). Uma franquia aberta por vez.
- **Procurar mais jogos:** busca jogos da mesma série na RAWG (usa `game-series` quando você já tem jogos da franquia adicionados pela busca automática, mais uma busca pelo nome), escondendo os que você já tem.
- **Toque em um resultado** para abrir o cadastro já preenchido (título, capa, gêneros, data, nota, descrição e franquia), na categoria que você mais usa para essa franquia. O botão **+ Desejo** manda direto para a wishlist.
- **Ver na lista** filtra a Fila pela franquia. Jogos contínuos não entram na conta.

### 13. Conquistas

21 conquistas, calculadas ao vivo a partir dos seus dados, com aviso ao desbloquear:

| Conquista | Como ganhar |
|---|---|
| Primeiro Passo / Embalado / Mestre do Backlog | Zerar 1 / 5 / 10 jogos |
| Colecionador | Todos os jogos com capa |
| Multipotencial | Jogos em 3+ plataformas |
| Maratonista | 100h+ de jogos na lista |
| Crítico de Arte | Avaliar 10 jogos zerados |
| Perfeccionista / Lendário | 100% em 1 / 5 jogos |
| Sonhador | 5 jogos na wishlist |
| Desejo Realizado | Mover um jogo da wishlist para a biblioteca |
| Hora de Jogar | Registrar a primeira sessão |
| Dedicação Total | 10h somadas em sessões |
| Sem Fim | 100h em jogos contínuos |
| Cronista de Bordo | 10 entradas no Diário de Bordo |
| Completista | Zerar todos os jogos de uma franquia (3+) |
| Retrô | 3 jogos emulados |
| Sobrevivente | Zerar um jogo em dificuldade Difícil ou Extremo |
| Explorador de Wikis | Vincular wikis a 5 jogos |
| Eclético | Zerar jogos de 5 gêneros diferentes |
| Prateleira Cheia | 15 jogos zerados com capa |

Ao atualizar o app, conquistas que você já cumpria são registradas em silêncio, sem uma enxurrada de avisos.

### 14. Ícones Phosphor e plataformas como ícone

- **Categorias com ícone.** Ao criar ou editar uma categoria, toque em **Escolher ícone (Phosphor)**: busque por qualquer nome em inglês (`sword`, `ghost`, `game-controller`...) entre todos os ícones da biblioteca ou use as sugestões para jogos, e escolha o estilo (Regular, Negrito, Preenchido, Duotone, Leve ou Fino). O ícone aparece no cabeçalho da categoria.
- **Plataformas com ícone Phosphor.** Em Configurações → Editar Plataformas, o botão de formas abre o mesmo seletor.
- **Plataforma como ícone nos cards.** Fila, zerados, linha do tempo, wishlist, franquias e detalhes mostram o **ícone da plataforma** (com o nome como dica). Em Configurações → **Plataforma nos cards** dá para alternar entre **Ícone** e **Nome**.
- Os ícones Phosphor (licença MIT) são carregados da CDN do jsDelivr sob demanda; só o nome e o estilo ficam salvos. Sem internet na primeira vez, o ícone não aparece (o nome continua visível).

---

## Guia rápido de uso

1. **Crie uma categoria** (botão **+ Adicionar Categoria** na Fila).
2. **Adicione um jogo** com **+ Jogo**: digite o nome e toque em **🌐 Auto** (ou preencha manualmente). Escolha plataforma e, se quiser, franquia, dificuldade e selos.
3. **Comece a jogar:** marque **Jogando**. Use ▶ para cronometrar a sessão e anote no diário.
4. **Zerou?** Marque **Zerado**, dê a nota e, se fez tudo, marque **100%**. O jogo vai para a aba **Zerados**.
5. **Sem ideia do que jogar?** Abra o **Quick Match** ou toque em **Sortear**.
6. **Quer jogar algo no futuro?** Mande para a aba **Desejos** e mova para a fila com um clique.
7. **Salve um backup** de vez em quando (ícone de disquete no topo).

## Dados, backup e privacidade

- **Onde ficam os dados:** no `localStorage` do navegador (chave `myBacklogData`), mais a sessão em andamento (`zeralog_session`), o tema (`zeralog_theme`) e, se você configurar, as chaves da RAWG (`zeralog_rawg_key`) e do SteamGridDB (`zeralog_sgdb_key`).
- **Backup:** o ícone de **disquete** abre o painel para **Baixar Backup (.json)** e **Restaurar Backup**. Faça backup antes de limpar os dados do navegador ou trocar de aparelho. Backups antigos são migrados automaticamente.
- **Sem rastreamento.** O app não tem conta, analytics nem servidor próprio. Os dados só saem do aparelho quando você usa as buscas externas descritas abaixo.
- **Redefinição geral** (em Configurações) apaga tudo; use com cuidado.

## Serviços externos usados

| Serviço | Para quê | O que é enviado |
|---|---|---|
| [RAWG](https://rawg.io/apidocs) | Busca automática de dados e capas | Nome digitado e a chave de API |
| APIs MediaWiki (Wikipédia, Yugipedia, Bulbapedia, Fandom e outras que você adicionar) | Leitor de wikis | Termos de busca e títulos de páginas |
| [Wikipédia](https://www.mediawiki.org/wiki/Extension:PageImages) (`pageimages`) | Candidatas no buscador de capas | Nome do jogo |
| CDN da Steam | Capa vertical 600×900 de jogos de PC | Nada (baixa a imagem) |
| [SteamGridDB](https://www.steamgriddb.com/api/v2) (opcional) | Capas da comunidade para qualquer plataforma | Nome do jogo e a sua chave |
| [Phosphor Icons](https://phosphoricons.com) via jsDelivr | Ícones de categorias e plataformas | Nada (baixa CSS e fonte) |
| [Chart.js](https://www.chartjs.org/) (CDN) | Gráficos | Nada (carrega o script) |
| [html2canvas](https://html2canvas.hertzen.com/) (CDN) | Imagem do cartão de compartilhamento | Nada (carrega o script) |
| corsproxy.io (último recurso) | Baixar uma capa quando o site de origem bloqueia o acesso direto | URL da imagem |

**Chave do SteamGridDB (opcional).** Crie grátis em steamgriddb.com (Preferências → API) e cole em **Configurações → Chave SteamGridDB**. Ela é enviada apenas ao SteamGridDB e fica só no seu navegador (`zeralog_sgdb_key`). Se o navegador bloquear a chamada direta, o buscador avisa e continua com as outras fontes.

**Chave da RAWG.** O app traz uma chave padrão, que pode atingir o limite de uso. Se a busca automática falhar, crie uma chave gratuita em <https://rawg.io/apidocs> e cole em **Configurações → Chave da API RAWG**. O app mostra mensagens claras: chave recusada, limite atingido ou sem conexão.

## Estrutura do projeto

```
zeralog/
├── index.html          # estrutura da página e diálogos
├── style.css           # estilos (temas, cards, prateleira, wiki, etc.)
├── manifest.json       # configuração do PWA
├── docs/screenshots/   # imagens usadas neste README
└── js/
    ├── main.js         # ponto de entrada: liga os módulos e expõe as funções ao HTML
    ├── store.js        # dados (appData), localStorage, migração de versões antigas
    ├── ui.js           # renderização, modais, fila, zerados, wishlist, timeline, prateleira, estatísticas
    ├── gameApi.js      # busca automática (RAWG), capas, tratamento de erros
    ├── wiki.js         # leitor de wikis (MediaWiki), vínculo automático, Fandom, localizar no texto
    ├── session.js      # Timer de Sessão e entradas de diário
    ├── quickmatch.js   # filtros de humor e roleta
    ├── genres.js       # gráfico de gêneros (Chart.js + alternativa em SVG)
    ├── franchises.js   # franquias em sanfona e busca de mais jogos da série
    ├── covers.js       # buscador de capas verticais (Wikipédia, Steam, SteamGridDB, RAWG)
    ├── themes.js       # lista de temas e seletor visual
    ├── phosphor.js     # seletor de ícones Phosphor (categorias e plataformas)
    ├── platforms.js    # plataforma como ícone ou nome nos cards
    ├── achievements.js # conquistas
    ├── card.js         # cartão de compartilhamento
    └── icons.js        # ícones SVG
```

> `js/app.js` e `js/sw.js` são resquícios de versões anteriores e não são carregados pelo `index.html` atual.

## Rodando localmente

É um site estático: não há build nem dependências para instalar. Os módulos ES exigem um servidor HTTP (não funcionam via `file://`):

```bash
git clone https://github.com/cyro14/zeralog.git
cd zeralog
python3 -m http.server 8000
# abra http://localhost:8000
```

Qualquer servidor estático serve (`npx serve`, extensão Live Server do VS Code etc.). Para publicar, basta hospedar a pasta (ex.: GitHub Pages).

## Modelo de dados

Resumo do que é salvo (o objeto completo vai no backup `.json`):

```jsonc
{
  "settings": { "sort": "manual", "compact": false, "finishedView": "list", "homeView": "list", "statsPane": "overview", "platformDisplay": "icon" },
  "categories": [{ "id": "c1", "name": "RPGs", "icon": { "name": "sword", "weight": "bold" } }],
  "platforms":  [{ "name": "PC", "icon": "<svg…>" }],
  "games": [{
    "id": "g…", "catId": "c1", "title": "Hollow Knight", "platform": "PC", "rawgId": 1234,
    "state": null,                       // null (fila) | "playing" | "finished"
    "meta": "30h", "hoursPlayed": "12.5", "journalNotes": "[03/10/2026] …",
    "image": "data:image/jpeg;base64,…", "genres": ["Ação"], "released": "2017-02-24",
    "metacritic": 90, "description": "…", "franchise": "Hollow Knight",
    "isPortable": true, "emulated": false, "originalConsole": "", "difficulty": "hard",
    "continuous": false,                 // true: seção própria, sem Zerado/100%
    "userRating": "10", "is100": true, "dateFinished": "20/08/2026", "review": "…",
    "wiki": { "src": "wp-pt", "title": "Hollow Knight" }
  }],
  "wishlist": [{ "id": "w…", "title": "…", "catId": "c1", "note": "…" }],
  "wikis": [{ "id": "fd-…", "name": "…", "api": "https://…/api.php", "articlepath": "/wiki/$1" }],
  "counters": { "sessions": 0, "sessionMinutes": 0, "wishMoved": 0 },
  "unlockedAchievements": ["ach-1"]
}
```

## Limitações conhecidas

- **Tempo "para zerar":** a RAWG só fornece a **média de horas dos usuários dela**, não o tempo do HowLongToBeat (que não tem API pública). Por isso há o atalho para consultar o HLTB e ajustar manualmente.
- **Capas:** a RAWG não tem box art (só artes horizontais). Para capas verticais use o buscador: a Wikipédia e a Steam funcionam sem chave, mas a Steam só cobre jogos de PC, e a Wikipédia depende de o artigo ter capa. A cobertura completa vem do SteamGridDB (com chave). As capas são imagens com direitos dos respectivos donos, guardadas apenas no seu navegador para uso pessoal.
- **SteamGridDB:** não foi possível confirmar se o navegador libera chamadas diretas com a chave; se bloquear, o buscador avisa e segue com as outras fontes.
- **Ícones Phosphor:** dependem da CDN na primeira carga; offline eles ficam ocultos.
- **Descrição:** vem em inglês.
- **Wikis:** funciona com wikis **MediaWiki** (Wikipédia, Fandom, Yugipedia, Bulbapedia...). Sites de outro tipo (ex.: Fextralife) não são suportados. O visual é um leitor simples, sem o tema original, e infoboxes complexas podem ficar básicas. A descoberta automática do Fandom tenta os endereços mais prováveis a partir do nome do jogo ou da franquia; se não achar, use **Outra wiki**.
- **Armazenamento:** o `localStorage` tem limite (~5 MB). As capas são reduzidas, mas bibliotecas muito grandes podem chegar perto do limite; faça backups.
- **Sem sincronização entre aparelhos.** Use o backup `.json` para levar seus dados de um lugar para outro.
- **Timer de Sessão:** uma sessão por vez e sem botão de pausa (ajuste os minutos ao encerrar).
- **Conquistas baseadas em contadores** (Hora de Jogar, Dedicação Total, Desejo Realizado) contam a partir da versão em que foram criadas.

## Perguntas frequentes

**A busca automática parou de funcionar.** Gere sua própria chave grátis em rawg.io/apidocs e cole em Configurações. Se a mensagem falar em conexão, verifique a internet ou um bloqueador de anúncios que barre `api.rawg.io`.

**Perdi meus jogos depois de limpar o navegador.** Os dados ficam no navegador; limpar o armazenamento do site apaga tudo. Restaure pelo arquivo de backup `.json`.

**Um jogo contínuo pode ser zerado?** Não, por definição. Se ele passou a ter um fim para você, desmarque "Jogo Contínuo" (se ele ainda não estiver zerado) e use o fluxo normal.

**Por que um jogo não aparece na roleta?** A roleta e o Quick Match consideram só jogos da fila. Jogos em "Jogando", zerados e contínuos ficam de fora.

**Como mudar a wiki de um jogo?** Abra a lupa do jogo, escolha outra wiki no seletor, pesquise e toque em **Vincular a este jogo**.

## Créditos

- Criado por **Cyro**, para a comunidade do blog **[Anywhere Gamer](https://anywheregamer.blogspot.com/)**, dedicado a jogar em qualquer lugar.
- Dados de jogos: [RAWG](https://rawg.io/). Conteúdo das wikis: Wikipédia, Yugipedia, Bulbapedia, Fandom e outras, de acordo com as licenças de cada uma.
- Bibliotecas: [Chart.js](https://www.chartjs.org/) e [html2canvas](https://html2canvas.hertzen.com/). Ícones de linha no estilo [Lucide](https://lucide.dev/).
- Metacritic e HowLongToBeat são marcas dos respectivos donos; o app apenas abre as buscas nesses sites.
