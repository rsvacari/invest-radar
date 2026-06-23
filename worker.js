// ===== Utilitários =====
function parseBR(str) {
  if (!str) return null;
  const s = str.trim();
  if (s === '-' || s === '' || s === 'N/A') return null;
  const isPercent = s.includes('%');
  const val = parseFloat(s.replace(/\./g, '').replace(',', '.').replace('%', ''));
  if (isNaN(val)) return null;
  return isPercent ? val / 100 : val;
}

function cleanCell(td) {
  return td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=7200' : 'no-store',
    },
  });
}

// ===== AÇÕES =====
function scoreAcao(a) {
  let s = 0;
  if (a.pl !== null && a.pl > 0) {
    if (a.pl >= 6 && a.pl <= 12)      s += 25;
    else if (a.pl <= 18)               s += 18;
    else if (a.pl <= 25)               s += 10;
    else if (a.pl < 6)                 s += 8;
    else                               s += 3;
  }
  if (a.pvp !== null && a.pvp > 0) {
    if (a.pvp < 0.8)      s += 20;
    else if (a.pvp < 1.2) s += 16;
    else if (a.pvp < 1.8) s += 10;
    else if (a.pvp < 2.5) s += 5;
  }
  if (a.roe !== null) {
    const r = a.roe * 100;
    if (r >= 25) s += 20; else if (r >= 18) s += 16;
    else if (r >= 12) s += 12; else if (r >= 7) s += 7; else if (r >= 3) s += 3;
  }
  if (a.dy !== null) {
    const d = a.dy * 100;
    if (d >= 10) s += 20; else if (d >= 7) s += 16;
    else if (d >= 5) s += 12; else if (d >= 3) s += 7; else if (d >= 1) s += 3;
  }
  if (a.divBrutPatrim !== null) {
    if (a.divBrutPatrim < 0.3) s += 15; else if (a.divBrutPatrim < 0.6) s += 12;
    else if (a.divBrutPatrim < 1.0) s += 8; else if (a.divBrutPatrim < 1.5) s += 4;
  }
  return Math.min(100, s);
}

function rec(score) {
  if (score >= 80) return { label: 'FORTE COMPRA', cls: 'rec-strong-buy' };
  if (score >= 65) return { label: 'COMPRA',       cls: 'rec-buy' };
  if (score >= 50) return { label: 'NEUTRO',       cls: 'rec-neutral' };
  if (score >= 35) return { label: 'CAUTELA',      cls: 'rec-caution' };
  return              { label: 'EVITAR',        cls: 'rec-avoid' };
}

