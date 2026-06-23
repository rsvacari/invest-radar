const CACHE_TTL = 7200;

function parseBR(str) {
  if (!str) return null;
  const s = str.trim();
  if (s === '-' || s === '' || s === 'N/A') return null;
  const isPercent = s.includes('%');
  const val = parseFloat(s.replace(/\./g, '').replace(',', '.').replace('%', ''));
  if (isNaN(val)) return null;
  return isPercent ? val / 100 : val;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .trim();
}

function scoreAcao(a) {
  let score = 0;

  // P/L (25 pts) — ideal 6-15, negativo é péssimo
  if (a.pl !== null && a.pl > 0) {
    if (a.pl >= 6 && a.pl <= 12)      score += 25;
    else if (a.pl > 12 && a.pl <= 18) score += 18;
    else if (a.pl > 18 && a.pl <= 25) score += 10;
    else if (a.pl > 0 && a.pl < 6)    score += 8;
    else if (a.pl > 25)               score += 3;
  }

  // P/VP (20 pts) — abaixo de 1 é desconto sobre patrimônio
  if (a.pvp !== null && a.pvp > 0) {
    if (a.pvp < 0.8)       score += 20;
    else if (a.pvp < 1.2)  score += 16;
    else if (a.pvp < 1.8)  score += 10;
    else if (a.pvp < 2.5)  score += 5;
  }

  // ROE (20 pts) — retorno sobre patrimônio
  if (a.roe !== null) {
    const roe = a.roe * 100;
    if (roe >= 25)      score += 20;
    else if (roe >= 18) score += 16;
    else if (roe >= 12) score += 12;
    else if (roe >= 7)  score += 7;
    else if (roe >= 3)  score += 3;
  }

  // Dividend Yield (20 pts)
  if (a.dy !== null) {
    const dy = a.dy * 100;
    if (dy >= 10)      score += 20;
    else if (dy >= 7)  score += 16;
    else if (dy >= 5)  score += 12;
    else if (dy >= 3)  score += 7;
    else if (dy >= 1)  score += 3;
  }

  // Dívida/PL (15 pts) — quanto menor, mais saudável
  if (a.divBrutPatrim !== null) {
    if (a.divBrutPatrim < 0.3)      score += 15;
    else if (a.divBrutPatrim < 0.6) score += 12;
    else if (a.divBrutPatrim < 1.0) score += 8;
    else if (a.divBrutPatrim < 1.5) score += 4;
  }

  return Math.min(100, score);
}

function getRecommendation(score) {
  if (score >= 80) return { label: 'FORTE COMPRA', cls: 'rec-strong-buy' };
  if (score >= 65) return { label: 'COMPRA',       cls: 'rec-buy' };
  if (score >= 50) return { label: 'NEUTRO',       cls: 'rec-neutral' };
  if (score >= 35) return { label: 'CAUTELA',      cls: 'rec-caution' };
  return              { label: 'EVITAR',        cls: 'rec-avoid' };
}

async function fetchAcoes() {
  const res = await fetch('https://www.fundamentus.com.br/resultado.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Referer': 'https://www.fundamentus.com.br/',
    },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });

  if (!res.ok) throw new Error(`Fundamentus retornou HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buffer);

  const tableMatch = html.match(/<table[^>]*id="resultado"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Tabela de resultados não encontrada');

  // Extrair cabeçalhos
  const theadMatch = tableMatch[1].match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headers = [];
  if (theadMatch) {
    const ths = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    for (const th of ths) {
      headers.push(decodeHtmlEntities(th.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')));
    }
  }

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('tbody não encontrado');

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const acoes = [];

  for (const row of rowMatches) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(td => decodeHtmlEntities(td.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')));

    if (cells.length < 20) continue;

    const a = {
      papel:         cells[0],
      cotacao:       parseBR(cells[1]),
      pl:            parseBR(cells[2]),
      pvp:           parseBR(cells[3]),
      psr:           parseBR(cells[4]),
      dy:            parseBR(cells[5]),
      pAtivo:        parseBR(cells[6]),
      pEbit:         parseBR(cells[8]),
      evEbit:        parseBR(cells[10]),
      evEbitda:      parseBR(cells[11]),
      mrgEbit:       parseBR(cells[12]),
      mrgLiq:        parseBR(cells[13]),
      liqCorr:       parseBR(cells[14]),
      roic:          parseBR(cells[15]),
      roe:           parseBR(cells[16]),
      liq2meses:     parseBR(cells[17]),
      patrimLiq:     parseBR(cells[18]),
      divBrutPatrim: parseBR(cells[19]),
      cresc5a:       parseBR(cells[20]),
    };

    if (!a.papel || !a.liq2meses || a.liq2meses < 200000) continue;

    a.score = scoreAcao(a);
    a.rec = getRecommendation(a.score);
    acoes.push(a);
  }

  acoes.sort((a, b) => b.score - a.score);
  return acoes.slice(0, 80);
}

export async function onRequest(context) {
  const cacheKey = new Request('https://invest-radar-cache.internal/acoes-v1');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchAcoes();
    const body = JSON.stringify({ success: true, data, updatedAt: new Date().toISOString() });
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
