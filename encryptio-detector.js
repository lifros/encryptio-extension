/**
 * ENCRYPTIO - Content Script per encryptio.it
 * Rileva quando l'utente è loggato e comunica con l'estensione
 * Intercetta i click sui link delle password nella dashboard per autofill automatico
 */

// Intercetta i click sui link delle password nella dashboard
document.addEventListener('click', async (e) => {
    // Verifica se il click è su un link URL di una password nella dashboard
    const link = e.target.closest('a[href^="http"]');
    if (!link) return;
    
    // Verifica se siamo nella dashboard
    if (!window.location.pathname.includes('/user/dashboard')) return;
    
    // Verifica se il link è dentro un password-item
    const passwordItem = link.closest('.password-item');
    if (!passwordItem) return;
    
    // Verifica se il link ha target="_blank" (link esterno)
    if (link.target !== '_blank') return;
    
    // Verifica che l'URL non sia un link interno di encryptio.it
    const url = link.href;
    if (url.includes('encryptio.it')) return;
    
    console.log('[Encryptio Detector] Link password cliccato:', url);
    
    // Previeni il comportamento di default
    e.preventDefault();
    e.stopPropagation();
    
    // Mostra feedback visivo sul link (cambia colore o aggiungi indicatore)
    const originalText = link.textContent;
    const originalColor = link.style.color;
    link.style.color = '#007bff';
    link.style.opacity = '0.7';
    link.textContent = '⏳ Caricamento...';
    
    try {
        // Notifica inizio elaborazione
        chrome.runtime.sendMessage({
            action: 'show_notification',
            type: 'info',
            title: 'Encryptio',
            message: 'Ricerca credenziali in corso...'
        });
        
        // Ottieni il token API
        const token = await getAutoToken();
        if (!token) {
            console.error('[Encryptio Detector] Impossibile ottenere token API');
            link.style.color = originalColor;
            link.style.opacity = '1';
            link.textContent = originalText;
            chrome.runtime.sendMessage({
                action: 'show_notification',
                type: 'error',
                title: 'Encryptio',
                message: 'Errore: impossibile ottenere token API'
            });
            // Fallback: apri il link normalmente
            window.open(url, '_blank');
            return;
        }
        
        // Recupera tutte le password dall'API
        const vaultResponse = await fetch('https://www.encryptio.it/password/api/v1/vault', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        if (!vaultResponse.ok) {
            console.error('[Encryptio Detector] Errore nel recupero del vault:', vaultResponse.status);
            link.style.color = originalColor;
            link.style.opacity = '1';
            link.textContent = originalText;
            chrome.runtime.sendMessage({
                action: 'show_notification',
                type: 'error',
                title: 'Encryptio',
                message: 'Errore nel recupero del vault'
            });
            // Fallback: apri il link normalmente
            window.open(url, '_blank');
            return;
        }
        
        const passwords = await vaultResponse.json();
        console.log('[Encryptio Detector] Vault recuperato,', passwords.length, 'password trovate');
        
        // Normalizza l'URL per il confronto (rimuovi trailing slash, www, etc)
        const normalizeUrl = (u) => {
            if (!u) return '';
            try {
                const urlObj = new URL(u);
                let normalized = urlObj.protocol + '//' + urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
                if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
                return normalized.toLowerCase();
            } catch {
                return u.toLowerCase();
            }
        };
        
        const normalizedTargetUrl = normalizeUrl(url);
        
        // Trova la password corrispondente all'URL
        let matchingPassword = null;
        for (const pwd of passwords) {
            if (pwd.url) {
                const normalizedPwdUrl = normalizeUrl(pwd.url);
                if (normalizedPwdUrl === normalizedTargetUrl || 
                    normalizedPwdUrl.includes(normalizedTargetUrl) ||
                    normalizedTargetUrl.includes(normalizedPwdUrl)) {
                    matchingPassword = pwd;
                    break;
                }
            }
        }
        
        if (!matchingPassword) {
            console.log('[Encryptio Detector] Nessuna password trovata per URL:', url);
            link.style.color = originalColor;
            link.style.opacity = '1';
            link.textContent = originalText;
            chrome.runtime.sendMessage({
                action: 'show_notification',
                type: 'warning',
                title: 'Encryptio',
                message: 'Nessuna password trovata per questo sito'
            });
            // Fallback: apri il link normalmente
            window.open(url, '_blank');
            return;
        }
        
        console.log('[Encryptio Detector] Password trovata per autofill:', matchingPassword.name || matchingPassword.username);
        
        // Salva le credenziali nello storage temporaneo con chiave basata sull'URL
        const storageKey = `encryptio_autofill_${normalizedTargetUrl.replace(/[^a-z0-9]/g, '_')}`;
        await chrome.storage.local.set({
            [storageKey]: {
                username: matchingPassword.username || '',
                password: matchingPassword.password || '',
                url: url,
                timestamp: Date.now(),
                passwordName: matchingPassword.name || matchingPassword.username || 'Password'
            }
        });
        
        console.log('[Encryptio Detector] Credenziali salvate nello storage:', storageKey);
        
        // Ripristina il link
        link.style.color = originalColor;
        link.style.opacity = '1';
        link.textContent = originalText;
        
        // Apri la nuova tab
        chrome.runtime.sendMessage({
            action: 'open_tab_with_autofill',
            url: url,
            storageKey: storageKey,
            passwordName: matchingPassword.name || matchingPassword.username || 'Password'
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Encryptio Detector] Errore apertura tab:', chrome.runtime.lastError);
                chrome.runtime.sendMessage({
                    action: 'show_notification',
                    type: 'error',
                    title: 'Encryptio',
                    message: 'Errore nell\'apertura della nuova tab'
                });
                // Fallback: apri il link normalmente
                window.open(url, '_blank');
            }
        });
        
    } catch (error) {
        console.error('[Encryptio Detector] Errore durante autofill automatico:', error);
        link.style.color = originalColor;
        link.style.opacity = '1';
        link.textContent = originalText;
        chrome.runtime.sendMessage({
            action: 'show_notification',
            type: 'error',
            title: 'Encryptio',
            message: 'Errore durante l\'elaborazione: ' + error.message
        });
        // Fallback: apri il link normalmente
        window.open(url, '_blank');
    }
}, true); // Usa capture phase per intercettare prima

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

