// Ficheiro: netlify/functions/payment-webhook.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// **ATENÇÃO: As suas credenciais do Firebase Admin devem estar numa variável de ambiente!**
// Nome da variável: FIREBASE_SERVICE_ACCOUNT_KEY
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Inicializa o Firebase Admin apenas uma vez
if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const notification = JSON.parse(event.body);
        console.log("Notificação recebida:", notification);

        // Verifica se é uma notificação de pagamento (Mercado Pago pode enviar outros tipos)
        if (notification.type === 'payment' && notification.data && notification.data.id) {
            const paymentId = notification.data.id;
            const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

            // Pede ao Mercado Pago os detalhes completos do pagamento
            const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!paymentResponse.ok) {
                console.error("Erro ao buscar dados do pagamento no Mercado Pago:", paymentResponse.statusText);
                return { statusCode: 500, body: 'Erro ao buscar dados do pagamento' };
            }

            const paymentData = await paymentResponse.json();
            const preferenceId = paymentData.order?.id; // O ID da preferência está no campo order.id

            if (!preferenceId) {
                console.warn("Notificação de pagamento sem ID de preferência (order.id).", paymentData);
                return { statusCode: 200, body: 'OK - Sem preferenceId' };
            }

            // Encontra o pedido na base de dados pelo ID da preferência
            const orderQuery = await db.collection('orders').where('preferenceId', '==', preferenceId).limit(1).get();

            if (!orderQuery.empty) {
                const orderDoc = orderQuery.docs[0];
                // Atualiza o estado do pedido para 'pago' se o pagamento foi aprovado
                if (paymentData.status === 'approved' && orderDoc.data().status !== 'pago') {
                    await orderDoc.ref.update({ status: 'pago' });
                    console.log(`Pedido ${orderDoc.id} atualizado para PAGO.`);
                } else {
                     console.log(`Status do pagamento não é 'approved' ou pedido já estava pago. Status: ${paymentData.status}`);
                }
            } else {
                console.warn(`Nenhum pedido encontrado com preferenceId: ${preferenceId}`);
            }
        } else {
            console.log("Recebida notificação que não é de pagamento:", notification.type);
        }

        // Responde ao Mercado Pago para confirmar que a notificação foi recebida
        return { statusCode: 200, body: 'OK' };

    } catch (error) {
        console.error('Erro no webhook:', error.toString());
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao processar a notificação.' }) };
    }
};
