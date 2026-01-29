/**
 * ENCRYPTIO - Background Service Worker
 * Gestisce la comunicazione tra content scripts e popup
 */

// Session management
let lastActivityTimestamp = Date.now();
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minuti

/**
 * Aggiorna timestamp ultima attività
 */
function updateActivity() {
    lastActivityTimestamp = Date.now();
}

/**
 * Verifica se la sessione è scaduta
 */
function isSessionExpired() {
    return Date.now() - lastActivityTimestamp > SESSION_TIMEOUT;
}

/**
 * Invalida sessione e pulisci dati sensibili
 */
async function invalidateSession() {
    console.log('[Background] Sessione scaduta, pulizia dati sensibili');

    try {
        // Log audit event
        if (typeof logAuditEvent === 'function') {
            await logAuditEvent('session_expired', { reason: 'inactivity_timeout' });
        }

        // Rimuovi token e credenziali temporanee
        const allStorage = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allStorage).filter(key =>
            key.startsWith('encryptio_autofill_') ||
            key.startsWith('encryptio_no_password_') ||
            key === 'auth_token'
        );

        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
            console.log(`[Background] Rimossi ${keysToRemove.length} elementi per scadenza sessione`);
        }

        // Notifica l'utente
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Encryptio - Session Expired',
            message: 'Your session has expired due to inactivity. Please login again.',
            priority: 1
        });
    } catch (error) {
        console.error('[Background] Errore durante invalidazione sessione:', error);
    }
}

// Controlla scadenza sessione ogni minuto
setInterval(() => {
    if (isSessionExpired()) {
        invalidateSession();
        // Reset timestamp per evitare multiple notifiche
        lastActivityTimestamp = Date.now();
    }
}, 60 * 1000);

// Pulizia periodica delle credenziali scadute dallo storage
async function cleanupExpiredCredentials() {
    try {
        const allStorage = await chrome.storage.local.get(null);
        const autofillKeys = Object.keys(allStorage).filter(key => 
            key.startsWith('encryptio_autofill_') || key.startsWith('encryptio_no_password_')
        );
        const now = Date.now();
        const TTL = 5 * 60 * 1000; // 5 minuti
        
        const keysToRemove = [];
        for (const key of autofillKeys) {
            const data = allStorage[key];
            if (data && data.timestamp) {
                if (now - data.timestamp > TTL) {
                    keysToRemove.push(key);
                }
            } else if (data && !data.timestamp) {
                // Credenziali senza timestamp, rimuovile per sicurezza
                keysToRemove.push(key);
            }
        }
        
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
            console.log(`[Background] Rimosse ${keysToRemove.length} credenziali/marker scaduti`);
        }
    } catch (error) {
        console.error('[Background] Errore durante pulizia credenziali:', error);
    }
}

// Esegui pulizia all'avvio e ogni 5 minuti
cleanupExpiredCredentials();
setInterval(cleanupExpiredCredentials, 5 * 60 * 1000);

// Importa crypto.js per funzioni di encryption
importScripts('crypto.js');

/**
 * Inietta content script dinamicamente quando richiesto
 */
async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['utils.js', 'crypto.js', 'content.js']
        });
        console.log('[Background] Content script iniettato in tab:', tabId);
        return true;
    } catch (error) {
        console.error('[Background] Errore iniezione content script:', error);
        return false;
    }
}

/**
 * Verifica se content script è già caricato in una tab
 */
async function isContentScriptLoaded(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return response && response.pong;
    } catch (error) {
        return false;
    }
}