async function handleAcoes() {
  const res = await fetch('https://www.fundamentus.com.br/resultado.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.fundamentus.com.br/',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} do Fundamentus`);
  const html = await res.text();
  if (!html || html.length < 500) throw new Error('Resposta vazia do Fundamentus');

  const tableMatch = html.match(/<table[^>]*id="resultado"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Tabela não encontrada. O Fundamentus pode ter bloqueado a requisição.');

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('tbody não encontrado');

  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const acoes = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(cleanCell);
    if (cells.length < 20) continue;
    const a = {
      papel: cells[0], cotacao: parseBR(cells[1]),
      pl: parseBR(cells[2]), pvp: parseBR(cells[3]), psr: parseBR(cells[4]),
      dy: parseBR(cells[5]), pEbit: parseBR(cells[8]),
      evEbit: parseBR(cells[10]), evEbitda: parseBR(cells[11]),
      mrgEbit: parseBR(cells[12]), mrgLiq: parseBR(cells[13]),
      liqCorr: parseBR(cells[14]), roic: parseBR(cells[15]),
      roe: parseBR(cells[16]), liq2meses: parseBR(cells[17]),
      patrimLiq: parseBR(cells[18]), divBrutPatrim: parseBR(cells[19]),
      cresc5a: parseBR(cells[20]),
    };
    // Ticker: entre 4 e 10 caracteres, sem espaços
    if (!a.papel || a.papel.length < 4 || a.papel.length > 10 || a.papel.includes(' ')) continue;
    // Liquidez: aceita qualquer valor > 0 (a escala será descoberta via /api/debug)
    if (a.liq2meses === null || a.liq2meses <= 0) continue;
    a.score = scoreAcao(a);
    a.rec = rec(a.score);
    acoes.push(a);
  }

  if (!acoes.length) throw new Error(`Nenhuma ação parseada de ${rows.length} linhas`);
  acoes.sort((a, b) => b.score - a.score);
  return acoes.slice(0, 80);
}

// Diagnóstico: retorna as primeiras 5 linhas brutas para inspecionar colunas
async function handleDebug() {
  const res = await fetch('https://www.fundamentus.com.br/resultado.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.fundamentus.com.br/',
    },
  });
  const html = await res.text();
  const tableMatch = html.match(/<table[^>]*id="resultado"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return { error: 'tabela não encontrada', htmlLen: html.length, start: html.slice(0, 300) };
  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return { error: 'tbody não encontrado' };
  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const sample = rows.slice(0, 3).map(row => {
    return (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(cleanCell);
  });
  return { totalRows: rows.length, sample };
}

// ===== FIIs =====
function scoreFii(f) {
  let s = 0;
  if (f.pvp !== null && f.pvp > 0) {
    if (f.pvp < 0.80) s += 35; else if (f.pvp < 0.90) s += 28;
    else if (f.pvp < 1.00) s += 20; else if (f.pvp < 1.05) s += 12;
    else if (f.pvp < 1.10) s += 6;
  }
  if (f.dy !== null) {
    const d = f.dy * 100;
    if (d >= 14) s += 35; else if (d >= 12) s += 28;
    else if (d >= 10) s += 20; else if (d >= 8) s += 12; else if (d >= 6) s += 6;
  }
  if (f.liquidez !== null) {
    if (f.liquidez >= 2e6) s += 15; else if (f.liquidez >= 1e6) s += 12;
    else if (f.liquidez >= 5e5) s += 8; else if (f.liquidez >= 2e5) s += 4;
  }
  if (f.ffoYield !== null && f.dy !== null && f.dy > 0) {
    const r = f.ffoYield / f.dy;
    if (r >= 1.0) s += 15; else if (r >= 0.9) s += 10; else if (r >= 0.7) s += 5;
  } else { s += 7; }
  return Math.min(100, s);
}

async function handleFiis() {
  const res = await fetch('https://www.fundamentus.com.br/fii_resultado.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.fundamentus.com.br/',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} do Fundamentus FII`);
  const html = await res.text();
  if (!html || html.length < 500) throw new Error('Resposta vazia do Fundamentus (FII)');

  const tableMatch = html.match(/<table[^>]*id="tabelaResultado"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Tabela de FIIs não encontrada');

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('tbody de FIIs não encontrado');

  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const fiis = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(cleanCell);
    if (cells.length < 8) continue;
    const f = {
      fii: cells[0], nome: cells[1], mandato: cells[2],
      segmento: cells[3], gestao: cells[4],
      cotacao: parseBR(cells[5]), ffoYield: parseBR(cells[6]),
      dy: parseBR(cells[7]), pvp: parseBR(cells[8]),
      vpCota: parseBR(cells[9]), liquidez: parseBR(cells[10]),
      qtdeAtivos: parseBR(cells[11]),
    };
    if (!f.fii || f.fii.length < 4 || f.fii.length > 10 || f.fii.includes(' ')) continue;
    if (f.liquidez === null || f.liquidez <= 0) continue;
    f.score = scoreFii(f);
    f.rec = rec(f.score);
    fiis.push(f);
  }

  if (!fiis.length) throw new Error(`Nenhum FII parseado de ${rows.length} linhas`);
  fiis.sort((a, b) => b.score - a.score);
  return fiis.slice(0, 80);
}

