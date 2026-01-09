/**
 * Country Mapping Utility
 * 
 * Maps country names to ISO country codes for PayPal routing
 */

const COUNTRIES = require('../../../swissy-admin/src/utils/currencyHelper').COUNTRIES;

/**
 * Get ISO country code from country name
 * @param {string} countryName - Full country name (e.g., "Germany", "USA")
 * @returns {string} ISO country code (e.g., "DE", "US")
 */
function getCountryCode(countryName) {
    if (!countryName) return 'US';

    // Direct mapping for common variations
    const directMappings = {
        'USA': 'US',
        'United States': 'US',
        'United States of America': 'US',
        'UK': 'GB',
        'United Kingdom': 'GB',
        'England': 'GB'
    };

    if (directMappings[countryName]) {
        return directMappings[countryName];
    }

    // Try to find in COUNTRIES array
    const country = COUNTRIES.find(c => c.name === countryName);
    return country ? country.code : 'US';
}

/**
 * Check if country uses US PayPal account
 * @param {string} countryName - Country name
 * @returns {boolean}
 */
function isUSACountry(countryName) {
    const code = getCountryCode(countryName);
    return code === 'US';
}

module.exports = {
    getCountryCode,
    isUSACountry
};
