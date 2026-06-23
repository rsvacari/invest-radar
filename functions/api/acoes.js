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

function cleanCell(td) {
  return td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function scoreAcao(a) {
  let score = 0;

  if (a.pl !== null && a.pl > 0) {
    if (a.pl >= 6 && a.pl <= 12)      score += 25;
    else if (a.pl > 12 && a.pl <= 18) score += 18;
    else if (a.pl > 18 && a.pl <= 25) score += 10;
    else if (a.pl > 0 && a.pl < 6)    score += 8;
    else                               score += 3;
  }

  if (a.pvp !== null && a.pvp > 0) {
    if (a.pvp < 0.8)       score += 20;
    else if (a.pvp < 1.2)  score += 16;
    else if (a.pvp < 1.8)  score += 10;
    else if (a.pvp < 2.5)  score += 5;
  }

  if (a.roe !== null) {
    const r = a.roe * 100;
    if (r >= 25)      score += 20;
    else if (r >= 18) score += 16;
    else if (r >= 12) score += 12;
    else if (r >= 7)  score += 7;
    else if (r >= 3)  score += 3;
  }

  if (a.dy !== null) {
    const d = a.dy * 100;
    if (d >= 10)      score += 20;
    else if (d >= 7)  score += 16;
    else if (d >= 5)  score += 12;
    else if (d >= 3)  score += 7;
    else if (d >= 1)  score += 3;
  }

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
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'identity',
      'Referer': 'https://www.fundamentus.com.br/',
      'Cache-Control': 'no-cache',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar Fundamentus`);

  const html = await res.text();

  if (!html || html.length < 1000) throw new Error('Resposta vazia ou bloqueada pelo Fundamentus');

  const tableMatch = html.match(/<table[^>]*id="resultado"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    // Retorna amostra para diagnóstico
    const snippet = html.slice(0, 300).replace(/</g, '&lt;');
    throw new Error(`Tabela não encontrada. Início da resposta: ${snippet}`);
  }

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('tbody não encontrado na tabela');

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const acoes = [];

  for (const row of rowMatches) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(cleanCell);
    if (cells.length < 20) continue;

    const a = {
      papel:         cells[0],
      cotacao:       parseBR(cells[1]),
      pl:            parseBR(cells[2]),
      pvp:           parseBR(cells[3]),
      psr:           parseBR(cells[4]),
      dy:            parseBR(cells[5]),
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

    if (!a.papel || a.papel.length > 8) continue;
    if (!a.liq2meses || a.liq2meses < 200000) continue;

    a.score = scoreAcao(a);
    a.rec = getRecommendation(a.score);
    acoes.push(a);
  }

  if (acoes.length === 0) throw new Error(`Nenhuma ação parseada. Linhas encontradas: ${rowMatches.length}`);

  acoes.sort((a, b) => b.score - a.score);
  return acoes.slice(0, 80);
}

export async function onRequest(context) {
  try {
    // Tenta cache primeiro
    let cached = null;
    try {
      const cacheKey = new Request('https://invest-radar-cache.internal/acoes-v2');
      const cache = caches.default;
      cached = await cache.match(cacheKey);
      if (cached) {
        const body = await cached.text();
        if (body && body.length > 10) {
          return new Response(body, {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'HIT' },
          });
        }
      }

      const data = await fetchAcoes();
      const responseBody = JSON.stringify({ success: true, data, updatedAt: new Date().toISOString() });
      const response = new Response(responseBody, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'X-Cache': 'MISS',
        },
      });
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (innerErr) {
      // Se o cache falhou mas dados foram obtidos, tenta sem cache
      const data = await fetchAcoes();
      const responseBody = JSON.stringify({ success: true, data, updatedAt: new Date().toISOString() });
      return new Response(responseBody, {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
