// Ficheiro: netlify/functions/generate-pix.js

// Função para formatar os campos do BRCode PIX (ID + Tamanho + Valor)
const formatField = (id, value) => {
  const size = String(value.length).padStart(2, '0');
  return `${id}${size}${value}`;
};

// Função principal da Netlify
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, txid } = JSON.parse(event.body);

    // Validação básica
    if (!amount || !txid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Valor e ID da transação são obrigatórios.' }) };
    }

    // Pega as informações das variáveis de ambiente
    const pixKey = process.env.PIX_KEY;
    const merchantName = process.env.PIX_MERCHANT_NAME;
    const merchantCity = process.env.PIX_MERCHANT_CITY;

    if (!pixKey || !merchantName || !merchantCity) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Variáveis de ambiente do PIX não configuradas no servidor.' }) };
    }

    // Formata o valor para o padrão PIX (ex: 123.45)
    const formattedAmount = amount.toFixed(2);

    // Monta o payload do PIX (BRCode) seguindo a especificação do Banco Central
    let payload = [
      formatField('00', '01'), // Payload Format Indicator
      formatField('26', `${formatField('00', 'br.gov.bcb.pix')}${formatField('01', pixKey)}`), // Merchant Account Information
      formatField('52', '0000'), // Merchant Category Code
      formatField('53', '986'), // Transaction Currency (BRL)
      formatField('54', formattedAmount), // Transaction Amount
      formatField('58', 'BR'), // Country Code
      formatField('59', merchantName), // Merchant Name
      formatField('60', merchantCity), // Merchant City
      formatField('62', formatField('05', txid)), // Additional Data Field (txid)
    ];

    // Adiciona o CRC16 (Checksum) no final
    payload.push('6304'); // ID do CRC16

    const payloadString = payload.join('');
    
    // Algoritmo para calcular o CRC16
    let crc = 0xFFFF;
    for (let i = 0; i < payloadString.length; i++) {
      crc ^= payloadString.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      }
    }
    const crc16 = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

    const finalPayload = `${payloadString}${crc16}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ payload: finalPayload }),
    };

  } catch (error) {
    console.error('Erro ao gerar PIX:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Não foi possível gerar o código PIX.' }) };
  }
};
