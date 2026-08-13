const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export async function onRequestGet() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), { headers: CORS_HEADERS });
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?' + new URLSearchParams({
      vs_currency: 'usd',
      order: 'volume_desc',
      per_page: '20',
      page: '1',
      sparkline: 'false',
      price_change_percentage: '24h'
    }), {
      headers: { 'User-Agent': 'rafaInvest/1.0', 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const coins = await res.json();

    const cryptos = coins
      .sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h))
      .slice(0, 12)
      .map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        volume24h: coin.total_volume,
        marketCap: coin.market_cap,
        image: coin.image,
        lastUpdate: new Date().toISOString()
      }));

    const result = { cryptos, timestamp: new Date().toISOString() };
    cache = { data: result, timestamp: now };

    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
  } catch (error) {
    if (cache.data) {
      return new Response(JSON.stringify({ ...cache.data, error: 'Using cached data', cached: true }), { headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch crypto data', message: error.message, cryptos: [] }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequestOptions() {
  return new Response('', { headers: CORS_HEADERS });
}
