/**
 * ENCRYPTIO - Content Script per encryptio.it
 * Rileva quando l'utente è loggato e comunica con l'estensione
 */

// Ascolta messaggi dall'estensione
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "check_login_status") {
        // Verifica se l'utente è loggato controllando elementi della pagina
        const isLoggedIn = checkLoginStatus();
        sendResponse({ loggedIn: isLoggedIn });
    } else if (request.action === "get_auto_token") {
        // Prova a ottenere un token automaticamente
        getAutoToken().then(token => {
            sendResponse({ token: token, success: !!token });
        }).catch(error => {
            sendResponse({ token: null, success: false, error: error.message });
        });
        return true; // Indica risposta asincrona
    }
});

/**
 * Verifica se l'utente è loggato su encryptio.it
 */
function checkLoginStatus() {
    // Controlla vari indicatori di login
    // 1. Presenza di elementi che appaiono solo quando loggato
    const userMenu = document.querySelector('[href*="/user/dashboard"], [href*="/user/settings"], .user-menu, .navbar-user');
    if (userMenu) {
        return true;
    }
    
    // 2. Controlla se c'è un link di logout (indica che è loggato)
    const logoutLink = document.querySelector('[href*="/auth/logout"], .logout, [data-action="logout"]');
    if (logoutLink) {
        return true;
    }
    
    // 3. Controlla cookie di sessione (se accessibili)
    try {
        const cookies = document.cookie.split(';');
        const sessionCookie = cookies.find(c => c.trim().startsWith('session='));
        if (sessionCookie) {
            return true;
        }
    } catch (e) {
        // Cookie non accessibili
    }
    
    return false;
}

/**
 * Ottiene automaticamente un token API chiamando l'endpoint
 */
async function getAutoToken() {
    try {
        const response = await fetch('https://www.encryptio.it/api/v1/token/auto', {
            method: 'POST',
            credentials: 'include', // Invia i cookie di sessione
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Non sei loggato su encryptio.it');
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.ok && data.token) {
            return data.token;
        }
        
        throw new Error('Token non ricevuto');
    } catch (error) {
        console.error('Error getting auto token:', error);
        throw error;
    }
}

