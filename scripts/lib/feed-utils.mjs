import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const UA = 'Mozilla/5.0 (compatible; rafaFeedBot/1.0; +https://github.com/santosrafaelg)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, { timeout = 20000, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      return decodeBody(buf, res.headers.get('content-type') || '');
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  return JSON.parse(text);
}

function decodeBody(buf, contentType) {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.subarray(0, 200));
    charset = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', ntilde: 'ñ'
};

export function decodeEntities(str) {
  if (!str) return '';
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, ent) => {
    if (ent[0] === '#') {
      const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
      try { return String.fromCodePoint(code); } catch { return ' '; }
    }
    return NAMED_ENTITIES[ent] ?? NAMED_ENTITIES[ent.toLowerCase()] ?? match;
  });
}

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

function unwrapCdata(raw) {
  if (raw == null) return { text: '', cdata: false };
  if (!raw.includes('<![CDATA[')) return { text: raw, cdata: false };
  return { text: raw.replace(CDATA_RE, '$1'), cdata: true };
}

export function stripHtml(html) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function textFrom(raw) {
  const { text, cdata } = unwrapCdata(raw);
  let out = cdata ? text : decodeEntities(text);
  out = stripHtml(out);
  out = decodeEntities(out);
  return out.replace(/\s+/g, ' ').trim();
}

export function clip(text, max) {
  if (!text || text.length <= max) return text || '';
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

function getTag(block, name) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

function getAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[1] ?? m[2]) : null;
}

export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(String(value)).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}

function safeImage(value) {
  if (!value) return null;
  let v = decodeEntities(String(value)).trim();
  if (v.startsWith('//')) v = 'https:' + v;
  const url = safeUrl(v);
  if (!url) return null;
  return url.replace(/^http:\/\//i, 'https://');
}

function findImage(block, htmlSources) {
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b([^>]*)>/gi)) {
    const attrs = m[1];
    const url = getAttr(attrs, 'url');
    const type = getAttr(attrs, 'type') || '';
    const medium = getAttr(attrs, 'medium') || '';
    if (url && (!type || type.startsWith('image') || medium === 'image' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) {
      const img = safeImage(url);
      if (img) return img;
    }
  }
  for (const m of block.matchAll(/<enclosure\b([^>]*)>/gi)) {
    const type = getAttr(m[1], 'type') || '';
    const url = getAttr(m[1], 'url');
    if (url && (type.startsWith('image') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) {
      const img = safeImage(url);
      if (img) return img;
    }
  }
  for (const html of htmlSources) {
    if (!html) continue;
    const decoded = html.includes('<![CDATA[') ? unwrapCdata(html).text : decodeEntities(html);
    const m = decoded.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m) {
      const img = safeImage(m[1]);
      if (img && !/(pixel|tracker|spacer|1x1|blank\.)/i.test(img)) return img;
    }
  }
  return null;
}

function findLink(block) {
  const candidates = [];
  for (const m of block.matchAll(/<link\b([^>]*?)(\/?)>/gi)) {
    const href = getAttr(m[1], 'href');
    if (href) {
      const rel = (getAttr(m[1], 'rel') || 'alternate').toLowerCase();
      candidates.push({ href, rel });
    }
  }
  const alt = candidates.find((c) => c.rel === 'alternate') || candidates[0];
  if (alt) return safeUrl(alt.href);
  const text = getTag(block, 'link');
  if (text) return safeUrl(unwrapCdata(text).text.trim());
  const guid = getTag(block, 'guid');
  if (guid) return safeUrl(unwrapCdata(guid).text.trim());
  return null;
}

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(textFrom(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFeed(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const now = Date.now();
  const items = [];
  for (const block of blocks) {
    const title = textFrom(getTag(block, 'title'));
    const url = findLink(block);
    if (!title || !url) continue;
    const description = getTag(block, 'description');
    const contentEncoded = getTag(block, 'content:encoded');
    const summary = getTag(block, 'summary');
    const content = getTag(block, 'content');
    const body = description ?? summary ?? content ?? contentEncoded;
    const date =
      parseDate(getTag(block, 'pubDate')) ||
      parseDate(getTag(block, 'published')) ||
      parseDate(getTag(block, 'updated')) ||
      parseDate(getTag(block, 'dc:date')) ||
      parseDate(getTag(block, 'date'));
    let publishedAt = date ? date.getTime() : now;
    if (publishedAt > now + 3600_000) publishedAt = now;
    const sourceRaw = getTag(block, 'source');
    const sourceText = sourceRaw && !/</.test(unwrapCdata(sourceRaw).text) ? textFrom(sourceRaw) : null;
    items.push({
      title,
      url,
      source: sourceText,
      summary: textFrom(body),
      image: findImage(block, [contentEncoded, description, content, summary]),
      publishedAt: new Date(publishedAt).toISOString()
    });
  }
  return items;
}

export function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function itemId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12);
}

export function titleKey(title) {
  return normalize(title).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
}

export function dedupe(items) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const item of items) {
    const key = titleKey(item.title);
    if (seenUrl.has(item.url) || (key && seenTitle.has(key))) continue;
    seenUrl.add(item.url);
    if (key) seenTitle.add(key);
    out.push(item);
  }
  return out;
}

export async function mapLimit(list, limit, fn) {
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await fn(list[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeJsonIfChanged(path, data, volatileKeys = ['generatedAt']) {
  const strip = (obj) => {
    const copy = { ...obj };
    for (const key of volatileKeys) delete copy[key];
    return JSON.stringify(copy);
  };
  const previous = await readJsonSafe(path);
  if (previous && strip(previous) === strip(data)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data) + '\n', 'utf8');
  return true;
}

export function daysAgoIso(days) {
  return new Date(Date.now() - days * 864e5).toISOString();
}