// Ascolta messaggi dai content scripts e dal popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Aggiorna attività ad ogni messaggio
    updateActivity();

    if (request.action === "fetch_api") {
        // Proxy per fetch API che bypassa CORS (solo background worker può farlo)
        console.log('[Background] Proxy fetch API:', request.url);

        fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            credentials: request.credentials || 'include',
            body: request.body ? JSON.stringify(request.body) : undefined
        })
        .then(async response => {
            const responseData = {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                url: response.url,
                headers: {}
            };

            // Copia headers rilevanti
            response.headers.forEach((value, key) => {
                responseData.headers[key] = value;
            });

            // Leggi body come text
            const text = await response.text();

            // Prova a parsare come JSON
            try {
                responseData.data = JSON.parse(text);
            } catch {
                responseData.data = text;
            }

            sendResponse(responseData);
        })
        .catch(error => {
            console.error('[Background] Errore fetch API:', error);
            sendResponse({
                ok: false,
                status: 0,
                statusText: error.message,
                error: error.message
            });
        });

        return true; // Risposta asincrona
    } else if (request.action === "encrypt_credentials") {
        // Cripta credenziali per storage temporaneo
        console.log('[Background] Richiesta encryption credenziali');

        encryptTemporaryData(request.data)
            .then(encryptedData => {
                sendResponse({ success: true, encrypted: encryptedData });
            })
            .catch(error => {
                console.error('[Background] Errore encryption:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Risposta asincrona
    } else if (request.action === "get_auto_token") {
        console.log('[Background] Richiesta token automatico ricevuta');
        
        // Prova prima a chiamare direttamente l'API se il sender è su encryptio.it
        if (sender.tab && sender.tab.url && sender.tab.url.includes('encryptio.it')) {
            console.log('[Background] Messaggio da tab encryptio.it, inoltro al content script');
            // Il messaggio viene dal content script su encryptio.it, usa la risposta diretta
            return true; // Il content script risponderà direttamente
        }
        
        // Cerca un tab di encryptio.it aperto
        chrome.tabs.query({ url: ["https://www.encryptio.it/*", "https://encryptio.it/*"] }, (tabs) => {
            console.log('[Background] Tab encryptio.it trovati:', tabs.length);
            
            if (tabs.length > 0) {
                // Invia messaggio al tab di encryptio.it
                chrome.tabs.sendMessage(tabs[0].id, { action: "get_auto_token" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Background] Errore comunicazione con content script:', chrome.runtime.lastError);
                        sendResponse({ token: null, success: false, error: "Impossibile comunicare con encryptio.it. Ricarica la pagina encryptio.it e riprova." });
                    } else if (response) {
                        console.log('[Background] Risposta dal content script:', response.success ? 'OK' : 'ERRORE');
                        sendResponse(response);
                    } else {
                        console.error('[Background] Nessuna risposta dal content script');
                        sendResponse({ token: null, success: false, error: "Nessuna risposta da encryptio.it" });
                    }
                });
            } else {
                console.log('[Background] Nessun tab encryptio.it aperto');
                sendResponse({ token: null, success: false, error: "Apri encryptio.it in una scheda e assicurati di essere loggato, poi riprova." });
            }
        });
        return true; // Risposta asincrona
    } else if (request.action === "check_login") {
        // Verifica se l'utente è loggato su encryptio.it
        chrome.tabs.query({ url: ["https://www.encryptio.it/*", "https://encryptio.it/*"] }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "check_login_status" }, (response) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ loggedIn: false });
                    } else {
                        sendResponse(response || { loggedIn: false });
                    }
                });
            } else {
                sendResponse({ loggedIn: false });
            }
        });
        return true;
    } else if (request.action === "open_tab_with_autofill") {
        // Apri una nuova tab e prepara l'autofill
        console.log('[Background] Apertura tab con autofill per:', request.url);
        chrome.tabs.create({ url: request.url }, async (tab) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Errore apertura tab:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log('[Background] Tab aperta con ID:', tab.id);

                // Aspetta che la tab sia caricata prima di iniettare lo script
                chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);

                        // Inietta il content script
                        const injected = await injectContentScript(tab.id);
                        if (!injected) {
                            console.warn('[Background] Impossibile iniettare content script');
                        }
                    }
                });

                sendResponse({ success: true, tabId: tab.id });
            }
        });
        return true; // Risposta asincrona
    } else if (request.action === "show_notification") {
        // Mostra una notifica del browser
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: request.title || 'Encryptio',
            message: request.message || '',
            priority: request.type === 'error' ? 2 : (request.type === 'warning' ? 1 : 0)
        }, (notificationId) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Errore creazione notifica:', chrome.runtime.lastError);
            } else {
                console.log('[Background] Notifica creata:', notificationId);
                // Rimuovi la notifica dopo 5 secondi
                setTimeout(() => {
                    chrome.notifications.clear(notificationId);
                }, 5000);
            }
        });
        sendResponse({ success: true });
    }
});

