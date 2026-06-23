const CACHE_TTL = 1800; // 30 minutos

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
  { text: 'Seja a mudança que você quer ver no mundo.', author: 'Mahatma Gandhi' },
  { text: 'A persistência é o caminho do êxito.', author: 'Charlie Chaplin' },
  { text: 'Não é o mais forte que sobrevive, mas o mais adaptável.', author: 'Charles Darwin' },
  { text: 'Cada manhã trazemos um novo começo. A escolha é sua.', author: 'Oprah Winfrey' },
  { text: 'O futuro pertence àqueles que acreditam na beleza de seus sonhos.', author: 'Eleanor Roosevelt' },
  { text: 'Dados são o novo petróleo. A mineração de dados é a nova perfuração.', author: 'Clive Humby' },
  { text: 'A automação não destrói empregos — ela transforma o que os humanos fazem.', author: 'Satya Nadella' },
  { text: 'Em tecnologia, a velocidade é o ativo competitivo mais poderoso.', author: 'Marc Andreessen' },
  { text: 'Simplicidade é a sofisticação máxima.', author: 'Leonardo da Vinci' },
  { text: 'Construa algo que 100 pessoas amam, não algo que 1 milhão ache ok.', author: 'Paul Graham' },
  { text: 'O código é como o humor: quando você tem que explicar, é ruim.', author: 'Cory House' },
  { text: 'A mina mais rica do mundo é a mente humana.', author: 'Napoleon Hill' },
  { text: 'Qualidade nunca é acidente; é sempre o resultado de esforço inteligente.', author: 'John Ruskin' },
  { text: 'Trabalhe duro em silêncio. Deixe o sucesso ser seu barulho.', author: 'Frank Ocean' },
  { text: 'Investir em conhecimento paga os melhores juros.', author: 'Benjamin Franklin' },
  { text: 'O risco vem de não saber o que você está fazendo.', author: 'Warren Buffett' },
  { text: 'Compre quando houver sangue nas ruas, mesmo que o sangue seja seu.', author: 'Baron Rothschild' },
  { text: 'O tempo no mercado bate o timing do mercado.', author: 'Ken Fisher' },
];

function getQuoteOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  return QUOTES[day % QUOTES.length];
}

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi)
    || xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)
    || [];

  for (const item of itemMatches.slice(0, 8)) {
    const titleMatch = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = item.match(/<link[^>]*>(?:<!\[CDATA\[)?(https?[^<]+)(?:\]\]>)?<\/link>/i)
      || item.match(/<link[^>]*href="([^"]+)"/i);
    const descMatch = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
      || item.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
      || item.match(/<published[^>]*>([\s\S]*?)<\/published>/i)
      || item.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);

    if (!titleMatch || !linkMatch) continue;

    const title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const link = linkMatch[1].trim();
    const desc = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim().slice(0, 200)
      : '';
    const date = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : new Date().toISOString();

    if (title && link) items.push({ title, link, desc, date });
  }

  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestRadarBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseRSS(text).map(item => ({ ...item, category: feed.category, lang: feed.lang }));
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const cacheKey = new Request('https://invest-radar-cache.internal/news-v1');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const allNews = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allNews.push(...r.value);
  }

  // Ordena por data mais recente
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

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
