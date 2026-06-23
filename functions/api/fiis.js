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

function scoreFii(f) {
  let score = 0;

  // P/VP (35 pts) — principal indicador de desconto do FII
  if (f.pvp !== null && f.pvp > 0) {
    if (f.pvp < 0.80)       score += 35;
    else if (f.pvp < 0.90)  score += 28;
    else if (f.pvp < 1.00)  score += 20;
    else if (f.pvp < 1.05)  score += 12;
    else if (f.pvp < 1.10)  score += 6;
    // acima de 1.10 = 0 pts
  }

  // Dividend Yield (35 pts) — rendimento mensal proventos
  if (f.dy !== null) {
    const dy = f.dy * 100;
    if (dy >= 14)      score += 35;
    else if (dy >= 12) score += 28;
    else if (dy >= 10) score += 20;
    else if (dy >= 8)  score += 12;
    else if (dy >= 6)  score += 6;
  }

  // Liquidez Diária (15 pts) — facilidade de negociar
  if (f.liquidez !== null) {
    if (f.liquidez >= 2000000)      score += 15;
    else if (f.liquidez >= 1000000) score += 12;
    else if (f.liquidez >= 500000)  score += 8;
    else if (f.liquidez >= 200000)  score += 4;
  }

  // FFO Yield vs DY (15 pts) — sustentabilidade dos proventos
  if (f.ffoYield !== null && f.dy !== null) {
    const ratio = f.ffoYield / f.dy;
    if (ratio >= 1.0)      score += 15;
    else if (ratio >= 0.9) score += 10;
    else if (ratio >= 0.7) score += 5;
  } else if (f.dy !== null) {
    score += 7; // sem FFO, parcial
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

async function fetchFiis() {
  const res = await fetch('https://www.fundamentus.com.br/fii_resultado.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Referer': 'https://www.fundamentus.com.br/',
    },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });

  if (!res.ok) throw new Error(`Fundamentus FII retornou HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buffer);

  const tableMatch = html.match(/<table[^>]*id="tabelaResultado"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Tabela de FIIs não encontrada');

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('tbody de FIIs não encontrado');

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const fiis = [];

  for (const row of rowMatches) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(td => decodeHtmlEntities(td.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')));

    if (cells.length < 8) continue;

    // Colunas FII: FII | Nome | Mandato | Segmento | Gestão | Cotação | FFO Yield | Div.Yield | P/VP | VP/Cota | Liquidez | Qtde Ativos
    const f = {
      fii:        cells[0],
      nome:       cells[1],
      mandato:    cells[2],
      segmento:   cells[3],
      gestao:     cells[4],
      cotacao:    parseBR(cells[5]),
      ffoYield:   parseBR(cells[6]),
      dy:         parseBR(cells[7]),
      pvp:        parseBR(cells[8]),
      vpCota:     parseBR(cells[9]),
      liquidez:   parseBR(cells[10]),
      qtdeAtivos: parseBR(cells[11]),
    };

    if (!f.fii || !f.liquidez || f.liquidez < 100000) continue;

    f.score = scoreFii(f);
    f.rec = getRecommendation(f.score);
    fiis.push(f);
  }

  fiis.sort((a, b) => b.score - a.score);
  return fiis.slice(0, 80);
}

export async function onRequest(context) {
  const cacheKey = new Request('https://invest-radar-cache.internal/fiis-v1');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchFiis();
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
