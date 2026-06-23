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
// Conteúdo estático curado — sem dependências externas que podem falhar no Workers
function gSearch(q) { return 'https://www.google.com/search?q=' + encodeURIComponent(q); }

const STATIC_NEWS = [
  // Tech
  { title: 'IA generativa transforma operações de TI em mineradoras', link: gSearch('IA generativa mineração manutenção preditiva 2026'), desc: 'Ferramentas baseadas em LLMs estão sendo adotadas para manutenção preditiva de equipamentos, reduzindo tempo de parada e custos operacionais em grandes mineradoras.', date: '2026-06-20T08:00:00Z', category: 'tech' },
  { title: 'Cloud híbrida se consolida como padrão no setor mineral', link: gSearch('cloud híbrida mineração telemetria 2026'), desc: 'Empresas de mineração combinam nuvem pública e privada para processar dados sísmicos e de telemetria em tempo real, com redução de latência operacional.', date: '2026-06-18T10:00:00Z', category: 'tech' },
  { title: 'Cibersegurança em OT: protegendo sistemas industriais da mineração', link: gSearch('cibersegurança OT SCADA mineração 2026'), desc: 'Ataques a sistemas de controle industrial (SCADA/OT) cresceram 40% em 2025. Especialistas recomendam segmentação de rede e monitoramento contínuo.', date: '2026-06-16T09:00:00Z', category: 'tech' },
  { title: 'Python e R dominam análise de dados geológicos em 2026', link: gSearch('Python análise dados geológicos mineração 2026'), desc: 'Geólogos e engenheiros de dados adotam pipelines modernos com Python para modelagem 3D de depósitos minerais, substituindo softwares legados.', date: '2026-06-14T11:00:00Z', category: 'tech' },
  { title: 'Edge computing nas minas: processamento sem conectividade constante', link: gSearch('edge computing mineração IoT sensores 2026'), desc: 'Dispositivos edge permitem processar dados de sensores em tempo real mesmo em áreas sem cobertura de rede, viabilizando automação em minas subterrâneas.', date: '2026-06-12T08:00:00Z', category: 'tech' },
  { title: 'DevOps para indústria: CI/CD em ambientes críticos de mineração', link: gSearch('DevOps indústria mineração CI CD 2026'), desc: 'Times de TI em mineradoras implementam pipelines de entrega contínua para sistemas de controle, reduzindo janelas de manutenção e risco de falhas.', date: '2026-06-10T10:00:00Z', category: 'tech' },
  { title: 'Digital twin: gêmeos digitais de minas economizam milhões', link: gSearch('digital twin gêmeo digital mineração 2026'), desc: 'Simulações virtuais de operações minerais permitem testar cenários de extração, reduzindo custos de planejamento e aumentando a segurança operacional.', date: '2026-06-08T09:00:00Z', category: 'tech' },
  // Mining
  { title: 'Vale: produção de minério de ferro cresce em 2026', link: 'https://www.vale.com/pt/imprensa', desc: 'A Vale reporta crescimento na produção de minério de ferro, impulsionado por maior eficiência operacional nas minas do Pará e Minas Gerais.', date: '2026-06-19T14:00:00Z', category: 'mining' },
  { title: 'Preço do cobre atinge máximas com demanda por veículos elétricos', link: 'https://www.mining.com', desc: 'A transição energética global impulsiona a demanda por cobre, com projeções de déficit de oferta para os próximos 5 anos, beneficiando mineradoras brasileiras.', date: '2026-06-17T15:00:00Z', category: 'mining' },
  { title: 'Automação substitui trabalho de risco em minas brasileiras', link: gSearch('automação mineração caminhões autônomos drones 2026'), desc: 'Caminhões autônomos e drones de inspeção reduzem a exposição humana a ambientes perigosos, enquanto aumentam produtividade em operações 24/7.', date: '2026-06-15T13:00:00Z', category: 'mining' },
  { title: 'ESG na mineração: relatórios de sustentabilidade viram obrigação', link: gSearch('ESG mineração sustentabilidade emissões carbono 2026'), desc: 'Investidores institucionais exigem métricas claras de emissões de carbono e impacto social antes de alocar capital em empresas do setor mineral.', date: '2026-06-13T10:00:00Z', category: 'mining' },
  { title: 'Lítio brasileiro: corrida por reservas para baterias de veículos elétricos', link: gSearch('lítio Brasil reservas mineração 2026'), desc: 'Minas Gerais concentra as maiores reservas de lítio do país. Empresas aceleram licenciamentos para atender à demanda crescente da indústria automotiva global.', date: '2026-06-11T11:00:00Z', category: 'mining' },
  { title: 'Segurança de barragens: monitoramento em tempo real com IoT', link: gSearch('segurança barragens IoT monitoramento ANM 2026'), desc: 'Sensores IoT e sistemas de alerta precoce baseados em IA estão sendo implantados em barragens de rejeitos em todo o Brasil após nova regulamentação da ANM.', date: '2026-06-09T09:00:00Z', category: 'mining' },
  // Finance
  { title: 'Selic em queda: como rebalancear a carteira agora', link: 'https://www.infomoney.com.br', desc: 'Com a taxa básica em trajetória de corte, analistas recomendam migrar gradualmente de renda fixa para ações de dividendos e FIIs com bom histórico de distribuição.', date: '2026-06-21T10:00:00Z', category: 'finance' },
  { title: 'FIIs de papel vs tijolo: qual escolher em 2026', link: gSearch('FII papel tijolo comparação 2026 site:infomoney.com.br OR site:suno.com.br'), desc: 'FIIs de papel se beneficiam da inflação elevada pelo IPCA+, enquanto FIIs de tijolo oferecem renda de aluguel com desconto no P/VP. Diversificar é a estratégia preferida.', date: '2026-06-18T12:00:00Z', category: 'finance' },
  { title: 'P/VP abaixo de 1: oportunidade real ou armadilha de valor?', link: gSearch('P/VP abaixo de 1 ações FII oportunidade 2026'), desc: 'Nem todo ativo negociado com desconto sobre o patrimônio líquido é oportunidade. Analistas alertam para qualidade dos ativos e histórico de gestão antes de comprar.', date: '2026-06-16T14:00:00Z', category: 'finance' },
  { title: 'Dividend yield acima de 10%: melhores pagadores de dividendos', link: gSearch('dividend yield 10% ações FII melhores pagadores 2026'), desc: 'Levantamento identifica ações e FIIs com DY consistente acima de 10% ao ano, com histórico de pagamento regular e fundamentos sólidos para sustentar a distribuição.', date: '2026-06-14T11:00:00Z', category: 'finance' },
  { title: 'Como calcular o preço justo de uma ação pelos múltiplos', link: gSearch('valuation múltiplos P/L P/VP EV/EBITDA ROE ações B3'), desc: 'Entender P/L, P/VP, EV/EBITDA e ROE em conjunto é mais eficaz do que usar qualquer indicador isolado. Guia prático de valuation para investidor pessoa física.', date: '2026-06-12T09:00:00Z', category: 'finance' },
  { title: 'ROE alto com dívida elevada: como interpretar corretamente', link: gSearch('ROE alto dívida elevada alavancagem análise fundamentalista'), desc: 'Empresas alavancadas podem apresentar ROE inflado. Analistas recomendam combinar com Dívida/PL para identificar se a rentabilidade é sustentável ou artificial.', date: '2026-06-10T10:00:00Z', category: 'finance' },
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

function handleNews() {
  return { news: STATIC_NEWS, quote: getQuote() };
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
      const result = handleNews();
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Serve arquivos estáticos da pasta public/
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
