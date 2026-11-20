# Configuração do Rafaelo

O chat usa a API do Perplexity por meio da Pages Function `functions/api/agent.js`. A chave fica no servidor e não é enviada ao navegador.

## Cloudflare Pages

No painel do Cloudflare, abra **Workers & Pages > seu projeto > Settings > Variables and Secrets** e adicione `PERPLEXITY_API_KEY` como segredo. Faça um novo deploy para disponibilizar a variável às Pages Functions.

## Desenvolvimento Local

Copie `.env.example` para `.dev.vars`, preencha `PERPLEXITY_API_KEY` e inicie o Wrangler:

```powershell
Copy-Item .env.example .dev.vars
npm run dev
```

Não versione `.dev.vars`; ele já está listado no `.gitignore`.

## Teste

Inicie o site local e use o botão de chat para verificar a integração. Sem a variável configurada, a função retorna HTTP 503.
