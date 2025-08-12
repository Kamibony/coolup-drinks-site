// Ficheiro: netlify/functions/create-payment.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { items } = JSON.parse(event.body);
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const preference = {
      items: items.map(item => ({
        title: item.name,
        quantity: item.quantity,
        currency_id: 'BRL',
        // CORREÇÃO FINAL: O Mercado Pago espera o valor em Reais, não em centavos.
        unit_price: item.price,
      })),
      shipments: { 
        // CORREÇÃO FINAL: O custo do frete também deve ser em Reais.
        cost: 5.00, 
        mode: 'not_specified' 
      },
      back_urls: {
        success: 'https://coolup.netlify.app/',
        failure: 'https://coolup.netlify.app/',
        pending: 'https://coolup.netlify.app/',
      },
      auto_return: 'approved',
    };
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });
    const data = await response.json();
    if (!response.ok) { throw new Error(JSON.stringify(data)); }
    return { statusCode: 200, body: JSON.stringify({ init_point: data.init_point }) };
  } catch (error) {
    console.error('Erro ao criar preferência de pagamento:', error.toString());
    return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível criar o link de pagamento.' }) };
  }
};
