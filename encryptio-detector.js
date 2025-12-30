/**
 * ENCRYPTIO - Content Script per encryptio.it
 * Rileva quando l'utente è loggato e comunica con l'estensione
 */

// Ascolta messaggi dall'estensione
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Encryptio Detector] Messaggio ricevuto:', request.action);
    
    if (request.action === "check_login_status") {
        // Verifica se l'utente è loggato controllando elementi della pagina
        const isLoggedIn = checkLoginStatus();
        console.log('[Encryptio Detector] Login status:', isLoggedIn);
        sendResponse({ loggedIn: isLoggedIn });
    } else if (request.action === "get_auto_token") {
        // Prova a ottenere un token automaticamente
        console.log('[Encryptio Detector] Richiesta token automatico...');
        getAutoToken().then(token => {
            console.log('[Encryptio Detector] Token ottenuto con successo!');
            sendResponse({ token: token, success: !!token });
        }).catch(error => {
            console.error('[Encryptio Detector] Errore ottenimento token:', error);
            sendResponse({ token: null, success: false, error: error.message });
        });
        return true; // Indica risposta asincrona
    }
    
    return true; // Mantieni il canale aperto per risposte asincrone
});

/**
 * Verifica se l'utente è loggato su encryptio.it
 */
function checkLoginStatus() {
    // Controlla vari indicatori di login
    // 1. Presenza di elementi che appaiono solo quando loggato
    const userMenu = document.querySelector('[href*="/user/dashboard"], [href*="/user/settings"], .user-menu, .navbar-user, [href*="/user"]');
    if (userMenu) {
        console.log('Login rilevato: user menu trovato');
        return true;
    }
    
    // 2. Controlla se c'è un link di logout (indica che è loggato)
    const logoutLink = document.querySelector('[href*="/auth/logout"], .logout, [data-action="logout"], a[href*="logout"]');
    if (logoutLink) {
        console.log('Login rilevato: logout link trovato');
        return true;
    }
    
    // 3. Controlla se siamo su una pagina che richiede login (dashboard, settings, etc)
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/user/') || currentPath.startsWith('/password/') || currentPath.startsWith('/secret-note/')) {
        console.log('Login rilevato: pagina protetta accessibile');
        return true;
    }
    
    // 4. Controlla cookie di sessione (se accessibili)
    try {
        const cookies = document.cookie.split(';');
        const sessionCookie = cookies.find(c => {
            const trimmed = c.trim();
            return trimmed.startsWith('session=') || trimmed.startsWith('sessionid=');
        });
        if (sessionCookie) {
            console.log('Login rilevato: cookie di sessione trovato');
            return true;
        }
    } catch (e) {
        // Cookie non accessibili
        console.log('Cookie non accessibili:', e);
    }
    
    // 5. Prova a verificare chiamando direttamente l'API
    // (questo viene fatto in getAutoToken, ma possiamo anche qui)
    
    console.log('Login non rilevato con metodi standard');
    return false;
}

/**
 * Ottiene automaticamente un token API chiamando l'endpoint
 */
async function getAutoToken() {
    try {
        console.log('Tentativo di ottenere token automatico...');
        const response = await fetch('https://www.encryptio.it/password/api/v1/token/auto', {
            method: 'POST',
            credentials: 'include', // Invia i cookie di sessione
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Risposta API token/auto:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Errore API:', response.status, errorText);
            
            if (response.status === 401) {
                throw new Error('Non sei loggato su encryptio.it. Ricarica la pagina e riprova.');
            }
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        }
        
        const data = await response.json();
        console.log('Dati ricevuti:', data.ok ? 'OK' : 'ERRORE', data);
        
        if (data.ok && data.token) {
            console.log('Token ottenuto con successo!');
            return data.token;
        }
        
        throw new Error(data.message || 'Token non ricevuto');
    } catch (error) {
        console.error('Error getting auto token:', error);
        throw error;
    }
}

