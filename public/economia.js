(() => {
  'use strict';

  const LOCALE = 'pt-BR';
  const DATA_URL = 'data/economia.json';
  const REMOTE_DATA_URL = 'https://raw.githubusercontent.com/santosrafaelg/rafainvest/data/economia.json';
  const PAGE_SIZE = 12;
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const TOPIC_LABELS = {
    juros: 'Juros & Selic',
    inflacao: 'Inflação',
    cambio: 'Câmbio',
    fiscal: 'Contas públicas',
    politica: 'Política',
    credito: 'Crédito',
    mercado: 'Mercado',
    economia: 'Economia'
  };

  const TOPIC_TONES = {
    juros: 'indigo',
    inflacao: 'amber',
    cambio: 'blue',
    fiscal: 'violet',
    politica: 'violet',
    credito: 'green',
    mercado: 'blue',
    economia: 'slate'
  };

  const PILLARS = [
    ['all', 'Tudo'],
    ['economia', 'Economia'],
    ['politica', 'Política econômica'],
    ['financiamento', 'Financiamentos']
  ];

  const TOPIC_WEIGHT = { juros: 3, fiscal: 3, credito: 3, inflacao: 2, cambio: 2, politica: 1, mercado: 1, economia: 1 };

  const state = { data: null, pillar: 'all', topic: 'all', query: '', shown: PAGE_SIZE, housing: 'regulated', chart: null, chartKind: 'selic' };

  const $ = (id) => document.getElementById(id);

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if ((key === 'href' || key === 'src') && !/^https?:\/\//i.test(value)) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function icon(name, cls = 'eco-icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `svgs/icons.svg#icon-${name}`);
    svg.append(use);
    return svg;
  }

  const fmt = (n, digits = 2) =>
    new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function monthLabel(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS[Number(m) - 1]}/${y}`;
  }

  function dateBr(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function ago(iso) {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }

  function stamp(iso) {
    return new Date(iso).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function delta(current, previous, { pct = false, inverse = true, suffix = '' } = {}) {
    if (previous == null || current == null) return null;
    const diff = pct ? ((current - previous) / previous) * 100 : current - previous;
    if (Math.abs(diff) < 0.005) return h('span', { class: 'eco-delta flat' }, '— estável');
    const up = diff > 0;
    const tone = inverse === null ? 'neutral' : (inverse ? up : !up) ? 'bad' : 'good';
    return h(
      'span',
      { class: `eco-delta ${tone}` },
      up ? '▲ ' : '▼ ',
      `${fmt(Math.abs(diff))}${pct ? '%' : ' p.p.'}${suffix}`
    );
  }

  function renderStatus(data) {
    $('updatedAt').textContent = `Atualizado em ${stamp(data.generatedAt)} · ${ago(data.generatedAt)}`;
    const ok = data.sources.filter((s) => s.ok).length;
    $('sourceCount').textContent = `${ok} fontes monitoradas`;
  }

  let sparkSeq = 0;

  function sparkline(values, { width = 120, height = 34, big = false } = {}) {
    if (!values || values.length < 2) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = big ? 6 : 3;
    const step = (width - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => [pad + i * step, height - pad - ((v - min) / span) * (height - pad * 2)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const [lx, ly] = pts[pts.length - 1];
    const areaPath = `${line} L${lx.toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`;
    const gid = `spark${sparkSeq++}`;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', `eco-spark${big ? ' big' : ''}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.28"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${areaPath}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="${big ? 2 : 1.6}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', lx.toFixed(1));
    dot.setAttribute('cy', ly.toFixed(1));
    dot.setAttribute('r', big ? '3.2' : '2.2');
    dot.setAttribute('fill', 'currentColor');
    dot.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(dot);
    return svg;
  }

  function selicNote(ind) {
    return ind.selic.previous != null && ind.selic.previous !== ind.selic.value
      ? `${ind.selic.previous > ind.selic.value ? 'Reduzida' : 'Elevada'} de ${fmt(ind.selic.previous)}% em ${dateBr(ind.selic.since)}`
      : 'Taxa básica de juros da economia';
  }

  function renderSnapshot(data) {
    const ind = data.indicators;
    const box = $('snapshot');
    if (!ind) { box.hidden = true; return; }
    const rows = monthlySeries(data.series?.selic || []);
    const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', {}, value));
    box.replaceChildren(
      h('div', { class: 'eco-snap-head' }, h('span', { class: 'eco-snap-title' }, 'Taxa Selic'), h('span', { class: 'eco-snap-chip' }, 'meta · ao ano')),
      h('div', { class: 'eco-snap-value' }, fmt(ind.selic.value), h('small', {}, '%')),
      h('p', { class: 'eco-snap-note' }, selicNote(ind)),
      rows.length > 1
        ? h('div', { class: 'eco-snap-chart' }, sparkline(rows.map((r) => r.value), { width: 360, height: 110, big: true }),
            h('div', { class: 'eco-snap-axis' }, h('span', {}, rows[0].label), h('span', {}, rows[rows.length - 1].label)))
        : null,
      h('dl', { class: 'eco-snap-stats' },
        stat('IPCA 12m', `${fmt(ind.ipca12.value)}%`),
        stat('CDI', `${fmt(ind.cdi.value)}%`),
        stat('Dólar', `R$ ${fmt(ind.usd.value)}`))
    );
  }

  function renderKpis(ind, series) {
    if (!ind) return;
    const values = (key, field = 'v') => (series?.[key] || []).map((p) => p[field]);
    const selicRows = monthlySeries(series?.selic || []).map((r) => r.value);

    const cards = [
      { label: 'Selic meta', value: fmt(ind.selic.value), unit: '% a.a.', note: selicNote(ind), spark: selicRows, tone: 'indigo' },
      {
        label: 'IPCA 12 meses', value: fmt(ind.ipca12.value), unit: '%', note: `Ref. ${monthLabel(ind.ipca12.asOf)}`,
        extra: delta(ind.ipca12.value, ind.ipca12.previous), spark: values('ipca12'), tone: 'amber'
      },
      {
        label: 'Dólar (PTAX)', value: `R$ ${fmt(ind.usd.value)}`, note: dateBr(ind.usd.asOf),
        extra: delta(ind.usd.value, ind.usd.previous, { pct: true, inverse: null }), spark: values('usd'), tone: 'green'
      },
      {
        label: 'Euro (PTAX)', value: `R$ ${fmt(ind.eur.value)}`, note: dateBr(ind.eur.asOf),
        extra: delta(ind.eur.value, ind.eur.previous, { pct: true, inverse: null }), spark: values('eur'), tone: 'blue'
      },
      { label: 'CDI', value: fmt(ind.cdi.value), unit: '% a.a.', note: dateBr(ind.cdi.asOf), spark: values('cdi'), tone: 'violet' },
      {
        label: 'Desemprego', value: fmt(ind.unemployment.value, 1), unit: '%', note: `PNAD · ${monthLabel(ind.unemployment.asOf)}`,
        extra: delta(ind.unemployment.value, ind.unemployment.previous), spark: values('unemployment'), tone: 'slate'
      }
    ];

    $('kpiGrid').replaceChildren(
      ...cards.map((c) =>
        h('article', { class: `eco-kpi tone-${c.tone}` },
          h('div', { class: 'eco-kpi-label' }, c.label),
          h('div', { class: 'eco-kpi-row' },
            h('div', { class: 'eco-kpi-value' }, c.value, c.unit ? h('small', {}, ` ${c.unit}`) : null),
            sparkline(c.spark, { width: 84, height: 30 })
          ),
          h('div', { class: 'eco-kpi-foot' }, c.extra, h('span', { class: 'eco-kpi-note' }, c.note))
        )
      )
    );
  }

  function tagFor(item) {
    const topic = item.topic in TOPIC_LABELS ? item.topic : 'economia';
    return h('span', { class: `eco-tag tone-${TOPIC_TONES[topic]}` }, TOPIC_LABELS[topic]);
  }

  function fallbackMedia(item, cls) {
    return h('div', { class: `${cls} fallback` }, h('span', {}, item.source));
  }

  function mediaFor(item, cls, withFallback = false) {
    if (!item.image) return withFallback ? fallbackMedia(item, cls) : null;
    const img = h('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    const box = h('div', { class: cls }, img);
    img.addEventListener('error', () => (withFallback ? box.replaceWith(fallbackMedia(item, cls)) : box.remove()));
    return box;
  }

  function pickHighlights(items) {
    const now = Date.now();
    const scored = items.map((item) => {
      const age = (now - Date.parse(item.publishedAt)) / 3600000;
      const recency = age < 6 ? 3 : age < 12 ? 2 : age < 30 ? 1 : 0;
      return { item, score: (item.image ? 2 : 0) + (TOPIC_WEIGHT[item.topic] || 1) + recency };
    }).sort((a, b) => b.score - a.score || Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt));

    const picked = [];
    const sources = new Set();
    for (const { item } of scored) {
      if (sources.has(item.source) && picked.length < 3) continue;
      picked.push(item);
      sources.add(item.source);
      if (picked.length === 5) break;
    }
    return picked;
  }

  function renderHighlights(items) {
    const picks = pickHighlights(items);
    if (!picks.length) return;
    const [lead, ...rest] = picks;

    const leadEl = h('a', { class: `eco-lead${lead.image ? ' has-media' : ''}`, href: lead.url, target: '_blank', rel: 'noopener noreferrer' },
      mediaFor(lead, 'eco-lead-media'),
      h('div', { class: 'eco-lead-body' },
        h('div', { class: 'eco-meta' }, tagFor(lead), h('span', {}, `${lead.source} · ${ago(lead.publishedAt)}`)),
        h('h3', {}, lead.title),
        lead.summary ? h('p', {}, lead.summary) : null,
        h('span', { class: 'eco-readmore' }, 'Ler matéria ', icon('arrow-right', 'eco-icon sm'))
      )
    );

    const list = h('div', { class: 'eco-lead-list' },
      rest.map((item, i) =>
        h('a', { class: 'eco-mini', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'eco-mini-n' }, String(i + 2).padStart(2, '0')),
          h('div', {},
            h('div', { class: 'eco-meta' }, tagFor(item), h('span', {}, `${item.source} · ${ago(item.publishedAt)}`)),
            h('h4', {}, item.title)
          )
        )
      )
    );

    $('highlights').replaceChildren(leadEl, list);
  }
  function filteredItems() {
    const query = normalize(state.query);
    return state.data.items.filter((item) => {
      if (state.pillar !== 'all' && item.pillar !== state.pillar) return false;
      if (state.topic !== 'all' && item.topic !== state.topic && !item.topics.includes(state.topic)) return false;
      if (query && !normalize(`${item.title} ${item.summary} ${item.source}`).includes(query)) return false;
      return true;
    });
  }

  function renderTabs() {
    const counts = { all: state.data.items.length };
    for (const item of state.data.items) counts[item.pillar] = (counts[item.pillar] || 0) + 1;
    $('pillarTabs').replaceChildren(
      ...PILLARS.map(([id, label]) =>
        h('button', {
          type: 'button', class: `eco-tab${state.pillar === id ? ' active' : ''}`, role: 'tab',
          'aria-selected': String(state.pillar === id),
          onclick: () => { state.pillar = id; state.topic = 'all'; state.shown = PAGE_SIZE; renderFeed(); }
        }, label, h('span', { class: 'eco-count' }, counts[id] || 0))
      )
    );
  }

  function renderChips() {
    const pool = state.data.items.filter((i) => state.pillar === 'all' || i.pillar === state.pillar);
    const counts = {};
    for (const item of pool) for (const t of new Set([item.topic, ...item.topics])) counts[t] = (counts[t] || 0) + 1;
    const ids = Object.keys(TOPIC_LABELS).filter((id) => counts[id] > 0);
    $('topicChips').replaceChildren(
      ...[['all', 'Todos os temas'], ...ids.map((id) => [id, TOPIC_LABELS[id]])].map(([id, label]) =>
        h('button', {
          type: 'button', class: `eco-chip${state.topic === id ? ' active' : ''}`,
          onclick: () => { state.topic = id; state.shown = PAGE_SIZE; renderFeed(); }
        }, label)
      )
    );
  }

  function newsCard(item) {
    return h('a', { class: `eco-card has-media tone-${TOPIC_TONES[item.topic] || 'slate'}`, href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      mediaFor(item, 'eco-card-media', true),
      h('div', { class: 'eco-card-body' },
        h('div', { class: 'eco-meta' }, tagFor(item), h('span', {}, ago(item.publishedAt))),
        h('h3', {}, item.title),
        item.summary ? h('p', {}, item.summary) : null,
        h('div', { class: 'eco-source' }, item.source)
      )
    );
  }

  function renderFeed() {
    renderTabs();
    renderChips();
    const items = filteredItems();
    const slice = items.slice(0, state.shown);
    $('newsCount').textContent = `${items.length} ${items.length === 1 ? 'notícia' : 'notícias'}`;
    $('newsGrid').replaceChildren(
      ...(slice.length
        ? slice.map(newsCard)
        : [h('div', { class: 'eco-empty' }, 'Nenhuma notícia encontrada para esse filtro.')])
    );
    $('loadMore').hidden = items.length <= state.shown;
  }

  function monthlySeries(points) {
    if (!points.length) return [];
    const out = [];
    const start = new Date(points[0].d + 'T00:00:00');
    const end = new Date();
    let idx = 0;
    for (let y = start.getFullYear(), m = start.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m++) {
      if (m > 11) { m = 0; y++; }
      const stop = `${y}-${String(m + 1).padStart(2, '0')}-31`;
      while (idx + 1 < points.length && points[idx + 1].d <= stop) idx++;
      out.push({ label: `${MONTHS[m]}/${String(y).slice(2)}`, value: points[idx].v });
    }
    return out;
  }

  function chartConfig(kind, series) {
    if (kind === 'selic') {
      const rows = monthlySeries(series.selic);
      return { labels: rows.map((r) => r.label), values: rows.map((r) => r.value), label: 'Selic meta (% a.a.)', stepped: true, suffix: '%' };
    }
    if (kind === 'ipca12') {
      return {
        labels: series.ipca12.map((p) => `${MONTHS[Number(p.d.slice(5)) - 1]}/${p.d.slice(2, 4)}`),
        values: series.ipca12.map((p) => p.v), label: 'IPCA acumulado em 12 meses (%)', stepped: false, suffix: '%'
      };
    }
    return {
      labels: series.usd.map((p) => `${p.d.slice(8)}/${p.d.slice(5, 7)}`),
      values: series.usd.map((p) => p.v), label: 'Dólar PTAX (R$)', stepped: false, prefix: 'R$ '
    };
  }

  function drawChart() {
    const { data, chartKind } = state;
    const canvas = $('mainChart');
    if (!data.series || !window.Chart || !canvas) {
      $('chartCard').classList.add('no-chart');
      return;
    }
    const cfg = chartConfig(chartKind, data.series);
    if (state.chart) state.chart.destroy();
    const compact = window.matchMedia('(max-width: 640px)').matches;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 320);
    gradient.addColorStop(0, 'rgba(45, 91, 227, 0.16)');
    gradient.addColorStop(1, 'rgba(45, 91, 227, 0)');
    state.chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: cfg.labels,
        datasets: [{
          label: cfg.label, data: cfg.values, borderColor: '#2D5BE3', backgroundColor: gradient, fill: true,
          borderWidth: 2, tension: cfg.stepped ? 0 : 0.3, stepped: cfg.stepped ? 'before' : false,
          pointRadius: compact || cfg.values.length > 60 ? 0 : 2.5, pointHoverRadius: 4, pointBackgroundColor: '#2D5BE3'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: compact ? { top: 6, right: 4 } : { top: 6, right: 8 } },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827', padding: 8, displayColors: false,
            callbacks: { label: (c) => `${cfg.prefix || ''}${fmt(c.parsed.y)}${cfg.suffix || ''}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: compact ? 4 : 8, maxRotation: compact ? 0 : 50, autoSkipPadding: 12, color: '#6B7280', font: { size: 10, family: 'Inter' } } },
          y: { grid: { color: 'rgba(148, 163, 184, 0.16)' }, ticks: { maxTicksLimit: compact ? 5 : 8, color: '#6B7280', font: { size: 10, family: 'Inter' }, callback: (v) => `${cfg.prefix || ''}${fmt(v, 1)}${cfg.suffix || ''}` } }
        }
      }
    });
    $('chartCaption').textContent = cfg.label;
  }

  function renderChartTabs() {
    const kinds = [['selic', 'Selic meta'], ['ipca12', 'IPCA 12 meses'], ['usd', 'Dólar']];
    $('chartTabs').replaceChildren(
      ...kinds.map(([id, label]) =>
        h('button', {
          type: 'button', class: `eco-chip${state.chartKind === id ? ' active' : ''}`,
          onclick: () => { state.chartKind = id; renderChartTabs(); drawChart(); }
        }, label)
      )
    );
  }

  function renderFocus(focus) {
    const table = $('focusTable');
    if (!focus || !focus.rows.length) { table.closest('.eco-panel').hidden = true; return; }
    const years = focus.rows[0].values.map((v) => v.year);
    $('focusDate').textContent = `Boletim Focus de ${dateBr(focus.asOf)}`;

    const cell = (row, v) => {
      if (v.median == null) return h('td', {}, '—');
      const prefix = row.unit === 'R$' ? 'R$ ' : '';
      const suffix = row.unit === 'R$' ? '' : '%';
      const diff = v.previous != null ? v.median - v.previous : 0;
      const arrow = Math.abs(diff) < 0.005 ? null : h('span', { class: `eco-arrow ${diff > 0 ? 'up' : 'down'}`, title: 'Variação vs. semana anterior' }, diff > 0 ? '▲' : '▼');
      return h('td', {}, h('span', { class: 'eco-num' }, `${prefix}${fmt(v.median)}${suffix}`), arrow);
    };

    table.replaceChildren(
      h('thead', {}, h('tr', {}, h('th', {}, 'Indicador'), ...years.map((y) => h('th', {}, y)))),
      h('tbody', {}, focus.rows.map((row) => h('tr', {}, h('th', { scope: 'row' }, row.label), ...row.values.map((v) => cell(row, v)))))
    );
  }

  function cleanBank(name) {
    return name
      .replace(/\s+S\.?\s?\/?\s?A\.?(?=\s|$)/gi, '')
      .replace(/^BCO\b\.?/i, 'Banco')
      .replace(/\s+/g, ' ')
      .replace(/[\s.,-]+$/, '')
      .trim()
      .toLowerCase();
  }

  function housingRow(row, maxRate, index) {
    const prefix = index === 'TR' ? 'TR + ' : index === 'IPCA' ? 'IPCA + ' : '';
    return h('li', {},
      h('div', { class: 'eco-bank' }, h('span', { class: 'eco-pos' }, row.position), h('span', {}, cleanBank(row.institution))),
      h('strong', { class: 'eco-num' }, `${prefix}${fmt(row.yearly)}% a.a.`),
      h('div', { class: 'eco-bar' }, h('span', { style: `width:${Math.max(18, (row.yearly / maxRate) * 100)}%` }))
    );
  }

  function renderHousing() {
    const credit = state.data.credit;
    if (!credit) return;
    $('housingMonth').textContent = `Taxas médias de ${monthLabel(credit.housing.month)} · Banco Central do Brasil`;
    const group = credit.housing.modalities.filter((m) => m.regulated === (state.housing === 'regulated'));
    const maxRate = Math.max(...group.flatMap((m) => m.rows.map((r) => r.yearly)), 1);
    $('housingTabs').replaceChildren(
      ...[['regulated', 'Taxas reguladas (SFH · FGTS)'], ['market', 'Taxas de mercado']].map(([id, label]) =>
        h('button', { type: 'button', class: `eco-chip${state.housing === id ? ' active' : ''}`, onclick: () => { state.housing = id; renderHousing(); } }, label)
      )
    );
    $('housingGrid').replaceChildren(
      ...group.map((m) =>
        h('article', { class: 'eco-rate-card' },
          h('header', {},
            h('span', { class: 'eco-rate-index' }, m.index === 'Prefixado' ? 'Prefixado' : `Pós-fixado ${m.index}`),
            h('strong', { class: 'eco-rate-best' }, `${m.index === 'TR' ? 'TR + ' : m.index === 'IPCA' ? 'IPCA + ' : ''}${fmt(m.rows[0].yearly)}%`, h('small', {}, ' a.a.'))
          ),
          h('ul', {}, m.rows.slice(0, 4).map((row) => housingRow(row, maxRate, m.index)))
        )
      )
    );
  }

  function monthly(rate) {
    return (Math.pow(1 + rate / 100, 1 / 12) - 1) * 100;
  }

  function renderConsumer() {
    const credit = state.data.credit;
    if (!credit) return;
    const { rows, from, to } = credit.consumer;
    $('consumerPeriod').textContent = `Semana de ${dateBr(from)} a ${dateBr(to)} · mediana entre instituições`;
    const maxLog = Math.log10(Math.max(...rows.map((r) => r.median)));
    $('consumerTable').replaceChildren(
      h('thead', {}, h('tr', {}, h('th', {}, 'Modalidade'), h('th', {}, 'Taxa mediana'), h('th', { class: 'hide-sm' }, 'Faixa típica'), h('th', { class: 'hide-sm' }, 'Instituições'))),
      h('tbody', {}, rows.map((row) =>
        h('tr', {},
          h('th', { scope: 'row' }, row.label),
          h('td', {},
            h('div', { class: 'eco-bar tall' }, h('span', { style: `width:${Math.max(8, (Math.log10(row.median) / maxLog) * 100)}%` })),
            h('span', { class: 'eco-num' }, `${fmt(row.median)}% a.a.`),
            h('em', {}, ` · ${fmt(monthly(row.median))}% a.m.`)
          ),
          h('td', { class: 'hide-sm' }, h('span', { class: 'eco-num' }, `${fmt(row.q1, 1)}% – ${fmt(row.q3, 1)}%`), h('em', { class: 'eco-bestbank' }, 'metade das instituições')),
          h('td', { class: 'hide-sm' }, row.institutions)
        )
      ))
    );
  }

  function renderSources(data) {
    $('sourcesList').replaceChildren(
      ...[...new Set(data.items.map((i) => i.source))].sort((a, b) => a.localeCompare(b, LOCALE)).map((name) => h('li', {}, name))
    );
  }

  function bind() {
    $('searchInput').addEventListener('input', (e) => {
      state.query = e.target.value;
      state.shown = PAGE_SIZE;
      renderFeed();
    });
    $('loadMore').addEventListener('click', () => {
      state.shown += PAGE_SIZE;
      renderFeed();
    });
    const toggle = $('navToggle');
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.querySelectorAll('.eco-nav-links a').forEach((a) =>
      a.addEventListener('click', () => document.body.classList.remove('nav-open'))
    );
  }

  function showError() {
    $('loadError').hidden = false;
    $('newsGrid').replaceChildren();
    $('updatedAt').textContent = 'Dados indisponíveis no momento';
  }

  function fetchData(url) {
    return fetch(`${url}?t=${Math.floor(Date.now() / 300000)}`, { signal: AbortSignal.timeout(8000) }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  }

  function render(data) {
    state.data = data;
    state.shown = PAGE_SIZE;
    renderStatus(data);
    renderSnapshot(data);
    renderKpis(data.indicators, data.series);
    renderHighlights(data.items);
    renderFeed();
    renderFocus(data.focus);
    renderChartTabs();
    renderHousing();
    renderConsumer();
    renderSources(data);
    if (window.Chart) drawChart();
    else window.addEventListener('load', drawChart, { once: true });
    document.body.classList.add('is-ready');
  }

  async function init() {
    bind();
    window.matchMedia('(max-width: 640px)').addEventListener('change', () => { if (state.data && window.Chart) drawChart(); });
    const apply = (data) => {
      if (state.data && Date.parse(data.generatedAt) <= Date.parse(state.data.generatedAt)) return;
      render(data);
    };
    await Promise.allSettled([fetchData(DATA_URL).then(apply), fetchData(REMOTE_DATA_URL).then(apply)]);
    if (!state.data) showError();
  }

  init();
})();
