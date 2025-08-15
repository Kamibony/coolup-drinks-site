const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;
    const model = 'gemini-1.5-flash-latest';
    const endpoint = https://generativelanguage.googleapis.com/v1beta/models/:generateContent?key=;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) { throw new Error(API Error: ); }
    const data = await response.json();
    const textResponse = data.candidates[0].content.parts[0].text;
    return { statusCode: 200, body: JSON.stringify({ response: textResponse }) };
  } catch (error) {
    console.error('Erro na função Gemini:', error.toString());
    return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível obter a resposta da IA.' }) };
  }
};
