const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

const LAST_MANUAL_UPDATE = '2026-01-09';

const MOCK_CDBS = [
  { bank: 'XP Investimentos',  rate: 115, minAmount: 1000, liquidity: 'D+0' },
  { bank: 'Inter',             rate: 112, minAmount: 100,  liquidity: 'D+0' },
  { bank: 'Nubank',            rate: 109, minAmount: 1,    liquidity: 'D+0' },
  { bank: 'C6 Bank',           rate: 113, minAmount: 500,  liquidity: 'D+0' },
  { bank: 'BTG Pactual',       rate: 116, minAmount: 5000, liquidity: 'D+1' },
  { bank: 'Sofisa Direto',     rate: 117, minAmount: 1000, liquidity: 'D+30' },
  { bank: 'PagBank',           rate: 110, minAmount: 1,    liquidity: 'D+0' },
  { bank: 'Banco Bradesco',    rate: 105, minAmount: 5000, liquidity: 'D+0' },
  { bank: 'Banco Itaú',        rate: 104, minAmount: 5000, liquidity: 'D+0' },
  { bank: 'Santander',         rate: 106, minAmount: 3000, liquidity: 'D+0' },
  { bank: 'Modal',             rate: 114, minAmount: 1000, liquidity: 'D+1' },
  { bank: 'Banco Mercantil',   rate: 111, minAmount: 1000, liquidity: 'D+0' }
];

let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

async function fetchBCB(seriesCode) {
  try {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/12?formato=json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function onRequestGet() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), { headers: CORS_HEADERS });
  }

  let cdiRate = 11.75;
  let selicRate = 11.75;
  let inflationRate = 4.5;

  try {
    const [cdiData, selicData, ipcaData] = await Promise.all([
      fetchBCB(12),   // CDI diário
      fetchBCB(432),  // SELIC meta anual
      fetchBCB(433)   // IPCA mensal
    ]);

    if (cdiData?.[0]?.valor) {
      const cdiDaily = parseFloat(cdiData[0].valor);
      cdiRate = parseFloat(((Math.pow(1 + cdiDaily / 100, 252) - 1) * 100).toFixed(2));
    }
    if (selicData?.[0]?.valor) {
      selicRate = parseFloat(selicData[0].valor);
    }
    if (ipcaData?.length > 0) {
      const values = ipcaData.map(d => parseFloat(d.valor));
      inflationRate = parseFloat(((values.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100).toFixed(2));
    }
  } catch {
    // Usa valores de fallback definidos acima
  }

  const cdbs = MOCK_CDBS
    .map(cdb => {
      const yieldAnnual = parseFloat((cdiRate * cdb.rate / 100).toFixed(2));
      const monthlyYield = ((Math.pow(1 + yieldAnnual / 100, 1 / 12) - 1) * 100).toFixed(2);
      return {
        bank: cdb.bank,
        name: `CDB ${cdb.rate}% CDI`,
        rate: cdb.rate,
        cdiPercentage: cdb.rate,
        yieldAnnual,
        monthlyYield: parseFloat(monthlyYield),
        minAmount: cdb.minAmount,
        liquidity: cdb.liquidity,
        lastUpdate: new Date().toISOString()
      };
    })
    .sort((a, b) => b.rate - a.rate);

  const result = {
    cdbs: cdbs.slice(0, 12),
    benchmark: { cdi: cdiRate, selic: selicRate, inflation: inflationRate },
    timestamp: new Date().toISOString(),
    lastManualUpdate: LAST_MANUAL_UPDATE,
    source: 'CDI/SELIC: Banco Central do Brasil (BCB) | CDBs: Valores educacionais'
  };

  cache = { data: result, timestamp: now };
  return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
}

export async function onRequestOptions() {
  return new Response('', { headers: CORS_HEADERS });
}
