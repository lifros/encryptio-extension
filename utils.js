/**
 * ENCRYPTIO - Utility Functions
 * Funzioni condivise tra i vari script dell'estensione
 */

/**
 * Valida e sanitizza input username
 * @param {string} username - Username da validare
 * @returns {object} { valid: boolean, sanitized: string, error: string }
 */
function validateUsername(username) {
    if (!username) {
        return { valid: true, sanitized: '', error: null }; // Username opzionale
    }

    // Max length 255 caratteri
    if (username.length > 255) {
        return { valid: false, sanitized: '', error: 'Username too long (max 255 characters)' };
    }

    // Rimuovi caratteri di controllo e null bytes
    const sanitized = username.replace(/[\x00-\x1F\x7F]/g, '').trim();

    // Verifica pattern SQL injection comuni
    const sqlPatterns = [
        /(\bOR\b.*=.*)|(\bAND\b.*=.*)/i,
        /(union.*select)|(select.*from)/i,
        /(drop|delete|insert|update).*table/i,
        /--|;|\/\*|\*\//
    ];

    for (const pattern of sqlPatterns) {
        if (pattern.test(sanitized)) {
            return { valid: false, sanitized: '', error: 'Invalid characters in username' };
        }
    }

    return { valid: true, sanitized, error: null };
}

/**
 * Valida e sanitizza input password
 * @param {string} password - Password da validare
 * @returns {object} { valid: boolean, sanitized: string, error: string }
 */
function validatePassword(password) {
    if (!password || password.trim() === '') {
        return { valid: false, sanitized: '', error: 'Password cannot be empty' };
    }

    // Max length 1024 caratteri (supporta passphrase lunghe)
    if (password.length > 1024) {
        return { valid: false, sanitized: '', error: 'Password too long (max 1024 characters)' };
    }

    // Rimuovi solo null bytes (password può contenere qualsiasi carattere)
    const sanitized = password.replace(/\x00/g, '');

    if (sanitized.length === 0) {
        return { valid: false, sanitized: '', error: 'Password invalid' };
    }

    return { valid: true, sanitized, error: null };
}

/**
 * Normalizza un URL per il confronto (rimuovi trailing slash, www, etc)
 * @param {string} u - URL da normalizzare
 * @returns {string} URL normalizzato
 */
function normalizeUrl(u) {
    if (!u) return '';
    try {
        const urlObj = new URL(u);
        let normalized = urlObj.protocol + '//' + urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
        if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
        return normalized.toLowerCase();
    } catch {
        return u.toLowerCase();
    }
}

/**
 * Estrae il dominio base da un URL (senza www e path)
 * @param {string} url - URL da cui estrarre il dominio
 * @returns {string} Dominio base
 */
function extractBaseDomain(url) {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

/**
 * Confronta due URL per vedere se corrispondono (gestisce sottodomini e path)
 * @param {string} url1 - Primo URL
 * @param {string} url2 - Secondo URL
 * @returns {boolean} True se gli URL corrispondono
 */
function urlsMatch(url1, url2) {
    if (!url1 || !url2) return false;
    
    const normalized1 = normalizeUrl(url1);
    const normalized2 = normalizeUrl(url2);
    
    // Match esatto
    if (normalized1 === normalized2) return true;
    
    // Estrai domini base
    const domain1 = extractBaseDomain(url1);
    const domain2 = extractBaseDomain(url2);
    
    // Se i domini corrispondono, considera un match (gestisce path diversi)
    if (domain1 === domain2) return true;
    
    // Controlla se un URL contiene l'altro (per gestire sottodomini)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
        // Verifica che non sia solo una coincidenza parziale
        const parts1 = normalized1.split('/');
        const parts2 = normalized2.split('/');
        if (parts1[0] === parts2[0] && parts1[1] === parts2[1]) {
            return true;
        }
    }
    
    return false;
}

/**
 * Pulisce le credenziali temporanee scadute dallo storage
 * @returns {Promise<void>}
 */
async function cleanupExpiredCredentials() {
    try {
        const allStorage = await chrome.storage.local.get(null);
        const autofillKeys = Object.keys(allStorage).filter(key => key.startsWith('encryptio_autofill_'));
        const now = Date.now();
        const TTL = 5 * 60 * 1000; // 5 minuti
        
        const keysToRemove = [];
        for (const key of autofillKeys) {
            const data = allStorage[key];
            if (data && data.timestamp) {
                if (now - data.timestamp > TTL) {
                    keysToRemove.push(key);
                }
            }
        }
        
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
            console.log(`[Encryptio Utils] Rimosse ${keysToRemove.length} credenziali scadute`);
        }
    } catch (error) {
        console.error('[Encryptio Utils] Errore durante pulizia credenziali:', error);
    }
}

/**
 * Aggiunge timeout a una Promise
 * @param {Promise} promise - Promise da eseguire
 * @param {number} timeoutMs - Timeout in millisecondi
 * @param {string} errorMessage - Messaggio di errore se timeout
 * @returns {Promise} Promise con timeout
 */
function withTimeout(promise, timeoutMs, errorMessage = 'Operazione timeout') {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}
