const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

async function generateAnswer(question, relevantArticles) {
  // Prepare context from relevant articles
  const context = relevantArticles
    .map((article, index) => 
      `[Source ${index + 1}: ${article.source}]\nTitle: ${article.title}\nContent: ${article.content}\n`
    )
    .join('\n---\n');

  const prompt = `Based on the following news articles, please answer the user's question. Be accurate, informative, and cite which sources you're using.

Context from recent news articles:
${context}

User Question: ${question}

Instructions:
1. Provide a comprehensive answer based only on the provided articles
2. If the articles don't contain enough information, mention this limitation
3. Cite specific sources when making claims
4. Keep the response conversational but informative
5. If multiple articles discuss the same topic, synthesize the information

Answer:`;

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data.candidates && response.data.candidates.length > 0) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('No response generated');
    }

  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    
    // Fallback response generation
    return generateFallbackAnswer(question, relevantArticles);
  }
}

// Fallback answer generation when Gemini API is not available
function generateFallbackAnswer(question, relevantArticles) {
  if (relevantArticles.length === 0) {
    return "I don't have enough information in my current news database to answer your question. Please try asking about different topics or check back later for updated news coverage.";
  }

  const sources = relevantArticles.map(article => article.source).join(', ');
  const mainTopics = relevantArticles.map(article => article.title).join('; ');

  let answer = `Based on recent news from ${sources}, here's what I found about your question:\n\n`;
  
  relevantArticles.slice(0, 3).forEach((article, index) => {
    answer += `${index + 1}. **${article.title}** (${article.source})\n`;
    answer += `${article.content.substring(0, 200)}...\n\n`;
  });

  answer += `This information is based on ${relevantArticles.length} relevant news article${relevantArticles.length > 1 ? 's' : ''} from my database.`;

  return answer;
}

module.exports = {
  generateAnswer,
  generateFallbackAnswer
};

