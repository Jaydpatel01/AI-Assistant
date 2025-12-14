/**
 * PII (Personally Identifiable Information) Masking Utility
 * Redacts sensitive data before sending to external APIs
 */

// Regex patterns for common PII
const PII_PATTERNS = {
    // Email addresses
    email: {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL]'
    },

    // Phone numbers (various formats)
    phone: {
        pattern: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
        replacement: '[PHONE]'
    },

    // Indian phone numbers
    phoneIN: {
        pattern: /(\+91[-.\s]?)?\d{10}/g,
        replacement: '[PHONE]'
    },

    // Social Security Numbers (US)
    ssn: {
        pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
        replacement: '[SSN]'
    },

    // Credit card numbers (basic pattern)
    creditCard: {
        pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
        replacement: '[CARD]'
    },

    // IP addresses
    ipAddress: {
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        replacement: '[IP]'
    },

    // Aadhaar numbers (India)
    aadhaar: {
        pattern: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,
        replacement: '[AADHAAR]'
    },

    // PAN numbers (India)
    pan: {
        pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/gi,
        replacement: '[PAN]'
    },

    // Passport numbers (generic)
    passport: {
        pattern: /\b[A-Z]{1,2}\d{6,9}\b/gi,
        replacement: '[PASSPORT]'
    },

    // Bank account numbers (generic - 9-18 digits)
    bankAccount: {
        pattern: /\b\d{9,18}\b/g,
        replacement: '[ACCOUNT]'
    },

    // URLs with potential auth tokens
    authUrl: {
        pattern: /https?:\/\/[^\s]*(?:token|key|auth|password|secret)[^\s]*/gi,
        replacement: '[AUTH_URL]'
    },

    // API keys (common patterns)
    apiKey: {
        pattern: /\b(?:sk-|pk-|api[_-]?key[_-]?)[a-zA-Z0-9]{20,}/gi,
        replacement: '[API_KEY]'
    }
};

/**
 * Mask PII in text
 * @param {string} text - Text to mask
 * @param {Object} options - Optional settings
 * @returns {Object} - { masked: string, found: string[] }
 */
function maskPII(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return { masked: text || '', found: [] };
    }

    const found = [];
    let masked = text;

    // Apply each pattern
    for (const [type, config] of Object.entries(PII_PATTERNS)) {
        const matches = masked.match(config.pattern);
        if (matches) {
            found.push(`${type}: ${matches.length} instance(s)`);
            masked = masked.replace(config.pattern, config.replacement);
        }
    }

    return { masked, found };
}

/**
 * Check if text contains potential PII
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function containsPII(text) {
    if (!text) return false;

    for (const config of Object.values(PII_PATTERNS)) {
        if (config.pattern.test(text)) {
            // Reset regex lastIndex
            config.pattern.lastIndex = 0;
            return true;
        }
        config.pattern.lastIndex = 0;
    }

    return false;
}

/**
 * Get summary of PII found
 * @param {string} text - Text to analyze
 * @returns {string[]} - List of PII types found
 */
function getPIISummary(text) {
    const { found } = maskPII(text);
    return found;
}

module.exports = {
    maskPII,
    containsPII,
    getPIISummary,
    PII_PATTERNS
};
