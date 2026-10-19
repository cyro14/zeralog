# Proxy do ZeraLog (Cloudflare Worker)

> **Atualizado em 2026:** o Worker ganhou três hosts novos, passou a repassar mais
> cabeçalhos e o corpo agora é repassado como **binário** (as capas do HLTB,
> `howlongtobeat.com/games/*.jpg`, precisam dos bytes intactos — o `res.text()`
> antigo corrompia imagem). Basta **recolar `steam-proxy/worker.js` inteiro** no
> seu Worker e clicar em **Deploy** de novo — a URL continua a mesma. Sem isso, a
> busca da loja da Steam responde 400, o HowLongToBeat responde 403, a IGDB fica
> sem capas e as capas do HLTB não são baixadas.

# Proxy das lojas/APIs para o ZeraLog (Cloudflare Worker)

O ZeraLog roda 100% no navegador e quase nenhuma dessas APIs aceita chamadas diretas
de navegador (CORS). Este Worker resolve isso: ele recebe a chamada do app e repassa
para o host de destino com os cabeçalhos certos.

**Você (dono do app) faz isso UMA VEZ e todos os usuários usam automaticamente.**

## Passo a passo (≈5 minutos, sem cartão)

1. Crie uma conta grátis em <https://dash.workers.dev> e clique em **Create Worker**.
2. Apague o código de exemplo e cole **todo o conteúdo de `steam-proxy/worker.js`**.
3. Clique em **Deploy**. Copie a URL gerada — algo como
   `https://zeralog-steam.SEU-USUARIO.workers.dev`.
4. No código do ZeraLog, cole a URL na constante `ZERALOG_PROXY` (`js/gameApi.js`) e na
   `STORE_PROXY` (`js/stores.js`) / `DEFAULT_PROXY` (`js/steam.js`), se for outra.

## O que ele libera (ALLOWED_HOSTS)

| Host | Para quê |
|---|---|
| `api.steampowered.com` | biblioteca/perfil da Steam |
| `store.steampowered.com` | busca da loja (nome e ID do jogo → capa 600×900) |
| `auth.gog.com`, `embed.gog.com`, `api.gog.com` | login e biblioteca da GOG |
| `account-public-service-prod*.ol.epicgames.com` | login da Epic |
| `library-service.live.use1a.on.epicgames.com` | biblioteca da Epic |
| `catalog-public-service-prod06.ol.epicgames.com` | nomes dos jogos da Epic |
| `itch.io`, `api.itch.io` | API da Itch.io (chave do usuário) |
| `www.steamgriddb.com`, `api.steamgriddb.com` | capas da comunidade (SteamGridDB) |
| `howlongtobeat.com` | tempo de jogo + box art |
| `api.igdb.com` | fichas e capas da IGDB |

Qualquer outro host recebe `400 Host fora da lista permitida do ZeraLog.` — o Worker
não vira proxy aberto da internet.

## Cabeçalhos repassados

`Authorization`, `Content-Type`, `Client-ID` (IGDB), `x-auth-token` (HowLongToBeat) e
`Accept`. O preflight (`OPTIONS`) já anuncia todos eles em
`Access-Control-Allow-Headers`. A senha do usuário nunca passa por aqui.

## HowLongToBeat: por que o Worker se "disfarça" de navegador

A busca do HLTB (`/api/search/site`) só responde 200 para quem:

1. manda o cabeçalho **`x-auth-token`** com um token curto de `/api/search/site/init`;
2. manda **`Referer: https://howlongtobeat.com/`** — e o navegador **proíbe** o app de
   definir Referer, então só o Worker pode fazer isso;
3. apresenta um **User-Agent de navegador** (o HLTB responde 403 para `ZeraLog/1.0`).

O token vale para a combinação IP + User-Agent, e é por isso que o `init` e a busca
precisam sair do mesmo lugar (o Worker), com o mesmo User-Agent.

## IGDB: o `Client-ID` e o `Bearer`

A IGDB não manda CORS, então toda consulta passa por aqui. O token é gerado direto no
navegador (o `id.twitch.tv` aceita CORS) com o Client ID + Client Secret de um app da
Twitch — veja [docs/igdb.md](igdb.md). O Worker só repassa `Client-ID` e
`Authorization` junto com o corpo da consulta.

## Bônus: usuários não precisarem de chave própria da Steam

A Steam exige uma chave da Web API para ler a biblioteca. Você pode emprestar a sua:

1. Com a sua Steam logada, gere uma grátis em <https://steamcommunity.com/dev/apikey>
   (domínio pode ser qualquer um, ex.: `localhost`).
2. No painel do Worker → **Settings → Variables and Secrets** → Add:
   - Nome: `STEAM_DEFAULT_KEY`
   - Valor: a chave
   - Marque como **Secret**.
3. A partir daí, chamadas que chegarem sem `&key=` usam a sua chave automaticamente —
   o usuário só faz login com a Steam e aperta sincronizar. A versão de 2026 do Worker
   também injeta quando o app antigo (cache do PWA) manda o literal `key=undefined`.

> A chave da Steam só permite **ler** (nome, jogos, horas) dados de perfis públicos.
> Ela não movimenta conta, não compra, não troca itens.

## Limites do plano grátis

100 mil requisições por dia — para o uso do ZeraLog (1-2 chamadas por sincronização) isso
é infinito na prática.
