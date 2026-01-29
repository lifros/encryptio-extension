/**
 * ENCRYPTIO - Crypto Module
 * Gestisce la crittografia/decrittazione AES-256-GCM locale
 */

// Genera una chiave di sessione casuale per cifrare i dati temporanei
let sessionKey = null;

/**
 * Ottiene o genera la chiave di sessione (in-memory, persa al riavvio estensione)
 */
async function getSessionKey() {
    if (!sessionKey) {
        sessionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // Non estraibile
            ['encrypt', 'decrypt']
        );
    }
    return sessionKey;
}

/**
 * Genera HMAC-SHA256 per verificare integrità
 */
async function generateHMAC(data, key) {
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        hmacKey,
        encoder.encode(data)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verifica HMAC-SHA256
 */
async function verifyHMAC(data, hmac, key) {
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const signature = Uint8Array.from(atob(hmac), c => c.charCodeAt(0));

    return await crypto.subtle.verify(
        'HMAC',
        hmacKey,
        signature,
        encoder.encode(data)
    );
}

/**
 * Cifra dati sensibili prima di salvarli nello storage temporaneo
 * SECURITY: Include HMAC per verificare integrità
 */
async function encryptTemporaryData(data) {
    try {
        const key = await getSessionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const dataString = JSON.stringify(data);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(dataString)
        );

        // Combina iv + encrypted
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        const encryptedBase64 = btoa(String.fromCharCode(...combined));

        // Genera HMAC per verificare integrità
        const hmacKey = 'encryptio-integrity-key-v1'; // Chiave statica per HMAC
        const hmac = await generateHMAC(encryptedBase64, hmacKey);

        // Restituisce encrypted + hmac separati da ':'
        return `${encryptedBase64}:${hmac}`;
    } catch (error) {
        console.error('[Crypto] Errore cifratura temporanea:', error);
        throw error;
    }
}

/**
 * Decifra dati sensibili dallo storage temporaneo
 * SECURITY: Verifica HMAC prima di decifrare
 */
async function decryptTemporaryData(encryptedData) {
    try {
        // Separa encrypted da HMAC
        let encryptedBase64, hmac;
        if (encryptedData.includes(':')) {
            const parts = encryptedData.split(':');
            encryptedBase64 = parts[0];
            hmac = parts[1];
        } else {
            // Legacy format senza HMAC (retrocompatibilità)
            encryptedBase64 = encryptedData;
            hmac = null;
        }

        // Verifica integrità se presente HMAC
        if (hmac) {
            const hmacKey = 'encryptio-integrity-key-v1';
            const isValid = await verifyHMAC(encryptedBase64, hmac, hmacKey);
            if (!isValid) {
                throw new Error('Data integrity verification failed - possible tampering detected');
            }
        }

        const key = await getSessionKey();
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
        console.error('[Crypto] Errore decifratura temporanea:', error);
        throw error;
    }
}

/**
 * Deriva una chiave da una password usando PBKDF2
 */
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt', 'encrypt']
    );
}

/**
 * Decrittografa una password usando AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data (format: salt:iv:encrypted)
 * @param {string} masterPassword - Master password per derivare la chiave
 * @returns {Promise<string>} Decrypted password
 */
async function decryptPassword(encryptedData, masterPassword) {
    try {
        // Parse encrypted data format: salt:iv:encrypted
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
        const encrypted = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));

        // Derive key from master password
        const key = await deriveKey(masterPassword, salt);

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt password');
    }
}

/**
 * Ottiene la master password dallo storage di sessione
 * SECURITY: Usa chrome.storage.session invece di local (cleared on browser close)
 */
async function getMasterPassword() {
    return new Promise((resolve, reject) => {
        // Prima prova session storage (più sicuro)
        chrome.storage.session.get(['master_key'], (result) => {
            if (result.master_key) {
                resolve(result.master_key);
                return;
            }

            // Fallback su local storage solo se session vuoto
            chrome.storage.local.get(['master_key'], (localResult) => {
                if (localResult.master_key) {
                    // Migra a session storage
                    chrome.storage.session.set({ master_key: localResult.master_key });
                    resolve(localResult.master_key);
                } else {
                    reject(new Error('Master key not configured. Please configure master key in settings.'));
                }
            });
        });
    });
}

/**
 * Salva master password in session storage (più sicuro)
 */
async function setMasterPassword(masterKey) {
    return new Promise((resolve, reject) => {
        if (!masterKey || masterKey.length < 8) {
            reject(new Error('Master key must be at least 8 characters'));
            return;
        }

        chrome.storage.session.set({ master_key: masterKey }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

// Export per ES6 modules (background.js)
export {
    encryptTemporaryData,
    decryptTemporaryData,
    encryptPassword,
    decryptPassword,
    getMasterPassword,
    setMasterPassword
};
