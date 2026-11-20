import { fileURLToPath } from 'node:url';
import {
  fetchJson, fetchText, parseFeed, clip, itemId, normalize, dedupe,
  mapLimit, readJsonSafe, writeJsonIfChanged, daysAgoIso
} from './lib/feed-utils.mjs';

const OUT = fileURLToPath(new URL('../public/data/economia.json', import.meta.url));
const RETENTION_DAYS = 14;
const MAX_ITEMS = 220;
const PILLAR_CAP = 80;

const ECON_RE = /\b(econom|fiscal|imposto|tribut|orcament|juros|selic|copom|inflac|ipca|divida publica|credito|\bpib\b|salario minimo|haddad|fazenda|tarifa|deficit|superavit|arcabouc|desoner|reforma tributaria|previdenc|desemprego|dolar|cambio|tesouro|petrobras|combustiv|bolsa|ibovespa|financiament|fgts|isenc|arrecad|bndes|banco central|gastos? publico|despesa|meta fiscal|\bpec\b|medida provisoria|\binss\b|renda fixa|investiment)/;

const JUNK_RE = /\b(mega-?sena|lotofacil|quina\b|loteria|loterias|horoscopo|signos?\b|bbb\s?\d|novela|futebol|brasileirao|libertadores|copa do brasil|campeonato|palpites?|fofoca|famosos?|celebridade)/;

const GNEWS_SITES = [
  'valor.globo.com', 'g1.globo.com', 'infomoney.com.br', 'folha.uol.com.br', 'estadao.com.br', 'exame.com',
  'cnnbrasil.com.br', 'uol.com.br', 'agenciabrasil.ebc.com.br', 'moneytimes.com.br', 'seudinheiro.com',
  'bloomberglinea.com.br', 'poder360.com.br', 'istoedinheiro.com.br', 'noticias.uol.com.br', 'oglobo.globo.com',
  'forbes.com.br'
].map((s) => `site:${s}`).join(' OR ');

const GNEWS_QUERIES = [
  ['imobiliario', 'financiamento imobiliário', 'financiamento', 'credito'],
  ['consignado', 'consignado OR "crédito pessoal"', 'financiamento', 'credito'],
  ['veiculos', 'financiamento de veículos', 'financiamento', 'credito'],
  ['mcmv', '"Minha Casa Minha Vida" OR FGTS', 'financiamento', 'credito'],
  ['endividamento', 'endividamento OR inadimplência OR "juros do cartão"', 'financiamento', 'credito'],
  ['copom', 'Copom Selic', 'economia', 'juros'],
  ['fiscal', '"pacote fiscal" OR "reforma tributária" OR "meta fiscal"', 'politica', 'fiscal'],
  ['governo-economia', 'Haddad OR "Ministério da Fazenda" OR "política econômica"', 'politica', 'politica']
];

