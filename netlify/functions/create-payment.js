// Ficheiro: netlify/functions/create-payment.js
const fetch = require('node-fetch');
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
        const { items, orderId } = JSON.parse(event.body); // **CORREÇÃO: Recebe o ID do nosso pedido**

        if (!orderId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'ID do pedido é obrigatório.' }) };
        }

        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        const siteUrl = process.env.URL || 'http://localhost:8888'; // URL do site, fornecida pela Netlify

        const preference = {
            items: items.map(item => ({
                title: item.name,
                quantity: item.quantity,
                currency_id: 'BRL',
                unit_price: item.price,
            })),
            shipments: {
                cost: 5.00,
                mode: 'not_specified'
            },
            notification_url: `${siteUrl}/.netlify/functions/payment-webhook`,
            external_reference: orderId,
            back_urls: {
                success: `${siteUrl}/`,
                failure: `${siteUrl}/`,
                pending: `${siteUrl}/`,
            },
            auto_return: 'approved',
        };

        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(preference),
        });

        const data = await mpResponse.json();
        if (!mpResponse.ok) {
            throw new Error(JSON.stringify(data));
        }

        const preferenceId = data.id;

        // **CORREÇÃO CRÍTICA: Atualiza o nosso pedido no Firestore com o ID da preferência do Mercado Pago**
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({ preferenceId: preferenceId });

        return {
            statusCode: 200,
            body: JSON.stringify({
                init_point: data.init_point,
                preferenceId: preferenceId
            })
        };
    } catch (error) {
        console.error('Erro ao criar preferência de pagamento:', error.toString());
        return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível criar o link de pagamento.' }) };
    }
};
