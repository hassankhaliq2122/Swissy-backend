// backend/paypalClient.js
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

const clientId = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_US_CLIENT_ID;
const clientSecret = process.env.PAYPAL_SECRET || process.env.PAYPAL_US_CLIENT_SECRET;

const environment = process.env.NODE_ENV === 'production'
  ? new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret)
  : new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);

const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

module.exports = client;
