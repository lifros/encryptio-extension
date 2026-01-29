/**
 * ENCRYPTIO - Content Script per encryptio.it
 * Rileva quando l'utente è loggato e comunica con l'estensione
 * Intercetta i click sui link delle password nella dashboard per autofill automatico
 */

/**
 * Valida che l'URL della risposta provenga da encryptio.it
 */
function validateApiOrigin(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'encryptio.it' || hostname === 'www.encryptio.it' || hostname.endsWith('.encryptio.it');
    } catch (error) {
        console.error('[Security] URL non valido:', error);
        return false;
    }
}

/**
 * Fetch sicura che valida l'origine della risposta
 */
async function secureFetch(url, options = {}) {
    // Valida URL prima della chiamata
    if (!validateApiOrigin(url)) {
        throw new Error('Origine API non autorizzata');
    }

    const response = await fetch(url, options);

    // Valida URL della risposta (in caso di redirect)
    if (!validateApiOrigin(response.url)) {
        throw new Error('Risposta da origine non autorizzata');
    }

    return response;
}

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
        
        // Ottieni il token API con timeout
        let token;
        try {
            token = await Promise.race([
                getAutoToken(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout ottenimento token')), 10000)
                )
            ]);
        } catch (error) {
            console.error('[Encryptio Detector] Errore o timeout ottenimento token:', error);
            token = null;
        }
        
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
        
        // Recupera tutte le password dall'API con timeout
        const vaultResponse = await Promise.race([
            secureFetch('https://www.encryptio.it/password/api/v1/vault', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout recupero vault')), 15000)
            )
        ]);
        
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
        
        // Funzione per normalizzare URL (inline per questo script)
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
        
        // Normalizza l'URL target una volta per tutte (usato in più punti)
        const normalizedTargetUrl = normalizeUrl(url);
        
        // Funzione migliorata per matching URL
        const urlsMatch = (url1, url2) => {
            if (!url1 || !url2) return false;
            const n1 = normalizeUrl(url1);
            const n2 = normalizeUrl(url2);
            if (n1 === n2) return true;
            
            // Estrai domini base
            const extractDomain = (u) => {
                try {
                    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
                } catch {
                    return u.toLowerCase();
                }
            };
            
            const domain1 = extractDomain(url1);
            const domain2 = extractDomain(url2);
            
            // Se i domini corrispondono, considera un match
            if (domain1 === domain2) return true;
            
            // Controlla se un URL contiene l'altro (per gestire path diversi)
            if (n1.includes(n2) || n2.includes(n1)) {
                const parts1 = n1.split('/');
                const parts2 = n2.split('/');
                if (parts1[0] === parts2[0] && parts1[1] === parts2[1]) {
                    return true;
                }
            }
            
            return false;
        };
        
        // Trova la password corrispondente all'URL (migliorato per gestire più password)
        let matchingPassword = null;
        let exactMatch = null;
        let domainMatch = null;
        
        for (const pwd of passwords) {
            if (!pwd.url) continue;
            
            // Match esatto ha priorità
            if (!exactMatch && urlsMatch(pwd.url, url)) {
                const normalizedPwd = normalizeUrl(pwd.url);
                if (normalizedPwd === normalizedTargetUrl) {
                    exactMatch = pwd;
                } else {
                    // Match per dominio
                    domainMatch = pwd;
                }
            }
        }
        
        matchingPassword = exactMatch || domainMatch;
        
        if (!matchingPassword) {
            console.log('[Encryptio Detector] Nessuna password trovata per URL:', url);
            link.style.color = originalColor;
            link.style.opacity = '1';
            link.textContent = originalText;
            
            // Salva un marker nella nuova tab per comunicare che non ci sono password
            const noPasswordKey = `encryptio_no_password_${normalizedTargetUrl.replace(/[^a-z0-9]/g, '_').substring(0, 100)}`;
            await chrome.storage.local.set({
                [noPasswordKey]: {
                    url: url,
                    timestamp: Date.now(),
                    reason: 'no_password_found'
                }
            });
            
            chrome.runtime.sendMessage({
                action: 'show_notification',
                type: 'warning',
                title: 'Encryptio',
                message: 'Nessuna password trovata per questo sito'
            });
            
            // Apri comunque la nuova tab per mostrare il messaggio di errore
            chrome.runtime.sendMessage({
                action: 'open_tab_with_autofill',
                url: url,
                storageKey: noPasswordKey,
                passwordName: 'Nessuna password'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Encryptio Detector] Errore apertura tab:', chrome.runtime.lastError);
                    // Fallback: apri il link normalmente
                    window.open(url, '_blank');
                }
            });
            return;
        }
        
        console.log('[Encryptio Detector] Password trovata per autofill:', matchingPassword.name || matchingPassword.username);
        
        // Valida le credenziali prima di salvarle
        if (!matchingPassword.password || matchingPassword.password.trim() === '') {
            console.warn('[Encryptio Detector] Password vuota per:', matchingPassword.name);
            link.style.color = originalColor;
            link.style.opacity = '1';
            link.textContent = originalText;
            chrome.runtime.sendMessage({
                action: 'show_notification',
                type: 'warning',
                title: 'Encryptio',
                message: 'Password vuota per questo sito'
            });
            window.open(url, '_blank');
            return;
        }
        
        // Salva le credenziali nello storage temporaneo con chiave basata sull'URL
        // SECURITY: cifra i dati prima di salvarli
        const storageKey = `encryptio_autofill_${normalizedTargetUrl.replace(/[^a-z0-9]/g, '_').substring(0, 100)}`;

        // Carica crypto.js dinamicamente se non già disponibile
        if (typeof encryptTemporaryData === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('crypto.js');
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const encryptedData = await encryptTemporaryData({
            username: (matchingPassword.username || '').trim(),
            password: (matchingPassword.password || '').trim(),
            url: url,
            timestamp: Date.now(),
            passwordName: (matchingPassword.name || matchingPassword.username || 'Password').trim()
        });

        await chrome.storage.local.set({
            [storageKey]: {
                encrypted: true,
                data: encryptedData,
                timestamp: Date.now()
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
        const response = await secureFetch('https://www.encryptio.it/password/api/v1/token/auto', {
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