const FEEDS = [
  { id: 'g1-economia', name: 'g1 Economia', url: 'https://g1.globo.com/rss/g1/economia/', limit: 30 },
  { id: 'g1-politica', name: 'g1 Política', url: 'https://g1.globo.com/rss/g1/politica/', limit: 40, onlyEconomic: true },
  { id: 'infomoney', name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', limit: 12 },
  { id: 'agbr-economia', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', limit: 12 },
  { id: 'agbr-politica', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', limit: 12, onlyEconomic: true },
  { id: 'folha-mercado', name: 'Folha', url: 'https://feeds.folha.uol.com.br/mercado/rss091.xml', limit: 30 },
  { id: 'folha-poder', name: 'Folha', url: 'https://feeds.folha.uol.com.br/poder/rss091.xml', limit: 40, onlyEconomic: true },
  { id: 'estadao-economia', name: 'Estadão', url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/', limit: 20 },
  { id: 'exame', name: 'Exame', url: 'https://exame.com/feed/', limit: 20, onlyEconomic: true },
  { id: 'moneytimes', name: 'Money Times', url: 'https://www.moneytimes.com.br/feed/', limit: 12 },
  { id: 'seudinheiro', name: 'Seu Dinheiro', url: 'https://www.seudinheiro.com/feed/', limit: 12 },
  { id: 'braziljournal', name: 'Brazil Journal', url: 'https://braziljournal.com/feed/', limit: 15 },
  { id: 'istoedinheiro', name: 'IstoÉ Dinheiro', url: 'https://istoedinheiro.com.br/feed/', limit: 15 },
  { id: 'suno', name: 'Suno', url: 'https://www.suno.com.br/noticias/feed/', limit: 10 },
  { id: 'investing', name: 'Investing.com', url: 'https://br.investing.com/rss/news_25.rss', limit: 10 },
  // forbes.com.br bloqueia leitura direta (403); acessado via Google Notícias
  {
    id: 'gn-forbes',
    name: 'Forbes Brasil',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('site:forbes.com.br (economia OR mercado OR juros OR investimentos OR bolsa OR dólar OR inflação) when:14d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    limit: 20,
    aggregated: true,
    pillar: 'economia',
    topic: 'mercado'
  },
  { id: 'poder360', name: 'Poder360', url: 'https://www.poder360.com.br/feed/', limit: 12, onlyEconomic: true },
  { id: 'camara', name: 'Agência Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', limit: 20, onlyEconomic: true },
  { id: 'bcb', name: 'Banco Central', url: 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias', limit: 10 },
  ...GNEWS_QUERIES.map(([id, query, pillar, topic]) => ({
    id: `gn-${id}`,
    name: 'Google Notícias',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} (${GNEWS_SITES}) when:14d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    limit: 30,
    aggregated: true,
    pillar,
    topic
  }))
];

const TOPICS = [
  ['credito', /\b(financiament|credito|emprestimo|consignado|imobiliari|hipoteca|minha casa|fgts|cartao|rotativo|inadimpl|endividament|desenrola|consorcio|cheque especial|crediario|linha de credito|refinanciament|portabilidade|bndes)/],
  ['juros', /\b(selic|copom|taxa basica|taxa de juros|juros|banco central|bcb|galipolo|campos neto|cdi\b|di futuro|curva de juros|politica monetaria)/],
  ['inflacao', /\b(ipca|inflac|inflacionari|igp-?m|igp-?di|inpc|ipc-?fipe|custo de vida|deflac|desinflac)/],
  ['cambio', /\b(dolar|cambio|euro\b|ptax|reservas internacionais|desvaloriz|valorizacao do real)/],
  ['fiscal', /\b(fisca(l|is)|arcabouc|orcament|deficit|superavit|divida publica|divida bruta|meta de resultado|tesouro nacional|haddad|ministerio da fazenda|fazenda|imposto|tributar|tributo|isenc|iof|desoner|arrecadacao|receita federal|previdenc|loa\b|ldo\b|\bibs\b|\bcbs\b)/],
  ['politica', /\b(congresso|camara dos deputados|senado|governo|planalto|lula|medida provisoria|projeto de lei|\bpec\b|stf\b|eleic|ministr|oposicao|base aliada|reforma|tarifa|trump|acordo comercial|mercosul|politica economica|politica fiscal)/],
  ['mercado', /\b(ibovespa|bolsa|\bb3\b|acoes|acao\b|\bfiis?\b|fundos? imobiliari|renda fixa|tesouro direto|\bcdb\b|\blci\b|\blca\b|bitcoin|cripto|dividendo|\bipo\b|investidor|investiment|petrobras|\bvale\b)/]
];

const TOPIC_PRIORITY = ['credito', 'juros', 'inflacao', 'cambio', 'fiscal', 'mercado', 'politica'];

const CONSUMER_CREDIT_RE = /\b(financiament|credito imobiliario|sbpe|casa propria|hipoteca|minha casa|fgts|consignado|cartao|rotativo|inadimpl|endividament|desenrola|consorcio|cheque especial|credito (pessoal|rural|ao consumo|ao consumidor|para pessoa)|juros (do|dos) (cartao|credito|financiament|emprestimo)|portabilidade|refinanciament)/;

const CREDIT_NOISE_RE = /\b(filme|climatic|clima\b|campanha|nvidia|\bia\b|cop\d+|partido|eleitoral|uniao europeia|golpe|preso|presas|operacao)/;

const SOURCE_ALIASES = {
  'G1': 'g1',
  'Folha de S.Paulo': 'Folha',
  'c-level.folha.uol.com.br': 'Folha',
  'Estadão Blue Studio': null,
  'Valor Econômico': 'Valor'
};

function classify(title) {
  const text = normalize(title);
  const matched = TOPICS.filter(([, re]) => re.test(text)).map(([id]) => id);
  const topic = TOPIC_PRIORITY.find((id) => matched.includes(id)) || 'economia';
  let pillar = 'economia';
  if (CONSUMER_CREDIT_RE.test(text) && !CREDIT_NOISE_RE.test(text)) pillar = 'financiamento';
  else if (matched.includes('fiscal') || matched.includes('politica')) pillar = 'politica';
  return { topic, topics: matched.slice(0, 3), pillar };
}

function stripSourceSuffix(title, source) {
  if (!source) return title;
  for (const sep of [' - ', ' – ', ' — ']) {
    const suffix = sep + source;
    if (title.endsWith(suffix)) return title.slice(0, -suffix.length);
  }
  return title;
}

async function collectNews(previous) {
  const cutoff = Date.parse(daysAgoIso(RETENTION_DAYS));
  const status = [];
  const results = await mapLimit(FEEDS, 5, async (feed) => {
    try {
      const xml = await fetchText(feed.url, { timeout: 25000 });
      let parsed = parseFeed(xml).filter((it) => !JUNK_RE.test(normalize(it.title))).slice(0, feed.limit);
      if (feed.onlyEconomic) {
        parsed = parsed.filter((it) => ECON_RE.test(normalize(it.title)));
      }
      const items = parsed
        .filter((it) => Date.parse(it.publishedAt) >= cutoff)
        .map((it) => {
          const rawSource = feed.aggregated ? it.source || feed.name : feed.name;
          const source = Object.hasOwn(SOURCE_ALIASES, rawSource) ? SOURCE_ALIASES[rawSource] : rawSource;
          if (!source) return null;
          const title = feed.aggregated ? stripSourceSuffix(it.title, it.source) : it.title;
          const cls = classify(title);
          if (feed.aggregated) {
            if (!cls.topics.length) return null;
            if (feed.pillar === 'financiamento' && cls.pillar !== 'financiamento') return null;
          }
          return {
            id: itemId(it.url),
            title: clip(title, 180),
            summary: feed.aggregated ? '' : clip(it.summary, 260),
            url: it.url,
            image: it.image,
            source,
            sourceId: feed.id,
            publishedAt: it.publishedAt,
            ...(feed.aggregated
              ? { topic: cls.topics.length ? cls.topic : feed.topic, topics: cls.topics.length ? cls.topics : [feed.topic], pillar: feed.pillar }
              : cls)
          };
        })
        .filter(Boolean);
      status.push({ id: feed.id, name: feed.name, ok: true, count: items.length });
      return items;
    } catch (err) {
      status.push({ id: feed.id, name: feed.name, ok: false, error: String(err.message || err).slice(0, 80) });
      const kept = (previous?.items || []).filter((it) => it.sourceId === feed.id && Date.parse(it.publishedAt) >= cutoff);
      return kept;
    }
  });

  const merged = dedupe(results.flat().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
  const counts = {};
  const balanced = merged.filter((it) => {
    counts[it.pillar] = (counts[it.pillar] || 0) + 1;
    return counts[it.pillar] <= PILLAR_CAP;
  });
  for (const s of status.filter((x) => !x.ok)) console.warn(`[aviso] fonte ${s.id}: ${s.error}`);
  return { items: balanced.slice(0, MAX_ITEMS), status: status.sort((a, b) => a.id.localeCompare(b.id)) };
}

const pad = (n) => String(n).padStart(2, '0');
const bcbDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const bcbToIso = (s) => { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; };
const todayIso = () => new Date().toISOString().slice(0, 10);

async function sgs(id, from, to = new Date()) {
  let lastError;
  for (let shift = 0; shift < 4; shift++) {
    const start = new Date(from.getTime() - shift * 864e5);
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados?formato=json&dataInicial=${bcbDate(start)}&dataFinal=${bcbDate(to)}`;
    try {
      const rows = await fetchJson(url, { timeout: 30000, retries: 0 });
      const limit = todayIso();
      return rows
        .map((r) => ({ d: bcbToIso(r.data), v: Number(r.valor) }))
        .filter((r) => Number.isFinite(r.v) && r.d <= limit)
        .sort((a, b) => a.d.localeCompare(b.d));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };
const daysBack = (n) => new Date(Date.now() - n * 864e5);
const last = (arr, k = 1) => arr[arr.length - k];

function changePoints(points) {
  const out = [];
  points.forEach((p, i) => {
    if (i === 0 || p.v !== points[i - 1].v || i === points.length - 1) out.push(p);
  });
  return out;
}

async function collectIndicators() {
  const [selic, cdi, ipca12, ipcaM, usd, eur, unemp] = await Promise.all([
    sgs(432, yearsAgo(3)),
    sgs(4389, daysBack(120)),
    sgs(13522, yearsAgo(3)),
    sgs(433, daysBack(120)),
    sgs(1, daysBack(150)),
    sgs(21619, daysBack(150)),
    sgs(24369, yearsAgo(2))
  ]);

  const selicPoints = changePoints(selic);
  const currentSelic = last(selic).v;
  let changeIdx = -1;
  for (let i = selic.length - 1; i >= 0; i--) {
    if (selic[i].v !== currentSelic) { changeIdx = i; break; }
  }
  const prevOf = (arr) => (arr.length > 1 ? last(arr, 2).v : null);

  return {
    indicators: {
      selic: {
        value: currentSelic,
        asOf: last(selic).d,
        previous: changeIdx >= 0 ? selic[changeIdx].v : null,
        since: changeIdx >= 0 ? selic[changeIdx + 1].d : selic[0].d
      },
      cdi: { value: last(cdi).v, asOf: last(cdi).d },
      ipca12: { value: last(ipca12).v, asOf: last(ipca12).d.slice(0, 7), previous: prevOf(ipca12) },
      ipcaMonth: { value: last(ipcaM).v, asOf: last(ipcaM).d.slice(0, 7), previous: prevOf(ipcaM) },
      usd: { value: last(usd).v, asOf: last(usd).d, previous: prevOf(usd) },
      eur: { value: last(eur).v, asOf: last(eur).d, previous: prevOf(eur) },
      unemployment: { value: last(unemp).v, asOf: last(unemp).d.slice(0, 7), previous: prevOf(unemp) }
    },
    series: {
      selic: selicPoints,
      ipca12: ipca12.map((p) => ({ d: p.d.slice(0, 7), v: p.v })),
      usd: usd.map((p) => ({ d: p.d, v: p.v })),
      eur: eur.map((p) => ({ d: p.d, v: p.v })),
      cdi: cdi.map((p) => ({ d: p.d, v: p.v })),
      unemployment: unemp.map((p) => ({ d: p.d.slice(0, 7), v: p.v }))
    }
  };
}

async function collectFocus() {
  const base = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais';
  const year = new Date().getFullYear();
  const years = [String(year), String(year + 1)];
  const defs = [
    ['Selic', 'Selic (fim do ano)', '% a.a.'],
    ['IPCA', 'IPCA', '%'],
    ['PIB Total', 'Crescimento do PIB', '%'],
    ['Câmbio', 'Dólar (fim do ano)', 'R$']
  ];
  const rows = await Promise.all(defs.map(async ([indicator, label, unit]) => {
    const filter = `Indicador eq '${indicator}' and baseCalculo eq 0`;
    const url = `${base}?$top=60&$format=json&$orderby=Data desc&$select=Data,DataReferencia,Mediana&$filter=${encodeURIComponent(filter)}`;
    const { value } = await fetchJson(url, { timeout: 30000 });
    const dates = [...new Set(value.map((r) => r.Data))].sort().reverse();
    const pick = (date, ref) => value.find((r) => r.Data === date && r.DataReferencia === ref)?.Mediana ?? null;
    return {
      indicator, label, unit,
      asOf: dates[0],
      values: years.map((ref) => ({
        year: ref,
        median: pick(dates[0], ref),
        previous: dates[1] ? pick(dates[1], ref) : null
      }))
    };
  }));
  return { asOf: rows[0]?.asOf || null, rows };
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const quantile = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

async function collectCredit() {
  const monthly = 'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes';
  const daily = 'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo';

  const latestMonth = (await fetchJson(`${monthly}?$top=1&$format=json&$orderby=${encodeURIComponent('anoMes desc')}&$select=anoMes,Mes`, { timeout: 30000 })).value[0];
  const housingRows = (await fetchJson(
    `${monthly}?$format=json&$top=500&$select=Modalidade,InstituicaoFinanceira,TaxaJurosAoAno,TaxaJurosAoMes,Posicao&$filter=${encodeURIComponent(`anoMes eq '${latestMonth.anoMes}'`)}`,
    { timeout: 30000 }
  )).value;

  const housing = {};
  for (const r of housingRows) {
    if (!/imobili/i.test(r.Modalidade) || !(r.TaxaJurosAoAno > 0)) continue;
    (housing[r.Modalidade] ||= []).push({ institution: r.InstituicaoFinanceira, yearly: r.TaxaJurosAoAno, monthly: r.TaxaJurosAoMes, position: r.Posicao });
  }
  const housingList = Object.entries(housing).map(([modality, rows]) => ({
    modality,
    regulated: /reguladas/i.test(modality),
    index: /IPCA/i.test(modality) ? 'IPCA' : /TR/.test(modality) ? 'TR' : 'Prefixado',
    rows: rows.sort((a, b) => a.yearly - b.yearly).slice(0, 5)
  })).sort((a, b) => Number(b.regulated) - Number(a.regulated) || a.rows[0].yearly - b.rows[0].yearly);

  const period = (await fetchJson(`${daily}?$top=1&$format=json&$orderby=${encodeURIComponent('InicioPeriodo desc')}&$select=InicioPeriodo,FimPeriodo`, { timeout: 30000 })).value[0];
  const consumerRows = (await fetchJson(
    `${daily}?$format=json&$top=2000&$select=Modalidade,InstituicaoFinanceira,TaxaJurosAoAno&$filter=${encodeURIComponent(`InicioPeriodo eq '${period.InicioPeriodo}' and Segmento eq 'PESSOA FÍSICA'`)}`,
    { timeout: 30000 }
  )).value;

  const wanted = [
    ['Aquisição de veículos - Prefixado', 'Financiamento de veículos'],
    ['Crédito pessoal consignado INSS - Prefixado', 'Consignado INSS'],
    ['Crédito pessoal consignado público - Prefixado', 'Consignado público'],
    ['Crédito pessoal consignado privado - Prefixado', 'Consignado privado'],
    ['Crédito pessoal não consignado - Prefixado', 'Crédito pessoal'],
    ['Cheque especial - Prefixado', 'Cheque especial'],
    ['Cartão de crédito - rotativo total - Prefixado', 'Cartão (rotativo)']
  ];
  const consumer = wanted.map(([key, label]) => {
    const rates = consumerRows.filter((r) => r.Modalidade === key && r.TaxaJurosAoAno > 0);
    if (!rates.length) return null;
    const values = rates.map((r) => r.TaxaJurosAoAno);
    return {
      label,
      median: Number(median(values).toFixed(2)),
      q1: Number(quantile(values, 0.25).toFixed(2)),
      q3: Number(quantile(values, 0.75).toFixed(2)),
      institutions: rates.length
    };
  }).filter(Boolean);

  return {
    housing: { month: latestMonth.anoMes, monthLabel: latestMonth.Mes, modalities: housingList },
    consumer: { from: period.InicioPeriodo, to: period.FimPeriodo, rows: consumer }
  };
}

async function main() {
  const previous = await readJsonSafe(OUT);

  const [news, ind, focus, credit] = await Promise.allSettled([
    collectNews(previous),
    collectIndicators(),
    collectFocus(),
    collectCredit()
  ]);

  const warn = (label, r) => { if (r.status === 'rejected') console.warn(`[aviso] ${label}: ${r.reason?.message || r.reason}`); };
  warn('notícias', news); warn('indicadores', ind); warn('focus', focus); warn('crédito', credit);

  const items = news.status === 'fulfilled' ? news.value.items : previous?.items || [];
  if (items.length < 10) {
    console.error(`Abortando: apenas ${items.length} notícias coletadas.`);
    process.exit(1);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sources: news.status === 'fulfilled' ? news.value.status : previous?.sources || [],
    indicators: ind.status === 'fulfilled' ? ind.value.indicators : previous?.indicators || null,
    series: ind.status === 'fulfilled' ? ind.value.series : previous?.series || null,
    focus: focus.status === 'fulfilled' ? focus.value : previous?.focus || null,
    credit: credit.status === 'fulfilled' ? credit.value : previous?.credit || null,
    items
  };

  const changed = await writeJsonIfChanged(OUT, output);
  const okSources = output.sources.filter((s) => s.ok).length;
  console.log(`${changed ? 'Atualizado' : 'Sem alterações'}: ${items.length} notícias, ${okSources}/${output.sources.length} fontes ok.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

