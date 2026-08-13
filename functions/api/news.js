const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

export async function onRequestGet({ env }) {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), { headers: CORS_HEADERS });
  }

  const apiKey = env.BRAPI_API_KEY || 'd6EkPxHiKsswXcbwg6wzzf';

  try {
    const res = await fetch('https://brapi.dev/api/news?limit=15', {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'rafaInvest/1.0', 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`brapi.dev HTTP ${res.status}`);
    const json = await res.json();

    const news = (json.results || []).map(item => ({
      title: item.title,
      description: item.text || item.summary || '',
      link: item.link || item.url,
      pubDate: item.date || new Date().toISOString(),
      source: item.source || 'Mercado',
      category: 'geral',
      image: item.image || null
    }));

    if (news.length === 0) throw new Error('No news returned');

    const result = { news, total: news.length, timestamp: new Date().toISOString(), source: 'brapi.dev' };
    cache = { data: result, timestamp: now };

    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
  } catch (error) {
    if (cache.data) {
      return new Response(JSON.stringify({ ...cache.data, error: 'Using cached data', cached: true }), { headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch news', message: error.message, news: [] }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequestOptions() {
  return new Response('', { headers: CORS_HEADERS });
}
