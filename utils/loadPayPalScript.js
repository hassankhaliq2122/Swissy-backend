// small helper to dynamically load PayPal JS SDK
export function loadPayPalScript(clientId) {
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);

    const existing = document.getElementById('paypal-sdk');
    if (existing) {
      existing.onload = () => resolve(window.paypal);
      existing.onerror = reject;
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    script.async = true;
    script.onload = () => resolve(window.paypal);
    script.onerror = (e) => reject(e);
    document.body.appendChild(script);
  });
}
