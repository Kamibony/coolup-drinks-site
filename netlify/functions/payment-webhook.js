// Ficheiro: netlify/functions/payment-webhook.js
const fetch = require('node-fetch');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Configura��o do Firebase Admin (requer uma chave de servi�o)
// Voc� precisar� de criar esta chave no seu projeto Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const notification = JSON.parse(event.body);

    // Verifica se � uma notifica��o de pagamento
    if (notification.type === 'payment') {
      const paymentId = notification.data.id;
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

      // Pede ao Mercado Pago os detalhes completos do pagamento
      const paymentResponse = await fetch(https://api.mercadopago.com/v1/payments/, {
        headers: { 'Authorization': Bearer  }
      });
      const paymentData = await paymentResponse.json();

      // Encontra o pedido na base de dados pelo ID da prefer�ncia
      const orderQuery = await db.collection('orders').where('preferenceId', '==', paymentData.order.id).get();

      if (!orderQuery.empty) {
        const orderDoc = orderQuery.docs[0];
        // Atualiza o estado do pedido para 'pago' se o pagamento foi aprovado
        if (paymentData.status === 'approved') {
          await orderDoc.ref.update({ status: 'pago' });
          console.log(Pedido  atualizado para PAGO.);
        }
      }
    }

    // Responde ao Mercado Pago para confirmar que a notifica��o foi recebida
    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error('Erro no webhook:', error.toString());
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao processar a notifica��o.' }) };
  }
};