// ===== NEWS =====
const FEEDS = [
  { url: 'https://g1.globo.com/rss/g1/tecnologia/', category: 'tech' },
  { url: 'https://canaltech.com.br/rss/', category: 'tech' },
  { url: 'https://rss.tecmundo.com.br/feed', category: 'tech' },
  { url: 'https://www.mining.com/feed/', category: 'mining' },
  { url: 'https://feeds.feedburner.com/TechCrunch', category: 'tech' },
  { url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
  { url: 'https://www.infomoney.com.br/feed/', category: 'finance' },
];

const QUOTES = [
  { text: 'O segredo do sucesso é fazer do comum algo extraordinário.', author: 'John D. Rockefeller' },
  { text: 'A tecnologia é melhor quando une as pessoas.', author: 'Matt Mullenweg' },
  { text: 'Inovar é o que distingue um líder de um seguidor.', author: 'Steve Jobs' },
  { text: 'O maior risco é não correr nenhum risco.', author: 'Mark Zuckerberg' },
  { text: 'A persistência é o caminho do êxito.', author: 'Charlie Chaplin' },
  { text: 'Não é o mais forte que sobrevive, mas o mais adaptável.', author: 'Charles Darwin' },
  { text: 'O futuro pertence àqueles que acreditam na beleza de seus sonhos.', author: 'Eleanor Roosevelt' },
  { text: 'Dados são o novo petróleo. A mineração de dados é a nova perfuração.', author: 'Clive Humby' },
  { text: 'Simplicidade é a sofisticação máxima.', author: 'Leonardo da Vinci' },
  { text: 'Investir em conhecimento paga os melhores juros.', author: 'Benjamin Franklin' },
  { text: 'O risco vem de não saber o que você está fazendo.', author: 'Warren Buffett' },
  { text: 'O tempo no mercado bate o timing do mercado.', author: 'Ken Fisher' },
  { text: 'Qualidade nunca é acidente; é o resultado de esforço inteligente.', author: 'John Ruskin' },
  { text: 'Trabalhe duro em silêncio. Deixe o sucesso ser seu barulho.', author: 'Frank Ocean' },
  { text: 'A mina mais rica do mundo é a mente humana.', author: 'Napoleon Hill' },
];

function getQuote() {
  return QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
}

function parseRSS(xml) {
  const blocks = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi)
    || xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
  return blocks.slice(0, 8).flatMap(block => {
    const t = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const l = block.match(/<link[^>]*>(?:<!\[CDATA\[)?(https?[^<\s]+)(?:\]\]>)?<\/link>/i)
      || block.match(/<link[^>]*href="([^"]+)"/i);
    const d = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
      || block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const dt = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
      || block.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
    if (!t || !l) return [];
    return [{
      title: t[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
      link: l[1].trim(),
      desc: d ? d[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200) : '',
      date: dt ? new Date(dt[1].trim()).toISOString() : new Date().toISOString(),
    }];
  });
}

async function fetchFeed(feed) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestRadarBot/1.0)', 'Accept-Encoding': 'identity' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    return (await parseRSS(await res.text())).map(i => ({ ...i, category: feed.category }));
  } catch { return []; }
}

async function handleNews() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const news = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  news.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { news: news.slice(0, 40), quote: getQuote() };
}

// ===== ROTEADOR PRINCIPAL =====
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cache helper
    const cache = caches.default;
    const cacheKey = new Request(url.toString());

    if (url.pathname === '/api/debug') {
      try {
        const data = await handleDebug();
        return json({ success: true, data });
      } catch (e) {
        return json({ success: false, error: e.message });
      }
    }

    if (url.pathname === '/api/acoes') {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      try {
        const data = await handleAcoes();
        const res = json({ success: true, data, updatedAt: new Date().toISOString() });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (e) {
        return json({ success: false, error: e.message }, 500);
      }
    }

    if (url.pathname === '/api/fiis') {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      try {
        const data = await handleFiis();
        const res = json({ success: true, data, updatedAt: new Date().toISOString() });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (e) {
        return json({ success: false, error: e.message }, 500);
      }
    }

    if (url.pathname === '/api/news') {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      try {
        const result = await handleNews();
        const res = new Response(JSON.stringify({ success: true, ...result, updatedAt: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=1800' },
        });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (e) {
        return json({ success: false, error: e.message, news: [], quote: getQuote() });
      }
    }

    // Servir arquivos estáticos
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
