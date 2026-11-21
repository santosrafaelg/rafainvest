const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

const TOP_FIIS = ['KNRI11', 'HGLG11', 'VISC11', 'MXRF11', 'XPML11', 'BTLG11'];

const MOCK_FIIS = [
  { ticker: 'KNRI11', name: 'Kinea Renda Imobiliária FII', price: 98.50, change24h: 1.2, yield: 0.85 },
  { ticker: 'HGLG11', name: 'CSHG Logística FII', price: 165.30, change24h: -0.5, yield: 0.78 },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers FII', price: 107.20, change24h: 0.8, yield: 0.92 },
  { ticker: 'MXRF11', name: 'Maxi Renda FII', price: 10.15, change24h: 0.3, yield: 0.88 },
  { ticker: 'XPML11', name: 'XP Malls FII', price: 104.80, change24h: 1.5, yield: 0.95 },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística FII', price: 112.40, change24h: -0.2, yield: 0.82 }
];

let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 horas

export async function onRequestGet({ env }) {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), { headers: CORS_HEADERS });
  }

  const apiKey = env.BRAPI_API_KEY;
  let fiisData = [];

  try {
    for (const ticker of TOP_FIIS) {
      try {
        const headers = { 'User-Agent': 'rafaInveste/1.0', 'Accept': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(`https://brapi.dev/api/quote/${ticker}?range=1d&fundamental=true`, { headers });

        if (res.ok) {
          const json = await res.json();
          const fii = json.results?.[0];
          if (fii) {
            fiisData.push({
              ticker: fii.symbol,
              name: fii.longName || fii.shortName || fii.symbol,
              price: (fii.regularMarketPrice || 0).toFixed(2),
              change24h: (fii.regularMarketChangePercent || 0).toFixed(2),
              yield: (fii.dividendsData?.yield || 0.85).toFixed(2),
              volume: fii.regularMarketVolume || 0,
              lastUpdate: new Date().toISOString()
            });
          }
        }
        // Delay entre requisições para evitar rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch {
        // Continua com próximo ticker
      }
    }

    if (fiisData.length === 0) throw new Error('No data from brapi.dev');
  } catch {
    fiisData = MOCK_FIIS.map(fii => ({
      ...fii,
      price: (fii.price * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2),
      change24h: (fii.change24h + (Math.random() - 0.5) * 0.5).toFixed(2),
      yield: fii.yield.toFixed(2)
    }));
  }

  const result = {
    fiis: fiisData.map(fii => ({
      ticker: fii.ticker,
      name: fii.name,
      price: fii.price,
      change24h: fii.change24h,
      yield: fii.yield,
      volume: fii.volume || 0,
      lastUpdate: fii.lastUpdate || new Date().toISOString()
    })),
    timestamp: new Date().toISOString(),
    source: fiisData[0]?.lastUpdate ? 'brapi.dev' : 'mock'
  };

  cache = { data: result, timestamp: now };
  return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
}

export async function onRequestOptions() {
  return new Response('', { headers: CORS_HEADERS });
}
