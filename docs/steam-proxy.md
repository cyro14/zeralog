# Proxy da Steam para o ZeraLog (Cloudflare Worker)

O ZeraLog roda 100% no navegador e a Steam Web API não aceita chamadas diretas de
navegadores (CORS). Este Worker resolve isso: ele recebe a chamada do app e repassa
para `api.steampowered.com` com os cabeçalhos certos.

**Você (dono do app) faz isso UMA VEZ e todos os usuários usam automaticamente.**

## Passo a passo (≈5 minutos, sem cartão)

1. Crie uma conta grátis em <https://dash.workers.dev> e clique em **Create Worker**.
2. Apague o código de exemplo e cole **todo o conteúdo de `steam-proxy/worker.js`**.
3. Clique em **Deploy**. Copie a URL gerada — algo como
   `https://zeralog-steam.SEU-USUARIO.workers.dev`.
4. No código do ZeraLog, abra `js/steam.js` e cole a URL na constante
   `DEFAULT_PROXY`:

   ```js
   const DEFAULT_PROXY = 'https://zeralog-steam.SEU-USUARIO.workers.dev';
   ```

   Pronto. Todos os usuários passam a usar esse proxy automaticamente.

## Bônus: usuários não precisarem de chave própria

A Steam exige uma chave da Web API para ler a biblioteca. Você pode emprestar a sua:

1. Com a sua Steam logada, gere uma grátis em <https://steamcommunity.com/dev/apikey>
   (domínio pode ser qualquer um, ex.: `localhost`).
2. No painel do Worker → **Settings → Variables and Secrets** → Add:
   - Nome: `STEAM_DEFAULT_KEY`
   - Valor: a chave
   - Marque como **Secret**.
3. A partir daí, chamadas que chegarem sem `&key=` usam a sua chave automaticamente —
   o usuário só faz login com a Steam e aperta sincronizar.

> A chave da Steam só permite **ler** (nome, jogos, horas) dados de perfis públicos.
> Ela não movimenta conta, não compra, não troca itens. O Worker também limita o
> destino a `api.steampowered.com`, então ele não serve para nenhum outro site.

## Limites do plano grátis

100 mil requisições por dia — para o uso do ZeraLog (1-2 chamadas por
sincronização) isso é infinito na prática.
