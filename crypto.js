/**
 * ENCRYPTIO - Crypto Module
 * Gestisce la crittografia/decrittazione AES-256-GCM locale
 */

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
 * Ottiene la master password dallo storage locale
 * In produzione, questa dovrebbe essere derivata da un token o chiave utente
 */
async function getMasterPassword() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['master_key'], (result) => {
            // Se non esiste, usa il token come fallback (da migliorare in produzione)
            if (result.master_key) {
                resolve(result.master_key);
            } else {
                // Fallback: usa il token se disponibile
                chrome.storage.local.get(['auth_token'], (tokenResult) => {
                    resolve(tokenResult.auth_token || '');
                });
            }
        });
    });
}

