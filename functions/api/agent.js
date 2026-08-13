const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

export async function onRequestPost({ request, env }) {
  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'PERPLEXITY_API_KEY não configurada' }), { status: 503, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), { status: 400, headers: CORS_HEADERS });
  }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Campo messages (array) é obrigatório' }), { status: 400, headers: CORS_HEADERS });
  }

  let upstream;
  try {
    upstream = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar', messages, max_tokens: 800, temperature: 0.7 })
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Falha ao contactar Perplexity: ${err.message}` }), { status: 502, headers: CORS_HEADERS });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), { status: upstream.status, headers: CORS_HEADERS });
}

export async function onRequestOptions() {
  return new Response('', { headers: CORS_HEADERS });
}
