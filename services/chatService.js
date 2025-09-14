const { v4: uuidv4 } = require('uuid');
const { getEmbeddingForText } = require('./embeddingService');
const { searchSimilarArticles } = require('./vectorStore');
const { generateAnswer } = require('./geminiService');
const redisClient = require('../utils/redisClient');

const CHAT_HISTORY_TTL = parseInt(process.env.CHAT_HISTORY_TTL) || 3600; // 1 hour

async function processUserMessage(sessionId, message) {
  try {
    // Save user message to session
    await saveMessageToSession(sessionId, {
      text: message,
      sender: 'user',
      timestamp: new Date().toISOString()
    });

    // Step 1: Generate embedding for user query
    const queryEmbedding = await getEmbeddingForText(message);

    // Step 2: Search vector store for relevant articles
    const relevantArticles = await searchSimilarArticles(queryEmbedding, 5);

    if (relevantArticles.length === 0) {
      const noResultsMessage = `I don't have specific information about "${message}" in my current news database. 

My database currently contains 27 articles from BBC News, but none are closely related to your query. 

To get better results, try asking about:
• Recent political developments
• International news and conflicts  
• UK and global current events
• Breaking news stories

You can also try rephrasing your question or asking about broader topics that might be covered in general news.`;
      
      await saveMessageToSession(sessionId, {
        text: noResultsMessage,
        sender: 'bot',
        timestamp: new Date().toISOString()
      });

      return {
        message: noResultsMessage,
        sources: [],
        relevance: 'low'
      };
    }

    // Step 3: Generate answer using Gemini API
    const answer = await generateAnswer(message, relevantArticles);

    // Save bot response
    await saveMessageToSession(sessionId, {
      text: answer,
      sender: 'bot',
      timestamp: new Date().toISOString(),
      sources: relevantArticles.map(article => article.title)
    });

    return {
      message: answer,
      sources: relevantArticles.map(article => ({
        title: article.title,
        url: article.url || null,
        relevanceScore: article.similarity || 0
      })),
      relevance: 'high'
    };

  } catch (error) {
    console.error('Error processing user message:', error);
    
    // Save error message
    const errorMessage = "I encountered an error while processing your request. Please try again.";
    await saveMessageToSession(sessionId, {
      text: errorMessage,
      sender: 'bot',
      timestamp: new Date().toISOString(),
      isError: true
    });

    throw error;
  }
}

async function getChatHistory(sessionId) {
  try {
    const historyData = await redisClient.get(`chat:${sessionId}`);
    if (!historyData) {
      return [];
    }
    return JSON.parse(historyData);
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
}

async function saveMessageToSession(sessionId, message) {
  try {
    const history = await getChatHistory(sessionId);
    
    const messageWithId = {
      id: message.id || uuidv4(),
      ...message
    };

    history.push(messageWithId);

    // Keep only last 50 messages to prevent memory issues
    const trimmedHistory = history.slice(-50);

    await redisClient.setEx(
      `chat:${sessionId}`, 
      CHAT_HISTORY_TTL, 
      JSON.stringify(trimmedHistory)
    );

    return messageWithId;
  } catch (error) {
    console.error('Error saving message to session:', error);
    throw error;
  }
}

async function clearSessionHistory(sessionId) {
  try {
    await redisClient.del(`chat:${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error clearing session history:', error);
    throw error;
  }
}

module.exports = {
  processUserMessage,
  getChatHistory,
  saveMessageToSession,
  clearSessionHistory
};

