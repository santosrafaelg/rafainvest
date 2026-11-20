// Cron => workflow a disparar. As chaves precisam ser iguais aos crons do wrangler.toml.
const JOBS = {
  '0 3,9,15,21 * * *': {
    repo: 'santosrafaelg/rafainvest',
    workflow: 'update-economia.yml',
    ref: 'main',
  },
  '10 2,8,14,20 * * *': {
    repo: 'santosrafaelg/rafaIoT',
    workflow: 'update-radar.yml',
    ref: 'main',
  },
};

async function dispatch(env, { repo, workflow, ref }) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'rafa-cron-dispatch',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref }),
    },
  );

  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`Falha ao disparar ${repo}/${workflow}: ${res.status} ${body}`);
  }
  console.log(`Disparado ${repo}/${workflow} (${ref})`);
}

export default {
  async scheduled(event, env, ctx) {
    const job = JOBS[event.cron];
    if (!job) throw new Error(`Cron sem job configurado: ${event.cron}`);
    ctx.waitUntil(dispatch(env, job));
  },
};
