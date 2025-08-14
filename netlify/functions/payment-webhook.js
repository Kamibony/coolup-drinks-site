const fetch = require('node-fetch');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (!global._firebaseApp) { const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY); global._firebaseApp = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore();
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') { return { statusCode: 405, body: 'Method Not Allowed' }; }
  try {
    const notification = JSON.parse(event.body);
    if (notification.type === 'payment' && notification.data && notification.data.id) {
      const paymentId = notification.data.id; const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      const paymentResponse = await fetch(https://api.mercadopago.com/v1/payments/, { headers: { 'Authorization': Bearer  } });
      if (!paymentResponse.ok) { throw new Error(Falha ao obter detalhes do pagamento: ); }
      const paymentData = await paymentResponse.json();
      const orderId = paymentData.external_reference;
      if (orderId) { const orderRef = db.collection('orders').doc(orderId); if (paymentData.status === 'approved') { await orderRef.update({ status: 'pago' }); console.log(Pedido  atualizado para PAGO.); } else { console.log(Estado do pagamento para o pedido : ); } }
      else { console.warn('external_reference não encontrada nos dados do pagamento.'); }
    }
    return { statusCode: 200, body: 'OK' };
  } catch (error) { console.error('Erro no webhook:', error.toString()); return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao processar a notificação.' }) }; }
};
