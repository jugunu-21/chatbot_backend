const axios = require('axios');
const redisClient = require('../utils/redisClient');

const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';
const EMBEDDINGS_CACHE_TTL = parseInt(process.env.EMBEDDINGS_CACHE_TTL) || 86400; // 24 hours

// Jina Embeddings API integration
async function generateEmbedding(text) {
  // Check cache first
  const cacheKey = `embedding:${Buffer.from(text).toString('base64').substring(0, 50)}`;
  
  try {
    const cachedEmbedding = await redisClient.get(cacheKey);
    if (cachedEmbedding) {
      return JSON.parse(cachedEmbedding);
    }
  } catch (error) {
    console.warn('Cache read error:', error.message);
  }

  try {
    const response = await axios.post(JINA_API_URL, {
      input: [text],
      model: 'jina-embeddings-v2-base-en'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.JINA_EMBEDDING_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const embedding = response.data.data[0].embedding;
    
    // Cache the result
    try {
      await redisClient.setEx(cacheKey, EMBEDDINGS_CACHE_TTL, JSON.stringify(embedding));
    } catch (error) {
      console.warn('Cache write error:', error.message);
    }

    return embedding;
  } catch (error) {
    console.error('Jina API error:', error.response?.data || error.message);
    
    // Fallback to simple hash-based embedding for demo purposes
    console.log('Using fallback embedding generation...');
    return generateFallbackEmbedding(text);
  }
}

// Fallback embedding generation (for demo/testing when API is not available)
function generateFallbackEmbedding(text) {
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(384).fill(0); // 384-dimensional vector
  
  words.forEach((word, index) => {
    for (let i = 0; i < word.length && i < embedding.length; i++) {
      embedding[i] += word.charCodeAt(i % word.length) * (1 / (index + 1));
    }
  });
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

// Convenience function for single text embedding
async function getEmbeddingForText(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }
  
  return await generateEmbedding(text.trim());
}

module.exports = {
  generateEmbedding,
  getEmbeddingForText,
  generateFallbackEmbedding
};
