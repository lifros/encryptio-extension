/**
 * ENCRYPTIO - Background Service Worker
 * Gestisce la comunicazione tra content scripts e popup
 */

// Ascolta messaggi dai content scripts e dal popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_auto_token") {
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
    }
});

