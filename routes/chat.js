
const express = require('express');
const router = express.Router();
const {
  processUserMessage,
  getChatHistory,
  clearSessionHistory
} = require('../services/chatService');
const { ingestNewsArticles } = require('../services/newsIngestion');

// Main chat endpoint
router.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  // Validation
  if (!sessionId || !message) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['sessionId', 'message']
    });
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message must be a non-empty string' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
  }

  try {
    const result = await processUserMessage(sessionId, message.trim());
    res.json(result);
  } catch (error) {
    console.error('Chat processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      message: 'Please try again later'
    });
  }
});

// Get chat history for a session
router.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const history = await getChatHistory(sessionId);
    res.json({ 
      sessionId,
      messages: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Clear session chat history
router.delete('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    await clearSessionHistory(sessionId);
    res.json({ 
      message: 'Session history cleared successfully',
      sessionId
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    res.status(500).json({ error: 'Failed to clear session history' });
  }
});

// Manual news ingestion endpoint (for testing/admin)
router.post('/ingest-news', async (req, res) => {
  try {
    const result = await ingestNewsArticles();
    res.json({
      message: 'News ingestion completed',
      articlesProcessed: result.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('News ingestion error:', error);
    res.status(500).json({ error: 'Failed to ingest news articles' });
  }
});

// Get vector store statistics
router.get('/stats', async (req, res) => {
  try {
    const { getVectorStoreStats } = require('../services/vectorStore');
    const stats = await getVectorStoreStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
