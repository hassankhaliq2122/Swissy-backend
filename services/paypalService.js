/**
 * PayPal Service Layer
 * 
 * This service handles PayPal payment processing with dual account support:
 * - USA PayPal Account: For US customers (USD)
 * - Europe PayPal Account: For European customers (EUR, GBP, etc.)
 * 
 * The service automatically routes payments to the correct PayPal account
 * based on the customer's country code.
 */

const paypal = require('@paypal/checkout-server-sdk');

// ================================
// PAYPAL CLIENT CONFIGURATION
// ================================

/**
 * Get PayPal environment configuration based on mode (sandbox/live)
 * @param {string} clientId - PayPal client ID
 * @param {string} clientSecret - PayPal client secret
 * @returns {object} PayPal environment
 */
function getPayPalEnvironment(clientId, clientSecret) {
    const mode = process.env.PAYPAL_MODE || 'sandbox';

    if (mode === 'live') {
        return new paypal.core.LiveEnvironment(clientId, clientSecret);
    }
    return new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

/**
 * Create PayPal client for USA account
 * @returns {object} PayPal client
 */
function getUSAPayPalClient() {
    const clientId = process.env.PAYPAL_US_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_US_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('USA PayPal credentials not configured. Check PAYPAL_US_CLIENT_ID and PAYPAL_US_CLIENT_SECRET in .env');
    }

    const environment = getPayPalEnvironment(clientId, clientSecret);
    return new paypal.core.PayPalHttpClient(environment);
}

/**
 * Create PayPal client for Europe account
 * @returns {object} PayPal client
 */
function getEuropePayPalClient() {
    const clientId = process.env.PAYPAL_EU_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_EU_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Europe PayPal credentials not configured. Check PAYPAL_EU_CLIENT_ID and PAYPAL_EU_CLIENT_SECRET in .env');
    }

    const environment = getPayPalEnvironment(clientId, clientSecret);
    return new paypal.core.PayPalHttpClient(environment);
}

// ================================
// PAYMENT ROUTING LOGIC
// ================================

/**
 * Determine if a country code is from the USA
 * @param {string} countryCode - ISO country code (e.g., "US", "DE", "FR")
 * @returns {boolean}
 */
function isUSACountry(countryCode) {
    return countryCode === 'US';
}

/**
 * Get the appropriate PayPal client based on country
 * 
 * ROUTING LOGIC:
 * - USA (country code "US") → USA PayPal Account
 * - All other countries → Europe PayPal Account
 * 
 * @param {string} countryCode - ISO country code
 * @returns {object} Configured PayPal client
 */
function getPayPalClientForCountry(countryCode) {
    if (isUSACountry(countryCode)) {
        console.log(`🇺🇸 Using USA PayPal account for country: ${countryCode}`);
        return getUSAPayPalClient();
    }

    console.log(`🇪🇺 Using Europe PayPal account for country: ${countryCode}`);
    return getEuropePayPalClient();
}

// ================================
// PAYMENT ORDER CREATION
// ================================

/**
 * Create a PayPal order
 * 
 * @param {object} params - Order parameters
 * @param {number} params.amount - Payment amount
 * @param {string} params.currency - Currency code (USD, EUR, GBP, etc.)
 * @param {string} params.countryCode - Customer's country code
 * @param {string} params.invoiceId - Invoice ID for reference
 * @param {string} params.description - Order description
 * @returns {Promise<object>} PayPal order with id and approval URL
 */
async function createPayPalOrder({ amount, currency, countryCode, invoiceId, description }) {
    try {
        // Select the correct PayPal account based on country
        const client = getPayPalClientForCountry(countryCode);

        // Create order request
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: invoiceId,
                description: description || `Invoice ${invoiceId}`,
                amount: {
                    currency_code: currency,
                    value: amount.toFixed(2)
                }
            }],
            application_context: {
                brand_name: 'SwissEmbroPatches',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW',
                return_url: process.env.PAYPAL_RETURN_URL || 'http://localhost:5173/payment/success',
                cancel_url: process.env.PAYPAL_CANCEL_URL || 'http://localhost:5173/payment/cancel'
            }
        });

        // Execute request
        const response = await client.execute(request);

        // Extract approval URL
        const approvalUrl = response.result.links.find(link => link.rel === 'approve')?.href;

        console.log(`✅ PayPal order created: ${response.result.id}`);

        return {
            orderId: response.result.id,
            approvalUrl: approvalUrl,
            status: response.result.status
        };

    } catch (error) {
        console.error('❌ PayPal order creation failed:', error);
        throw new Error(`PayPal order creation failed: ${error.message}`);
    }
}

// ================================
// PAYMENT CAPTURE
// ================================

/**
 * Capture a PayPal payment after customer approval
 * 
 * @param {string} orderId - PayPal order ID
 * @param {string} countryCode - Customer's country code (to select correct account)
 * @returns {Promise<object>} Captured payment details
 */
async function capturePayPalOrder(orderId, countryCode) {
    try {
        // Select the correct PayPal account based on country
        const client = getPayPalClientForCountry(countryCode);

        // Create capture request
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});

        // Execute capture
        const response = await client.execute(request);

        console.log(`✅ PayPal payment captured: ${orderId}`);

        return {
            orderId: response.result.id,
            status: response.result.status,
            captureId: response.result.purchase_units[0]?.payments?.captures[0]?.id,
            amount: response.result.purchase_units[0]?.payments?.captures[0]?.amount,
            payerEmail: response.result.payer?.email_address,
            payerId: response.result.payer?.payer_id
        };

    } catch (error) {
        console.error('❌ PayPal capture failed:', error);
        throw new Error(`PayPal capture failed: ${error.message}`);
    }
}

// ================================
// EXPORTS
// ================================

module.exports = {
    createPayPalOrder,
    capturePayPalOrder,
    getPayPalClientForCountry,
    isUSACountry
};
