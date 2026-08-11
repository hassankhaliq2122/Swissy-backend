/**
 * Country Mapping Utility
 * 
 * Maps country names to ISO country codes for PayPal routing
 */

const COUNTRIES = [
    { name: "Austria", code: "AT" },
    { name: "Belgium", code: "BE" },
    { name: "Bulgaria", code: "BG" },
    { name: "Croatia", code: "HR" },
    { name: "Cyprus", code: "CY" },
    { name: "Czech Republic", code: "CZ" },
    { name: "Denmark", code: "DK" },
    { name: "Estonia", code: "EE" },
    { name: "Finland", code: "FI" },
    { name: "France", code: "FR" },
    { name: "Germany", code: "DE" },
    { name: "Greece", code: "GR" },
    { name: "Hungary", code: "HU" },
    { name: "Ireland", code: "IE" },
    { name: "Italy", code: "IT" },
    { name: "Latvia", code: "LV" },
    { name: "Lithuania", code: "LT" },
    { name: "Luxembourg", code: "LU" },
    { name: "Malta", code: "MT" },
    { name: "Netherlands", code: "NL" },
    { name: "Poland", code: "PL" },
    { name: "Portugal", code: "PT" },
    { name: "Romania", code: "RO" },
    { name: "Slovakia", code: "SK" },
    { name: "Slovenia", code: "SI" },
    { name: "Spain", code: "ES" },
    { name: "Sweden", code: "SE" },
    { name: "United Kingdom", code: "GB" },
    { name: "Norway", code: "NO" },
    { name: "Switzerland", code: "CH" },
    { name: "Iceland", code: "IS" },
    { name: "USA", code: "US" },
    { name: "United States", code: "US" }
];

/**
 * Get ISO country code from country name
 * @param {string} countryName - Full country name (e.g., "Germany", "USA")
 * @returns {string} ISO country code (e.g., "DE", "US")
 */
function getCountryCode(countryName) {
    if (!countryName) return 'US';

    // If it's already a 2-letter ISO country code
    if (countryName.trim().length === 2) {
        return countryName.trim().toUpperCase();
    }

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

    // Try to find in COUNTRIES array by name or code
    const country = COUNTRIES.find(c => c.name.toLowerCase() === countryName.toLowerCase() || c.code.toLowerCase() === countryName.toLowerCase());
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
