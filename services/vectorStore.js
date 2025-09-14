const redisClient = require('../utils/redisClient');

// Simple in-memory vector store (for demo purposes)
// In production, use Qdrant, Chroma, or Pinecone
let vectorStore = [];

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// Store an article with its embedding
async function storeArticle(article) {
  try {
    // Add to in-memory store
    vectorStore.push({
      id: article.guid || `article_${Date.now()}_${Math.random()}`,
      title: article.title,
      content: article.content,
      url: article.url,
      source: article.source,
      publishedDate: article.publishedDate,
      embedding: article.embedding,
      processedAt: article.processedAt
    });

    // Also store in Redis for persistence (optional)
    const articleKey = `article:${article.guid}`;
    await redisClient.setEx(articleKey, 86400 * 7, JSON.stringify(article)); // 7 days TTL

    // Update store metadata
    await updateStoreMetadata();

    return true;
  } catch (error) {
    console.error('Error storing article:', error);
    throw error;
  }
}

// Search for similar articles
async function searchSimilarArticles(queryEmbedding, limit = 5, threshold = 0.3) {
  try {
    if (vectorStore.length === 0) {
      console.log('Vector store is empty, loading from Redis...');
      await loadStoreFromRedis();
    }

    const results = vectorStore
      .map(article => ({
        ...article,
        similarity: cosineSimilarity(queryEmbedding, article.embedding)
      }))
      .filter(article => article.similarity > threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`Found ${results.length} similar articles with similarity > ${threshold}`);
    
    return results;
  } catch (error) {
    console.error('Error searching similar articles:', error);
    return [];
  }
}

// Load vector store from Redis (for persistence across restarts)
async function loadStoreFromRedis() {
  try {
    const keys = await redisClient.keys('article:*');
    console.log(`Loading ${keys.length} articles from Redis...`);

    for (const key of keys) {
      const articleData = await redisClient.get(key);
      if (articleData) {
        const article = JSON.parse(articleData);
        if (article.embedding) {
          vectorStore.push(article);
        }
      }
    }

    console.log(`Loaded ${vectorStore.length} articles into vector store`);
  } catch (error) {
    console.error('Error loading store from Redis:', error);
  }
}

// Update store metadata
async function updateStoreMetadata() {
  const metadata = {
    totalArticles: vectorStore.length,
    lastUpdated: new Date().toISOString(),
    sources: [...new Set(vectorStore.map(article => article.source))]
  };

  await redisClient.setEx('vectorstore:metadata', 3600, JSON.stringify(metadata));
}

// Get vector store statistics
async function getVectorStoreStats() {
  try {
    const metadataStr = await redisClient.get('vectorstore:metadata');
    const metadata = metadataStr ? JSON.parse(metadataStr) : null;

    const stats = {
      articlesInMemory: vectorStore.length,
      articlesInRedis: (await redisClient.keys('article:*')).length,
      sources: metadata?.sources || [],
      lastUpdated: metadata?.lastUpdated || null,
      memoryUsageMB: Math.round(JSON.stringify(vectorStore).length / (1024 * 1024) * 100) / 100
    };

    return stats;
  } catch (error) {
    console.error('Error getting vector store stats:', error);
    return { error: 'Failed to retrieve stats' };
  }
}

// Clear vector store
async function clearVectorStore() {
  vectorStore = [];
  const keys = await redisClient.keys('article:*');
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
  await redisClient.del('vectorstore:metadata');
  console.log('Vector store cleared');
}

module.exports = {
  storeArticle,
  searchSimilarArticles,
  loadStoreFromRedis,
  getVectorStoreStats,
  clearVectorStore,
  cosineSimilarity
};
