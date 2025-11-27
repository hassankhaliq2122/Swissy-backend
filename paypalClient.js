// backend/paypalClient.js
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

const clientId = process.env.PAYPAL_CLIENT_ID || 'AYfcaXSqzdjrE6iXssROI4RcxC6IfTWuOKGXL_afsJ6dPH-VryHkUOkls3GuX8ecauGTT7gnceaTi4lJ';
const clientSecret = process.env.PAYPAL_SECRET || 'EHaCr4tjaLNZemQhRmrmh4zYW3YkyOBK9IaRXG33lqx8qE5UB3epuJxXSkSEk6tQLyzgBjtcbelqqbmI';

const environment = process.env.NODE_ENV === 'production'
  ? new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret)
  : new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);

const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

module.exports = client;
