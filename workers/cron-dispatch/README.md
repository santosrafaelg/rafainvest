# rafa-cron-dispatch

Cloudflare Worker que dispara via `workflow_dispatch` os workflows agendados, porque o `schedule` do GitHub Actions atrasa ou pula execuções.

| Cron (UTC) | Repositório | Workflow |
|---|---|---|
| `0 3,9,15,21 * * *` | santosrafaelg/rafainvest | `update-economia.yml` |
| `10 2,8,14,20 * * *` | santosrafaelg/rafaIoT | `update-radar.yml` |

O `schedule` dos workflows continua como reserva (minutos 23 e 47). Se os dois rodarem, o segundo termina com "Sem alterações nos dados".

## Deploy

1. Crie um token fine-grained no GitHub com acesso aos dois repositórios e a permissão **Actions: Read and write**.
2. Na pasta `workers/cron-dispatch`:

```
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Ao alterar os horários, mantenha `crons` em `wrangler.toml` e `JOBS` em `src/index.js` iguais.
