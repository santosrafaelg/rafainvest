 # rafaInveste

Plataforma educacional para aprender sobre investimentos brasileiros, com conteúdo interativo, simuladores e dados de mercado.

## Funcionalidades

- Conteúdo sobre CDBs, FIIs, Tesouro Direto, criptomoedas, ações e consórcios.
- Questionário de perfil e recomendações educacionais por nível de risco.
- Painel com cotações de criptoativos, FIIs e CDBs.
- Calculadoras de financiamento e juros compostos.
- Página de economia com indicadores, notícias e taxas de crédito.

## Desenvolvimento

Requer Node.js 18 ou superior.

```bash
npm install
npm run dev
```

O Wrangler serve os arquivos de `public/` e as Pages Functions em `functions/`. A aplicação fica disponível no endereço local exibido pelo Wrangler.

Para credenciais locais, copie `.env.example` para `.dev.vars` e configure `BRAPI_API_KEY`. A chave é opcional para a Brapi e não deve ser commitada. Em produção, configure variáveis em **Cloudflare Dashboard > Workers & Pages > Settings > Variables and Secrets**.

## Cloudflare Pages

Conecte o repositório ao Cloudflare Pages e configure:

- Build command: `npm run build`
- Build output directory: `public`
- Root directory: `/`

As funções em `functions/api/` são disponibilizadas em `/api/`. O chat requer o segredo `PERPLEXITY_API_KEY` configurado no ambiente Cloudflare.

## Dados de Economia

O script `npm run feed` coleta notícias e indicadores de fontes RSS e do Banco Central e atualiza `public/data/economia.json`. O workflow `.github/workflows/update-economia.yml` publica os dados na branch `data` quatro vezes ao dia e também pode ser acionado manualmente. Para alterar fontes, edite `FEEDS` e `GNEWS_QUERIES` em `scripts/build-economia.mjs`.

## Tecnologias

- HTML, CSS e JavaScript sem framework no frontend.
- Cloudflare Pages Functions e APIs públicas no backend.
- Chart.js para gráficos.

## Aviso Legal

Este projeto é educacional e não constitui aconselhamento financeiro. Dados de terceiros podem conter atrasos ou imprecisões. Consulte um profissional certificado antes de investir.