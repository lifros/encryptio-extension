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
    } else if (request.action === "open_tab_with_autofill") {
        // Apri una nuova tab e prepara l'autofill
        console.log('[Background] Apertura tab con autofill per:', request.url);
        chrome.tabs.create({ url: request.url }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Errore apertura tab:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log('[Background] Tab aperta con ID:', tab.id);
                // Il content script nella nuova tab leggerà le credenziali dallo storage
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

