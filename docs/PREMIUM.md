# ZeraLog: banco de dados e versão Premium

Este guia responde a uma dúvida de projeto: **dá para ter dois bancos, um para a versão grátis e outro para a Premium?** Resposta curta: **dá**, e o app já está preparado para isso. Mas há uma decisão importante sobre *o que* cobrar.

## 1. O que existe hoje

- **Banco local (IndexedDB), para todos.** Guarda os dados, as imagens (tabela própria) e os pontos de restauração, direto no aparelho. **Não custa nada para você**, porque roda no navegador do usuário.
- **Modo compatível (localStorage)**, só se o navegador não permitir IndexedDB.
- **Interface única de provedor** (`js/db.js`): `load()`, `save()`, `snapshot()`, `listSnapshots()`, `getSnapshot()` e `estimate()`. O resto do app (`js/store.js`) não sabe qual banco está por baixo.
- **`registerProvider(nome, fabrica)`** em `js/db.js` e **`js/plan.js`** (que escolhe o provedor pelo plano) são os pontos de encaixe para um banco de nuvem.

## 2. O que vale cobrar (recomendação)

| Recurso | Custo para você | Sugestão |
|---|---|---|
| Armazenar imagens e dados **no aparelho** (IndexedDB) | Zero | **Grátis para todos.** Limitar isso é arbitrário e não rende nada. |
| **Sincronizar entre aparelhos** (celular, PC, tablet) | Servidor, armazenamento e banda | **Premium** |
| **Backup automático na nuvem** | Armazenamento | **Premium** |
| Compartilhar a prateleira por link público, perfil público | Servidor | **Premium** |
| Temas extras, ícones, capas em lote | Zero | Grátis, ou "apoiador" simbólico |

Ou seja: **os dois bancos** seriam *local (grátis)* e *local + nuvem (Premium)*. O banco local continua sendo a fonte principal mesmo no Premium (o app segue funcionando offline), e a nuvem sincroniza em segundo plano.

## 3. Aviso importante: trava no navegador não protege nada

O ZeraLog roda inteiro no navegador. Qualquer limite feito só em JavaScript (por exemplo, "máximo de 50 capas no plano grátis") pode ser removido por quem abrir o console ou editar o código. Por isso `js/plan.js` é só **organização da interface**. Para cobrar de verdade:

1. **Servidor valida o plano** (login + assinatura) e
2. **o recurso pago só existe no servidor** (sincronização, armazenamento na nuvem). Quem não paga simplesmente não tem acesso ao banco da nuvem.

Se o recurso pago for só local (ex.: "mais capas"), qualquer um consegue burlar. Cobrar por nuvem resolve isso naturalmente.

## 4. Arquitetura sugerida para o Premium

```
Navegador (PWA)                       Servidor
┌──────────────────────┐   HTTPS   ┌──────────────────────────┐
│ app + IndexedDB      │ <───────> │ Auth (login)             │
│ (fonte principal)    │           │ Tabela "assinaturas"     │
│ provedor "cloud"     │           │ Banco (Postgres/Firestore)│
└──────────────────────┘           │ Armazenamento de imagens │
                                   │ Webhook do pagamento     │
                                   └──────────────────────────┘
```

**Opções de back-end** (todas têm camada gratuita; confira preços e limites atuais antes de decidir):

- **Supabase**: Postgres + Auth + Storage + regras de acesso por linha (RLS). Encaixa bem: uma tabela por coleção, imagens no Storage, RLS liberando escrita só para quem tem assinatura ativa.
- **Firebase**: Auth + Firestore + Storage, com regras de segurança.
- **Cloudflare** (Workers + D1/R2): mais barato em escala, mais trabalho manual.

**Pagamento** (a assinatura chega ao servidor por *webhook*): Stripe, Mercado Pago, ou plataformas de produtos digitais (Kiwify, Hotmart, Gumroad), além de apoio recorrente (Apoia.se, Patreon, Ko-fi). Para começar sem montar tudo, dá para vender uma **chave de licença** que o servidor valida.

## 5. Passos para implementar

1. **Conta e login** (Supabase/Firebase Auth) no app, opcional: quem não entra continua só no banco local.
2. **Tabela de assinaturas** (usuário, plano, validade), atualizada pelo webhook do pagamento.
3. **Provedor de nuvem** em `js/cloud.js`, implementando a mesma interface de `js/db.js`:
   ```js
   // esboço
   export async function createCloudProvider(session) {
       const local = await createIdbProvider();          // o local continua sendo o cache
       return {
           ...local, name: 'cloud', label: 'Nuvem (Premium)',
           async save(args) { await local.save(args); queueUpload(args); },   // grava local e envia em segundo plano
           async load() { await pullChanges(); return local.load(); }          // baixa mudanças e lê do local
       };
   }
   // registro:  registerProvider('cloud', () => createCloudProvider(session));
   ```
4. **Sincronização**: cada item (jogo, desejo, categoria) com `updatedAt`; vale o mais recente por item ("último a gravar vence"), e exclusões marcadas com `deletedAt` em vez de apagar na hora. Imagens enviadas ao Storage em arquivos separados, baixadas sob demanda.
5. **`plan.js`**: ler o plano da sessão (vindo do servidor, não de `localStorage`) e liberar `cloudSync`.
6. **Migração**: o primeiro login Premium sobe o banco local para a nuvem (com confirmação), mantendo o IndexedDB como cache.
7. **Privacidade (LGPD)**: política de privacidade, exportação e exclusão dos dados na nuvem, e criptografia em trânsito (HTTPS) e em repouso (padrão nesses serviços).

## 6. Resumo

- Trocar o banco local para IndexedDB (feito) resolve **espaço e robustez para todos**, sem custo.
- **Alternar entre dois bancos por plano é possível** (a estrutura já permite), mas o que faz sentido cobrar é a **nuvem**, não o espaço local.
- Para a versão paga funcionar de verdade, é preciso um **servidor** com login, assinatura validada e o banco da nuvem.
