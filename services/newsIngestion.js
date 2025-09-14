const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { generateEmbedding } = require('./embeddingService');
const { storeArticle } = require('./vectorStore');

const parser = new Parser({
  customFields: {
    item: ['description', 'content:encoded', 'media:content']
  }
});

// News sources configuration
const NEWS_SOURCES = [
  {
    name: 'BBC News',
    url: 'http://feeds.bbci.co.uk/news/rss.xml',
    type: 'rss'
  },
  {
    name: 'BBC Technology',
    url: 'http://feeds.bbci.co.uk/news/technology/rss.xml',
    type: 'rss'
  },
  {
    name: 'BBC Business',
    url: 'http://feeds.bbci.co.uk/news/business/rss.xml',
    type: 'rss'
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss'
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index/',
    type: 'rss'
  }
];

async function fetchRSSFeed(source) {
  try {
    console.log(`Fetching RSS feed from ${source.name}...`);
    const feed = await parser.parseURL(source.url);
    
    return feed.items.map(item => ({
      title: item.title || 'Untitled',
      content: extractContent(item),
      url: item.link || '',
      publishedDate: item.pubDate || new Date().toISOString(),
      source: source.name,
      guid: item.guid || item.link || `${source.name}-${Date.now()}`
    }));
  } catch (error) {
    console.error(`Error fetching RSS from ${source.name}:`, error.message);
    return [];
  }
}

function extractContent(item) {
  // Try to get content from various fields
  let content = item['content:encoded'] || 
                item.description || 
                item.content || 
                '';

  // Clean up HTML if present
  if (content.includes('<')) {
    const $ = cheerio.load(content);
    content = $.text();
  }

  // Limit content length to avoid token limits
  return content.substring(0, 1000);
}

async function ingestNewsArticles() {
  console.log('Starting news ingestion process...');
  let totalArticles = 0;
  let processedArticles = 0;

  try {
    // Fetch articles from all sources
    const allArticles = [];
    
    for (const source of NEWS_SOURCES) {
      const articles = await fetchRSSFeed(source);
      allArticles.push(...articles);
      totalArticles += articles.length;
    }

    console.log(`Fetched ${totalArticles} articles from ${NEWS_SOURCES.length} sources`);

    // Process articles in batches to avoid overwhelming APIs
    const batchSize = 5;
    for (let i = 0; i < allArticles.length; i += batchSize) {
      const batch = allArticles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (article) => {
        try {
          // Generate embedding for the article
          const combinedText = `${article.title}\n\n${article.content}`;
          const embedding = await generateEmbedding(combinedText);
          
          // Store in vector database
          await storeArticle({
            ...article,
            embedding,
            processedAt: new Date().toISOString()
          });
          
          processedArticles++;
          
          if (processedArticles % 10 === 0) {
            console.log(`Processed ${processedArticles}/${totalArticles} articles...`);
          }
        } catch (error) {
          console.error(`Error processing article "${article.title}":`, error.message);
        }
      }));

      // Small delay between batches to be respectful to APIs
      if (i + batchSize < allArticles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ News ingestion completed: ${processedArticles}/${totalArticles} articles processed`);
    
    return {
      success: true,
      count: processedArticles,
      total: totalArticles,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('News ingestion failed:', error);
    throw error;
  }
}

module.exports = {
  ingestNewsArticles,
  fetchRSSFeed
};
