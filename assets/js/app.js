// ===== State =====
const state = {
  activeTab: 'oportunidades',
  activeSubTab: 'acoes',
  acoes: [],
  fiis: [],
  news: [],
  quote: null,
  acoesSort: { col: 'score', dir: 'desc' },
  fiisSort:  { col: 'score', dir: 'desc' },
  acoesFiler: { search: '', rec: '' },
  fiisFiler:  { search: '', rec: '' },
  newsFilter: 'all',
  updatedAt: {},
  loading: {},
  error: {},
};

// ===== Formatters =====
const fmt = {
  pct: v => v == null ? '—' : (v * 100).toFixed(2) + '%',
  num: (v, d = 2) => v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  brl: v => v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  big: v => {
    if (v == null) return '—';
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(v);
  },
  date: iso => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  },
  newsDate: iso => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 3600)  return Math.floor(diff / 60) + 'min atrás';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h atrás';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
  },
};

function scoreColor(score) {
  if (score >= 80) return 'var(--strong-buy)';
  if (score >= 65) return 'var(--buy)';
  if (score >= 50) return 'var(--neutral)';
  if (score >= 35) return 'var(--caution)';
  return 'var(--avoid)';
}

function numClass(v, goodPositive = true) {
  if (v == null) return 'num-neu';
  return (v > 0) === goodPositive ? 'num-pos' : 'num-neg';
}

// ===== Tab Routing =====
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
  if (tabId === 'oportunidades' && state.acoes.length === 0) loadAcoes();
  if (tabId === 'noticias' && state.news.length === 0) loadNews();
}

function switchSubTab(sub) {
  state.activeSubTab = sub;
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.dataset.sub === sub));
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === 'sub-' + sub));
  if (sub === 'fiis' && state.fiis.length === 0) loadFiis();
}

// ===== API Fetching =====
async function loadAcoes(force = false) {
  if (state.loading.acoes && !force) return;
  state.loading.acoes = true;
  renderAcoes();
  try {
    const url = '/api/acoes' + (force ? '?bust=' + Date.now() : '');
    const r = await fetch(url);
    const json = await r.json();
    if (!json.success) throw new Error(json.error);
    state.acoes = json.data;
    state.updatedAt.acoes = json.updatedAt;
    state.error.acoes = null;
  } catch (e) {
    state.error.acoes = e.message;
  } finally {
    state.loading.acoes = false;
    renderAcoes();
    updateStatCards();
  }
}

async function loadFiis(force = false) {
  if (state.loading.fiis && !force) return;
  state.loading.fiis = true;
  renderFiis();
  try {
    const url = '/api/fiis' + (force ? '?bust=' + Date.now() : '');
    const r = await fetch(url);
    const json = await r.json();
    if (!json.success) throw new Error(json.error);
    state.fiis = json.data;
    state.updatedAt.fiis = json.updatedAt;
    state.error.fiis = null;
  } catch (e) {
    state.error.fiis = e.message;
  } finally {
    state.loading.fiis = false;
    renderFiis();
    updateStatCards();
  }
}

async function loadNews() {
  state.loading.news = true;
  renderNews();
  try {
    const r = await fetch('/api/news');
    const json = await r.json();
    if (!json.success) throw new Error(json.error || 'Erro ao carregar notícias');
    state.news = json.news || [];
    state.quote = json.quote;
    state.error.news = null;
  } catch (e) {
    state.error.news = e.message;
  } finally {
    state.loading.news = false;
    renderNews();
  }
}

