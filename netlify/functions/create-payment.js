// Ficheiro: netlify/functions/create-payment.js

// Esta função é executada de forma segura nos servidores da Netlify
exports.handler = async (event) => {
  // Apenas permite pedidos do tipo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Pega nos dados do carrinho enviados pelo site
    const { items } = JSON.parse(event.body);
    
    // Pega no Access Token secreto que guardámos na Netlify
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    // Prepara os dados para enviar à API do Mercado Pago
    const preference = {
      items: items.map(item => ({
        title: item.name,
        quantity: item.quantity,
        currency_id: 'BRL', // Moeda: Real Brasileiro
        unit_price: Math.round(item.price * 100), // CORREÇÃO: Converte o preço para centavos
      })),
      // Adiciona o frete como um item separado
      shipments: {
        cost: 500, // Custo do frete em centavos (R$ 5,00)
        mode: 'not_specified',
      },
      back_urls: {
        // Links para onde o cliente será redirecionado após o pagamento
        success: 'https://coolup.netlify.app/', // O seu URL final
        failure: 'https://coolup.netlify.app/',
        pending: 'https://coolup.netlify.app/',
      },
      auto_return: 'approved',
    };

    // Faz a chamada segura para a API do Mercado Pago
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer ,
      },
      body: JSON.stringify(preference),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    // Retorna o link de pagamento para o site
    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: data.init_point }),
    };

  } catch (error) {
    console.error('Erro ao criar preferência de pagamento:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Não foi possível criar o link de pagamento.' }),
    };
  }
};
