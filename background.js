/**
 * ENCRYPTIO - Background Service Worker
 * Gestisce la comunicazione tra content scripts e popup
 */

// Ascolta messaggi dai content scripts e dal popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_auto_token") {
        // Prova prima a chiamare direttamente l'API se il sender è su encryptio.it
        if (sender.tab && sender.tab.url && sender.tab.url.includes('encryptio.it')) {
            // Il messaggio viene dal content script su encryptio.it, usa la risposta diretta
            return true; // Il content script risponderà direttamente
        }
        
        // Altrimenti, cerca un tab di encryptio.it aperto
        chrome.tabs.query({ url: ["https://www.encryptio.it/*", "https://encryptio.it/*"] }, (tabs) => {
            if (tabs.length > 0) {
                // Invia messaggio al tab di encryptio.it
                chrome.tabs.sendMessage(tabs[0].id, { action: "get_auto_token" }, (response) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ token: null, success: false, error: "Impossibile comunicare con encryptio.it" });
                    } else if (response) {
                        sendResponse(response);
                    } else {
                        sendResponse({ token: null, success: false, error: "Nessuna risposta" });
                    }
                });
            } else {
                // Nessun tab aperto, prova a chiamare direttamente l'API (può funzionare se i cookie sono condivisi)
                fetch('https://www.encryptio.it/api/v1/token/auto', {
                    method: 'POST',
                    credentials: 'include'
                }).then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error('Non autenticato');
                }).then(data => {
                    if (data.ok && data.token) {
                        sendResponse({ token: data.token, success: true });
                    } else {
                        sendResponse({ token: null, success: false, error: "Apri encryptio.it e effettua il login" });
                    }
                }).catch(error => {
                    sendResponse({ token: null, success: false, error: "Apri encryptio.it e effettua il login" });
                });
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
    }
});