// ===== Filtering & Sorting =====
function filterAndSort(items, filter, sortState) {
  let result = [...items];
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(a => {
      const ticker = (a.papel || a.fii || '').toLowerCase();
      const nome = (a.nome || '').toLowerCase();
      return ticker.includes(q) || nome.includes(q);
    });
  }
  if (filter.rec) {
    result = result.filter(a => a.rec && a.rec.cls === filter.rec);
  }
  result.sort((a, b) => {
    let av = a[sortState.col], bv = b[sortState.col];
    if (typeof av === 'object') av = av?.label;
    if (typeof bv === 'object') bv = bv?.label;
    av = av ?? -Infinity;
    bv = bv ?? -Infinity;
    return sortState.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
  return result;
}

function toggleSort(type, col) {
  const s = type === 'acoes' ? state.acoesSort : state.fiisSort;
  if (s.col === col) s.dir = s.dir === 'desc' ? 'asc' : 'desc';
  else { s.col = col; s.dir = 'desc'; }
  if (type === 'acoes') renderAcoes();
  else renderFiis();
}

// ===== Render: Stat Cards =====
function updateStatCards() {
  const acoes = state.acoes;
  const fiis = state.fiis;
  const allAssets = [...acoes, ...fiis];

  const strongBuy = allAssets.filter(a => a.rec?.cls === 'rec-strong-buy').length;
  const buy = allAssets.filter(a => a.rec?.cls === 'rec-buy').length;
  const avgScore = allAssets.length
    ? (allAssets.reduce((s, a) => s + (a.score || 0), 0) / allAssets.length).toFixed(0)
    : '—';

  setEl('stat-total', allAssets.length || '—');
  setEl('stat-strong-buy', strongBuy || '—');
  setEl('stat-buy', buy || '—');
  setEl('stat-avg', avgScore);

  const at = state.updatedAt.acoes || state.updatedAt.fiis;
  setEl('updated-time', at ? fmt.date(at) : '—');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ===== Render: Ações Table =====
function renderAcoes() {
  const container = document.getElementById('acoes-container');
  if (!container) return;

  if (state.loading.acoes) {
    container.innerHTML = stateCardHtml('loading');
    return;
  }
  if (state.error.acoes) {
    container.innerHTML = stateCardHtml('error', state.error.acoes);
    return;
  }
  if (!state.acoes.length) {
    container.innerHTML = stateCardHtml('empty');
    return;
  }

  const items = filterAndSort(state.acoes, state.acoesFiler, state.acoesSort);

  if (!items.length) {
    container.innerHTML = stateCardHtml('empty', 'Nenhuma ação encontrada com os filtros atuais.');
    return;
  }

  const s = state.acoesSort;
  const sh = col => `<span class="sort-icon"></span>`;
  const thCls = col => s.col === col ? `class="sort-${s.dir}"` : '';

  container.innerHTML = `
    <div class="table-wrap">
      <table class="assets-table">
        <thead>
          <tr>
            <th onclick="toggleSort('acoes','score')" ${thCls('score')}>Score${sh('score')}</th>
            <th onclick="toggleSort('acoes','papel')" ${thCls('papel')}>Ticker${sh('papel')}</th>
            <th onclick="toggleSort('acoes','rec')" ${thCls('rec')}>Recomendação${sh('rec')}</th>
            <th onclick="toggleSort('acoes','cotacao')" ${thCls('cotacao')}>Cotação${sh('cotacao')}</th>
            <th onclick="toggleSort('acoes','pl')" ${thCls('pl')}>P/L <span class="info-icon" data-tip="Preço/Lucro: quantos anos de lucro para pagar o preço. Ideal: 6-18">i</span>${sh('pl')}</th>
            <th onclick="toggleSort('acoes','pvp')" ${thCls('pvp')}>P/VP <span class="info-icon" data-tip="Preço/Valor Patrimonial: abaixo de 1 = desconto sobre ativos">i</span>${sh('pvp')}</th>
            <th onclick="toggleSort('acoes','dy')" ${thCls('dy')}>Div.Yield <span class="info-icon" data-tip="Dividend Yield: retorno em dividendos dos últimos 12 meses">i</span>${sh('dy')}</th>
            <th onclick="toggleSort('acoes','roe')" ${thCls('roe')}>ROE <span class="info-icon" data-tip="Return on Equity: eficiência no uso do patrimônio. Acima de 15% é excelente">i</span>${sh('roe')}</th>
            <th onclick="toggleSort('acoes','divBrutPatrim')" ${thCls('divBrutPatrim')}>Dív/PL <span class="info-icon" data-tip="Dívida Bruta / Patrimônio Líquido: quanto menor, mais saudável">i</span>${sh('divBrutPatrim')}</th>
            <th onclick="toggleSort('acoes','mrgLiq')" ${thCls('mrgLiq')}>Mrg.Líq <span class="info-icon" data-tip="Margem Líquida: % do faturamento que vira lucro">i</span>${sh('mrgLiq')}</th>
            <th onclick="toggleSort('acoes','liq2meses')" ${thCls('liq2meses')}>Liquidez${sh('liq2meses')}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(a => renderAcaoRow(a)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAcaoRow(a) {
  const clr = scoreColor(a.score);
  const dyClass = a.dy != null ? (a.dy >= 0.05 ? 'num-pos' : 'num-neu') : 'num-neu';
  const roeClass = a.roe != null ? (a.roe >= 0.12 ? 'num-pos' : a.roe < 0 ? 'num-neg' : 'num-neu') : 'num-neu';
  const divClass = a.divBrutPatrim != null ? (a.divBrutPatrim < 0.6 ? 'num-pos' : a.divBrutPatrim > 1.5 ? 'num-neg' : 'num-neu') : 'num-neu';
  const plClass  = a.pl != null ? (a.pl > 0 && a.pl < 20 ? 'num-pos' : a.pl < 0 ? 'num-neg' : 'num-neu') : 'num-neu';
  const pvpClass = a.pvp != null ? (a.pvp < 1.0 ? 'num-pos' : a.pvp > 2 ? 'num-neg' : 'num-neu') : 'num-neu';
  return `
    <tr onclick="showModal('acoes', '${a.papel}')" style="cursor:pointer">
      <td>
        <div class="score-ring" style="--pct:${a.score};--clr:${clr}">
          <span>${a.score}</span>
        </div>
      </td>
      <td>
        <div class="ticker-cell">
          <div>
            <div class="ticker-badge">${a.papel}</div>
          </div>
        </div>
      </td>
      <td><span class="rec-badge ${a.rec.cls}">${a.rec.label}</span></td>
      <td class="num-neu">${fmt.brl(a.cotacao)}</td>
      <td class="${plClass}">${fmt.num(a.pl)}</td>
      <td class="${pvpClass}">${fmt.num(a.pvp)}</td>
      <td class="${dyClass}">${fmt.pct(a.dy)}</td>
      <td class="${roeClass}">${fmt.pct(a.roe)}</td>
      <td class="${divClass}">${fmt.num(a.divBrutPatrim)}</td>
      <td class="${numClass(a.mrgLiq)}">${fmt.pct(a.mrgLiq)}</td>
      <td class="num-neu">${fmt.big(a.liq2meses)}</td>
    </tr>
  `;
}

// ===== Render: FIIs Table =====
function renderFiis() {
  const container = document.getElementById('fiis-container');
  if (!container) return;

  if (state.loading.fiis) {
    container.innerHTML = stateCardHtml('loading');
    return;
  }
  if (state.error.fiis) {
    container.innerHTML = stateCardHtml('error', state.error.fiis);
    return;
  }
  if (!state.fiis.length) {
    container.innerHTML = stateCardHtml('empty');
    return;
  }

  const items = filterAndSort(state.fiis, state.fiisFiler, state.fiisSort);

  if (!items.length) {
    container.innerHTML = stateCardHtml('empty', 'Nenhum FII encontrado com os filtros atuais.');
    return;
  }

  const s = state.fiisSort;
  const thCls = col => s.col === col ? `class="sort-${s.dir}"` : '';
  const sh = () => `<span class="sort-icon"></span>`;

  container.innerHTML = `
    <div class="table-wrap">
      <table class="assets-table">
        <thead>
          <tr>
            <th onclick="toggleSort('fiis','score')" ${thCls('score')}>Score${sh()}</th>
            <th onclick="toggleSort('fiis','fii')" ${thCls('fii')}>FII${sh()}</th>
            <th onclick="toggleSort('fiis','rec')" ${thCls('rec')}>Recomendação${sh()}</th>
            <th onclick="toggleSort('fiis','segmento')" ${thCls('segmento')}>Segmento${sh()}</th>
            <th onclick="toggleSort('fiis','cotacao')" ${thCls('cotacao')}>Cotação${sh()}</th>
            <th onclick="toggleSort('fiis','dy')" ${thCls('dy')}>Div.Yield <span class="info-icon" data-tip="Dividend Yield: rendimento pago como proventos no período">i</span>${sh()}</th>
            <th onclick="toggleSort('fiis','ffoYield')" ${thCls('ffoYield')}>FFO Yield <span class="info-icon" data-tip="Funds From Operations: geração de caixa real do fundo. Compara com DY para avaliar sustentabilidade">i</span>${sh()}</th>
            <th onclick="toggleSort('fiis','pvp')" ${thCls('pvp')}>P/VP <span class="info-icon" data-tip="Preço sobre Valor Patrimonial: abaixo de 1 indica desconto sobre os ativos do fundo">i</span>${sh()}</th>
            <th onclick="toggleSort('fiis','vpCota')" ${thCls('vpCota')}>VP/Cota${sh()}</th>
            <th onclick="toggleSort('fiis','liquidez')" ${thCls('liquidez')}>Liquidez${sh()}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(f => renderFiiRow(f)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderFiiRow(f) {
  const clr = scoreColor(f.score);
  const dyClass  = f.dy != null ? (f.dy >= 0.08 ? 'num-pos' : 'num-neu') : 'num-neu';
  const pvpClass = f.pvp != null ? (f.pvp < 1.0 ? 'num-pos' : f.pvp > 1.1 ? 'num-neg' : 'num-neu') : 'num-neu';
  const ffoClass = f.ffoYield != null && f.dy != null
    ? (f.ffoYield >= f.dy ? 'num-pos' : 'num-caution') : 'num-neu';
  const seg = (f.segmento || '').slice(0, 18);
  return `
    <tr onclick="showModal('fiis', '${f.fii}')" style="cursor:pointer">
      <td>
        <div class="score-ring" style="--pct:${f.score};--clr:${clr}">
          <span>${f.score}</span>
        </div>
      </td>
      <td>
        <div class="ticker-cell">
          <div>
            <div class="ticker-badge">${f.fii}</div>
            <div class="ticker-num">${(f.nome || '').slice(0, 22)}</div>
          </div>
        </div>
      </td>
      <td><span class="rec-badge ${f.rec.cls}">${f.rec.label}</span></td>
      <td class="num-neu" style="font-size:.75rem">${seg || '—'}</td>
      <td class="num-neu">${fmt.brl(f.cotacao)}</td>
      <td class="${dyClass}">${fmt.pct(f.dy)}</td>
      <td class="${ffoClass}">${fmt.pct(f.ffoYield)}</td>
      <td class="${pvpClass}">${fmt.num(f.pvp)}</td>
      <td class="num-neu">${fmt.brl(f.vpCota)}</td>
      <td class="num-neu">${fmt.big(f.liquidez)}</td>
    </tr>
  `;
}

// ===== Render: News =====
function renderNews() {
  const container = document.getElementById('news-container');
  const quoteContainer = document.getElementById('quote-container');
  if (!container) return;

  if (state.loading.news) {
    container.innerHTML = stateCardHtml('loading', 'Buscando notícias...');
    return;
  }
  if (state.error.news) {
    container.innerHTML = stateCardHtml('error', state.error.news);
    return;
  }

  // Quote
  if (quoteContainer && state.quote) {
    quoteContainer.innerHTML = `
      <div class="quote-label">✨ Frase do Dia</div>
      <div class="quote-text">${state.quote.text}</div>
      <div class="quote-author">— ${state.quote.author}</div>
    `;
  }

  const filtered = state.newsFilter === 'all'
    ? state.news
    : state.news.filter(n => n.category === state.newsFilter);

  if (!filtered.length) {
    container.innerHTML = '<div class="state-card"><span class="icon">📭</span><h3>Sem notícias</h3><p>Tente outra categoria.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="news-grid">
      ${filtered.map(n => `
        <a href="${escHtml(n.link)}" target="_blank" rel="noopener noreferrer" class="news-card fade-in">
          <div class="news-cat cat-${n.category}">${catLabel(n.category, n.lang)}</div>
          <div class="news-title">${escHtml(n.title)}</div>
          ${n.desc ? `<div class="news-desc">${escHtml(n.desc)}</div>` : ''}
          <div class="news-date">${fmt.newsDate(n.date)}</div>
        </a>
      `).join('')}
    </div>
  `;
}

function catLabel(cat, lang) {
  const labels = { tech: '💻 Tecnologia', mining: '⛏️ Mineração', finance: '📈 Finanças' };
  return labels[cat] || cat;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Modal (Score Breakdown) =====
function showModal(type, ticker) {
  const items = type === 'acoes' ? state.acoes : state.fiis;
  const a = items.find(x => (x.papel || x.fii) === ticker);
  if (!a) return;

  const modal = document.getElementById('modal');
  const overlay = document.getElementById('modal-overlay');

  let breakdown;
  if (type === 'acoes') {
    breakdown = [
      { label: 'P/L',        val: fmt.num(a.pl),             pts: scoreAcaoPL(a.pl),    max: 25 },
      { label: 'P/VP',       val: fmt.num(a.pvp),            pts: scoreAcaoPVP(a.pvp),  max: 20 },
      { label: 'ROE',        val: fmt.pct(a.roe),            pts: scoreAcaoROE(a.roe),  max: 20 },
      { label: 'Div.Yield',  val: fmt.pct(a.dy),             pts: scoreAcaoDY(a.dy),    max: 20 },
      { label: 'Dív/PL',     val: fmt.num(a.divBrutPatrim),  pts: scoreAcaoDiv(a.divBrutPatrim), max: 15 },
    ];
  } else {
    breakdown = [
      { label: 'P/VP',       val: fmt.num(a.pvp),            pts: scoreFiiPVP(a.pvp),   max: 35 },
      { label: 'Div.Yield',  val: fmt.pct(a.dy),             pts: scoreFiiDY(a.dy),     max: 35 },
      { label: 'Liquidez',   val: fmt.big(a.liquidez),       pts: scoreFiiLiq(a.liquidez), max: 15 },
      { label: 'FFO/DY',     val: fmt.pct(a.ffoYield),       pts: scoreFiiFFO(a.ffoYield, a.dy), max: 15 },
    ];
  }

  const clr = scoreColor(a.score);
  const name = a.papel || a.fii;

  modal.innerHTML = `
    <div class="modal-header">
      <div>
        <div class="ticker-badge" style="font-size:1.3rem;margin-bottom:4px">${name}</div>
        <span class="rec-badge ${a.rec.cls}">${a.rec.label}</span>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div class="score-ring" style="--pct:${a.score};--clr:${clr};width:72px;height:72px">
        <span style="font-size:1.1rem">${a.score}</span>
      </div>
      <div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">Pontuação Total</div>
        <div style="font-size:1.8rem;font-weight:800;color:${clr}">${a.score}<span style="font-size:1rem;color:var(--muted)">/100</span></div>
      </div>
    </div>
    <div class="sidebar-title">Detalhamento do Score</div>
    <div class="score-breakdown">
      ${breakdown.map(b => `
        <div class="breakdown-item">
          <div class="breakdown-label">${b.label} <span style="color:var(--muted);font-size:.75rem">(${b.val})</span></div>
          <div class="breakdown-bar-wrap">
            <div class="breakdown-bar" style="width:${b.max > 0 ? (b.pts/b.max*100) : 0}%;background:${b.pts > 0 ? 'var(--primary)' : 'var(--avoid)'}"></div>
          </div>
          <div class="breakdown-val">${b.pts}/${b.max}</div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <a href="https://www.fundamentus.com.br/detalhes.php?papel=${name}" target="_blank" rel="noopener" style="color:var(--primary);font-size:.85rem;text-decoration:none">
        Ver detalhes no Fundamentus →
      </a>
    </div>
  `;

  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// Sub-scoring functions for modal breakdown
function scoreAcaoPL(pl) {
  if (pl == null || pl <= 0) return 0;
  if (pl >= 6 && pl <= 12) return 25;
  if (pl > 12 && pl <= 18) return 18;
  if (pl > 18 && pl <= 25) return 10;
  if (pl > 0 && pl < 6) return 8;
  return 3;
}
function scoreAcaoPVP(pvp) {
  if (pvp == null || pvp <= 0) return 0;
  if (pvp < 0.8) return 20;
  if (pvp < 1.2) return 16;
  if (pvp < 1.8) return 10;
  if (pvp < 2.5) return 5;
  return 0;
}
function scoreAcaoROE(roe) {
  if (roe == null) return 0;
  const r = roe * 100;
  if (r >= 25) return 20;
  if (r >= 18) return 16;
  if (r >= 12) return 12;
  if (r >= 7)  return 7;
  if (r >= 3)  return 3;
  return 0;
}
function scoreAcaoDY(dy) {
  if (dy == null) return 0;
  const d = dy * 100;
  if (d >= 10) return 20;
  if (d >= 7)  return 16;
  if (d >= 5)  return 12;
  if (d >= 3)  return 7;
  if (d >= 1)  return 3;
  return 0;
}
function scoreAcaoDiv(div) {
  if (div == null) return 0;
  if (div < 0.3) return 15;
  if (div < 0.6) return 12;
  if (div < 1.0) return 8;
  if (div < 1.5) return 4;
  return 0;
}
function scoreFiiPVP(pvp) {
  if (pvp == null || pvp <= 0) return 0;
  if (pvp < 0.80) return 35;
  if (pvp < 0.90) return 28;
  if (pvp < 1.00) return 20;
  if (pvp < 1.05) return 12;
  if (pvp < 1.10) return 6;
  return 0;
}
function scoreFiiDY(dy) {
  if (dy == null) return 0;
  const d = dy * 100;
  if (d >= 14) return 35;
  if (d >= 12) return 28;
  if (d >= 10) return 20;
  if (d >= 8)  return 12;
  if (d >= 6)  return 6;
  return 0;
}
function scoreFiiLiq(liq) {
  if (liq == null) return 0;
  if (liq >= 2000000) return 15;
  if (liq >= 1000000) return 12;
  if (liq >= 500000)  return 8;
  if (liq >= 200000)  return 4;
  return 0;
}
function scoreFiiFFO(ffo, dy) {
  if (ffo == null || dy == null) return 7;
  const ratio = ffo / dy;
  if (ratio >= 1.0) return 15;
  if (ratio >= 0.9) return 10;
  if (ratio >= 0.7) return 5;
  return 0;
}

// ===== State Card HTML =====
function stateCardHtml(type, msg = '') {
  if (type === 'loading') return `
    <div class="state-card">
      <div class="spinner"></div>
      <h3>${msg || 'Carregando dados...'}</h3>
      <p>Buscando dados do Fundamentus. Pode levar alguns segundos.</p>
    </div>`;
  if (type === 'error') return `
    <div class="state-card">
      <span class="icon">⚠️</span>
      <h3>Erro ao carregar dados</h3>
      <p>${msg || 'Tente novamente em alguns instantes.'}</p>
      <button class="btn btn-primary" style="margin-top:16px" onclick="loadAcoes(true);loadFiis(true)">
        Tentar novamente
      </button>
    </div>`;
  return `
    <div class="state-card">
      <span class="icon">📊</span>
      <h3>Sem dados</h3>
      <p>${msg || 'Nenhum ativo encontrado.'}</p>
    </div>`;
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // Sub-tabs
  document.querySelectorAll('.sub-tab').forEach(t => {
    t.addEventListener('click', () => switchSubTab(t.dataset.sub));
  });

  // Refresh button
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    if (state.activeSubTab === 'acoes') loadAcoes(true);
    else loadFiis(true);
  });

  // Search ações
  document.getElementById('search-acoes')?.addEventListener('input', e => {
    state.acoesFiler.search = e.target.value;
    renderAcoes();
  });

  // Filter rec ações
  document.getElementById('filter-rec-acoes')?.addEventListener('change', e => {
    state.acoesFiler.rec = e.target.value;
    renderAcoes();
  });

  // Search FIIs
  document.getElementById('search-fiis')?.addEventListener('input', e => {
    state.fiisFiler.search = e.target.value;
    renderFiis();
  });

  // Filter rec FIIs
  document.getElementById('filter-rec-fiis')?.addEventListener('change', e => {
    state.fiisFiler.rec = e.target.value;
    renderFiis();
  });

  // News filters
  document.querySelectorAll('.news-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.newsFilter = btn.dataset.cat;
      document.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderNews();
    });
  });

  // Modal close on overlay click
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard close modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Load inicial
  loadAcoes();
});

// Make global for onclick attributes
window.toggleSort = toggleSort;
window.showModal = showModal;
window.closeModal = closeModal;
window.loadAcoes = loadAcoes;
window.loadFiis = loadFiis;
