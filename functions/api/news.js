const CACHE_TTL = 1800;

const FEEDS = [
  { url: 'https://g1.globo.com/rss/g1/tecnologia/', category: 'tech', lang: 'pt' },
  { url: 'https://canaltech.com.br/rss/', category: 'tech', lang: 'pt' },
  { url: 'https://rss.tecmundo.com.br/feed', category: 'tech', lang: 'pt' },
  { url: 'https://www.mining.com/feed/', category: 'mining', lang: 'en' },
  { url: 'https://feeds.feedburner.com/TechCrunch', category: 'tech', lang: 'en' },
  { url: 'https://www.theverge.com/rss/index.xml', category: 'tech', lang: 'en' },
  { url: 'https://www.infomoney.com.br/feed/', category: 'finance', lang: 'pt' },
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
  { text: 'Construa algo que 100 pessoas amam, não algo que 1 milhão ache ok.', author: 'Paul Graham' },
  { text: 'Investir em conhecimento paga os melhores juros.', author: 'Benjamin Franklin' },
  { text: 'O risco vem de não saber o que você está fazendo.', author: 'Warren Buffett' },
  { text: 'O tempo no mercado bate o timing do mercado.', author: 'Ken Fisher' },
  { text: 'Qualidade nunca é acidente; é sempre o resultado de esforço inteligente.', author: 'John Ruskin' },
  { text: 'Trabalhe duro em silêncio. Deixe o sucesso ser seu barulho.', author: 'Frank Ocean' },
];

function getQuoteOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  return QUOTES[day % QUOTES.length];
}

function parseRSS(xml) {
  const items = [];
  const blocks = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi)
    || xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)
    || [];

  for (const block of blocks.slice(0, 8)) {
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch  = block.match(/<link[^>]*>(?:<!\[CDATA\[)?(https?[^<\s]+)(?:\]\]>)?<\/link>/i)
      || block.match(/<link[^>]*href="([^"]+)"/i);
    const descMatch  = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
      || block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const dateMatch  = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
      || block.match(/<published[^>]*>([\s\S]*?)<\/published>/i);

    if (!titleMatch || !linkMatch) continue;

    const title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const link  = linkMatch[1].trim();
    const desc  = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim().slice(0, 200)
      : '';
    const date  = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : new Date().toISOString();

    if (title && link) items.push({ title, link, desc, date });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestRadarBot/1.0; +https://invest-radar.pages.dev)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const text = await res.text();
    return parseRSS(text).map(item => ({ ...item, category: feed.category, lang: feed.lang }));
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  try {
    // Cache
    let cached = null;
    try {
      const cacheKey = new Request('https://invest-radar-cache.internal/news-v2');
      const cache = caches.default;
      cached = await cache.match(cacheKey);
      if (cached) {
        const body = await cached.text();
        if (body && body.length > 10) {
          return new Response(body, {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }
    } catch { /* ignora erros de cache */ }

    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const allNews = [];
    for (const r of results) {
      if (r.status === 'fulfilled') allNews.push(...r.value);
    }
    allNews.sort((a, b) => new Date(b.date) - new Date(a.date));

    const body = JSON.stringify({
      success: true,
      news: allNews.slice(0, 40),
      quote: getQuoteOfTheDay(),
      updatedAt: new Date().toISOString(),
    });

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });

    try {
      const cacheKey = new Request('https://invest-radar-cache.internal/news-v2');
      context.waitUntil(caches.default.put(cacheKey, response.clone()));
    } catch { /* ignora */ }

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg, news: [], quote: getQuoteOfTheDay() }), {
      status: 200, // retorna 200 mesmo com erro parcial para mostrar quote
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
