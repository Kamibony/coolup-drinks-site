// Ficheiro: netlify/functions/get-gemini-response.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("A variável de ambiente GEMINI_API_KEY não foi encontrada.");
    }

    const model = 'gemini-1.5-flash-latest';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    // Se a resposta da API não for OK, capture o erro detalhado
    if (!response.ok) {
      console.error('Erro da API Gemini:', data);
      const errorMessage = data.error?.message || 'Ocorreu um erro desconhecido na API do Gemini.';
      // Retorna um status de erro com a mensagem específica
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `Erro na API Gemini: ${errorMessage}` }) 
      };
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    return { 
      statusCode: 200, 
      body: JSON.stringify({ response: textResponse }) 
    };

  } catch (error) {
    console.error('Erro na função Gemini:', error.toString());
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: `Erro interno na função: ${error.message}` }) 
    };
  }
};
