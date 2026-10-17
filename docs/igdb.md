# IGDB no ZeraLog (a "chave" é da Twitch)

A **IGDB** é um banco de jogos mantido pela Twitch desde 2019. Ela **não tem mais
página de "gerar chave"** (`igdb.com/api-box` e a página de API key antiga saíram do
ar — a tela do app apontava para uma delas e caía num 404). Hoje o acesso é assim:

1. Entre em <https://dev.twitch.tv/console/apps> com sua conta Twitch e clique em
   **Registrar aplicativo**.
   - Nome: `ZeraLog` (qualquer um)
   - Categoria: **Integração de site**
   - URL de redirecionamento OAuth: `http://localhost`
2. Depois de criar, copie o **Client ID** e gere um **Client Secret** ("Novo segredo").
3. No ZeraLog: **Configurações → Capas e Busca → IGDB** — cole os dois e toque em
   **Testar IGDB**. O app deve responder `IGDB ok! Teste com "Portal 2"`.

## O que acontece por baixo

| Etapa | Onde roda |
|---|---|
| Token (`client_credentials`) | `POST https://id.twitch.tv/oauth2/token` — direto do navegador (aceita CORS) |
| Validade | ~60 dias (o app guarda e renova sozinho) |
| Consulta (`/v4/games`) | pelo **Worker** do projeto (a `api.igdb.com` não manda CORS) |

A consulta da IGDB não é REST: o corpo do POST é a linguagem deles (Apicalypse), por
exemplo:

```
search "Portal 2"; fields name,cover.image_id; limit 8;
```

As capas viram URLs `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/<image_id>.jpg`.

## Se der errado

- **"A Twitch recusou o Client ID/Secret"** → credenciais erradas ou o segredo foi
  apagado/rotacionado. Gere outro segredo.
- **"Atualize o Worker do projeto"** → o Worker no ar é antigo e ainda não libera
  `api.igdb.com`. Recole `steam-proxy/worker.js` e faça Deploy (veja
  [steam-proxy.md](steam-proxy.md)).
- A IGDB é **opcional**: sem ela as capas continuam vindo da Steam (600×900), do
  HowLongToBeat e da Wikipédia.
