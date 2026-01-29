/**
 * ENCRYPTIO - popup.js
 * Logica per la gestione dell'interfaccia dell'estensione
 */

let currentDomain = '';
let vaultData = [];

document.addEventListener('DOMContentLoaded', async function() {
    
    // 1. RILEVAMENTO SITO ATTIVO (prima di tutto)
    await detectCurrentDomain();

    // 2. VERIFICA E OTTIENI TOKEN AUTOMATICAMENTE
    await ensureAuthToken();

    // 3. INIZIALIZZAZIONE: Carica i dati dal Vault
    await loadVaultFromFlask();

    // 3. GESTIONE TAB
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.getAttribute('data-target');
            updateMainContent(target);
        });
    });

    // 4. LOGICA DI RICERCA DINAMICA (case-insensitive)
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterVaultItems(query);
        });
    }
    
    // 5. Listener globale per pulsanti di retry (delegazione eventi)
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('retry-button')) {
            e.preventDefault();
            location.reload();
        }
    });
    
    // 6. Gestione errori immagini (fallback per favicon)
    document.addEventListener('error', (e) => {
        if (e.target && e.target.classList.contains('vault-favicon') && e.target.tagName === 'IMG') {
            const fallback = e.target.getAttribute('data-fallback');
            if (fallback && e.target.src !== fallback) {
                e.target.src = fallback;
            }
        }
    }, true); // Usa capture phase per intercettare prima
});

/**
 * Rileva il dominio della pagina attiva
 */
async function detectCurrentDomain() {
    return new Promise((resolve) => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].url) {
                try {
                    let url = new URL(tabs[0].url);
                    currentDomain = url.hostname.replace('www.', '').toLowerCase();
                    console.log("Encryptio attivo su:", currentDomain);
                } catch (e) {
                    currentDomain = '';
                }
            }
            resolve();
        });
    });
}

/**
 * Funzione per inviare le credenziali al content script nella pagina web
 */
async function sendToContentScript(username, password) {
    const content = document.getElementById('content');

    // Mostra feedback di caricamento
    showNotification('Inserimento credenziali...', 'info');

    return new Promise((resolve) => {
        chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
            if (!tabs[0]) {
                showNotification('Nessuna scheda attiva', 'error');
                resolve(false);
                return;
            }

            const tabId = tabs[0].id;

            // Verifica se content script è caricato
            let scriptLoaded = false;
            try {
                const pingResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                scriptLoaded = pingResponse && pingResponse.pong;
            } catch (error) {
                scriptLoaded = false;
            }

            // Se non è caricato, iniettalo
            if (!scriptLoaded) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['utils.js', 'crypto.js', 'content.js']
                    });
                    // Attendi un po' per assicurarsi che sia inizializzato
                    await new Promise(r => setTimeout(r, 100));
                } catch (error) {
                    showNotification('Errore: impossibile iniettare script nella pagina', 'error');
                    console.error("Errore iniezione script:", error);
                    resolve(false);
                    return;
                }
            }

            // Ora invia il messaggio
            chrome.tabs.sendMessage(tabId, {
                action: "fill_credentials",
                username: username,
                password: password
            }, function(response) {
                if (chrome.runtime.lastError) {
                    showNotification('Errore: pagina non supportata', 'error');
                    console.error("Errore di connessione:", chrome.runtime.lastError);
                    resolve(false);
                } else if (response && response.status === "success") {
                    showNotification('Credenziali inserite con successo!', 'success');
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                    resolve(true);
                } else {
                    showNotification('Campi login non trovati', 'error');
                    resolve(false);
                }
            });
        });
    });
}

/**
 * Mostra una notifica all'utente
 */
function showNotification(message, type = 'info') {
    const content = document.getElementById('content');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 15px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 1000;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        color: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

/**
 * Aggiorna il contenuto principale in base al Tab selezionato
 */
function updateMainContent(target) {
    const content = document.getElementById('content');
    
    if (target === 'generator') {
        content.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #666; margin-bottom: 15px;">Generatore Password Sicura</p>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h2 id="gen-pass" style="word-break: break-all; color: #007bff; font-size: 18px; margin: 0;">********</h2>
                </div>
                <button class="fill-btn" id="btn-generate" style="width: 100%; margin-bottom: 10px;">Genera Nuova</button>
                <button class="fill-btn" id="btn-copy" style="width: 100%; background: #6c757d;">Copia</button>
            </div>
        `;
        document.getElementById('btn-generate').addEventListener('click', generateRandomPassword);
        document.getElementById('btn-copy').addEventListener('click', copyGeneratedPassword);
    } else if (target === 'vault') {
        // Ricarica la lista dal Vault
        loadVaultFromFlask();
    } else if (target === 'tools') {
        content.innerHTML = `
            <div style="padding: 20px;">
                <h3 style="color: #333; margin-bottom: 15px;">Strumenti di Sicurezza</h3>
                <div style="color: #666; line-height: 1.6;">
                    <p>• Analisi password deboli</p>
                    <p>• Verifica password compromesse</p>
                    <p>• Export/Import vault</p>
                    <p style="margin-top: 20px; color: #888; font-size: 12px;">Funzionalità in arrivo...</p>
                </div>
            </div>
        `;
    }
}

// Rate limiting per API calls
const apiRateLimiter = {
    requests: new Map(), // Map<endpoint, Array<timestamp>>
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minuto
    lockoutMs: 5 * 60 * 1000, // 5 minuti lockout
    lockedEndpoints: new Map(), // Map<endpoint, lockoutUntil>

    isLocked(endpoint) {
        const lockoutUntil = this.lockedEndpoints.get(endpoint);
        if (lockoutUntil && Date.now() < lockoutUntil) {
            return true;
        }
        if (lockoutUntil) {
            this.lockedEndpoints.delete(endpoint);
        }
        return false;
    },

    canMakeRequest(endpoint) {
        if (this.isLocked(endpoint)) {
            const lockoutUntil = this.lockedEndpoints.get(endpoint);
            const remainingMs = lockoutUntil - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            throw new Error(`Too many requests. Please wait ${remainingMin} minute(s) before trying again.`);
        }

        const now = Date.now();
        const requests = this.requests.get(endpoint) || [];

        // Rimuovi richieste fuori dalla finestra temporale
        const recentRequests = requests.filter(timestamp => now - timestamp < this.windowMs);

        if (recentRequests.length >= this.maxRequests) {
            // Troppo richieste, lockout
            this.lockedEndpoints.set(endpoint, now + this.lockoutMs);
            throw new Error(`Rate limit exceeded. Locked for ${this.lockoutMs / 60000} minutes.`);
        }

        // Aggiungi nuova richiesta
        recentRequests.push(now);
        this.requests.set(endpoint, recentRequests);

        return true;
    }
};

// Certificate pinning per encryptio.it
// SHA-256 hash del certificato pubblico (esempio - da aggiornare con cert reale)
const ENCRYPTIO_CERT_PINS = [
    // Main certificate (to be updated with actual cert)
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    // Backup certificate
    'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
];

/**
 * Valida che l'URL della risposta provenga da encryptio.it
 */
function validateApiOrigin(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'encryptio.it' || hostname === 'www.encryptio.it' || hostname.endsWith('.encryptio.it');
    } catch (error) {
        console.error('[Security] Invalid URL:', error);
        return false;
    }
}

/**
 * Verifica certificate pinning (limitato in estensioni browser)
 * NOTA: Manifest V3 non supporta intercettazione certificati
 * Questa è una validazione a livello applicazione come fallback
 */
function validateCertificate(response) {
    // Certificate pinning non è fully supportato in browser extensions
    // Ma possiamo fare alcune verifiche a livello applicazione

    // Verifica che la connessione sia HTTPS
    if (!response.url.startsWith('https://')) {
        console.error('[Security] Non-HTTPS connection detected');
        return false;
    }

    // In produzione, implementare validazione aggiuntiva tramite backend
    // o usando Content Security Policy report-uri
    return true;
}

/**
 * Fetch sicura che valida l'origine della risposta + rate limiting
 */
async function secureFetch(url, options = {}) {
    // Valida URL prima della chiamata
    if (!validateApiOrigin(url)) {
        throw new Error('Origine API non autorizzata');
    }

    // Estrai endpoint per rate limiting (rimuovi query params)
    const urlObj = new URL(url);
    const endpoint = urlObj.pathname;

    // Verifica rate limit
    try {
        apiRateLimiter.canMakeRequest(endpoint);
    } catch (error) {
        console.error('[Security] Rate limit exceeded:', endpoint);
        throw error;
    }

    const response = await fetch(url, options);

    // Valida URL della risposta (in caso di redirect)
    if (!validateApiOrigin(response.url)) {
        throw new Error('Response from unauthorized origin');
    }

    // Valida certificato HTTPS
    if (!validateCertificate(response)) {
        throw new Error('Certificate validation failed');
    }

    return response;
}

/**
 * Copia la password generata negli appunti con auto-clear dopo 30 secondi
 */
let clipboardClearTimer = null;

function copyGeneratedPassword() {
    const passElement = document.getElementById('gen-pass');
    if (passElement && passElement.textContent !== '********') {
        const password = passElement.textContent;

        navigator.clipboard.writeText(password).then(() => {
            showNotification('Password copied! Will auto-clear in 30s', 'success');

            // Cancella timer precedente se esiste
            if (clipboardClearTimer) {
                clearTimeout(clipboardClearTimer);
            }

            // Auto-clear clipboard dopo 30 secondi
            clipboardClearTimer = setTimeout(async () => {
                try {
                    // Verifica se la clipboard contiene ancora la nostra password
                    const currentClipboard = await navigator.clipboard.readText();
                    if (currentClipboard === password) {
                        // Sovrascrivi con stringa vuota
                        await navigator.clipboard.writeText('');
                        console.log('[Encryptio] Clipboard auto-cleared');

                        // Notifica solo se popup ancora aperto
                        try {
                            showNotification('Clipboard cleared for security', 'info');
                        } catch (e) {
                            // Popup chiuso, ignora
                        }
                    }
                } catch (error) {
                    // Permessi clipboard potrebbero essere revocati, ignora
                    console.log('[Encryptio] Cannot clear clipboard:', error.message);
                }
            }, 30000);
        }).catch(() => {
            showNotification('Error copying to clipboard', 'error');
        });
    }
}

/**
 * Filtra gli elementi del vault durante la ricerca (case-insensitive)
 */
function filterVaultItems(query) {
    const items = document.querySelectorAll('.vault-item');
    let visibleCount = 0;
    
    items.forEach(item => {
        const name = item.querySelector('.name')?.textContent.toLowerCase() || '';
        const user = item.querySelector('.user')?.textContent.toLowerCase() || '';
        const matches = !query || name.includes(query) || user.includes(query);
        
        item.style.display = matches ? 'flex' : 'none';
        if (matches) visibleCount++;
    });
    
    // Mostra messaggio se nessun risultato
    const content = document.getElementById('content');
    let noResults = content.querySelector('.no-results');
    if (visibleCount === 0 && query) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.style.cssText = 'padding: 20px; color: #888; text-align: center;';
            noResults.textContent = 'Nessun risultato trovato';
            content.appendChild(noResults);
        }
    } else if (noResults) {
        noResults.remove();
    }
}

/**
 * Funzione per caricare e renderizzare i dati dal backend Flask
 */
async function loadVaultFromFlask() {
    const content = document.getElementById('content');
    
    // Mostra uno stato di caricamento
    content.innerHTML = `<div style="padding: 20px; color: #888; text-align: center;">Caricamento vault...</div>`;

    try {
        const token = await getSavedToken();
        
        if (!token) {
            // Prova ancora una volta a ottenere il token automaticamente
            content.innerHTML = `<div style="padding: 20px; color: #888; text-align: center;">Verifica autenticazione...</div>`;
            
            try {
                const autoToken = await getAutoToken();
                if (autoToken) {
                    await chrome.storage.local.set({ auth_token: autoToken });
                    token = autoToken;
                    // Ricarica i dati
                    return await loadVaultFromFlask();
                }
            } catch (error) {
                console.error('Errore ottenimento token:', error);
                // Mostra messaggio più dettagliato
                const errorMsg = error.message || 'Effettua il login su encryptio.it per continuare.';
                content.innerHTML = `
                    <div style="padding: 20px; text-align: center;">
                        <p style="color: #dc3545; margin-bottom: 10px; font-weight: 600;">Autenticazione richiesta</p>
                        <p style="color: #666; font-size: 12px; margin-bottom: 10px;">${errorMsg}</p>
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 15px 0; text-align: left;">
                            <p style="color: #333; font-size: 11px; font-weight: 600; margin-bottom: 8px;">Per risolvere:</p>
                            <ol style="color: #666; font-size: 11px; margin: 0; padding-left: 20px; line-height: 1.6;">
                                <li>Apri <a href="https://www.encryptio.it" target="_blank" style="color: #007bff;">encryptio.it</a> in una nuova scheda</li>
                                <li>Assicurati di essere loggato</li>
                                <li>Riprova aprendo questa estensione</li>
                            </ol>
                        </div>
                        <a href="https://www.encryptio.it/auth/login" target="_blank" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-size: 12px;">Vai al Login</a>
                        <button class="retry-button" style="display: block; margin: 10px auto 0; padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">Riprova</button>
                    </div>
                `;
                // Aggiungi event listener per il pulsante
                setTimeout(() => {
                    const retryBtn = content.querySelector('.retry-button');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => location.reload());
                    }
                }, 100);
                return;
            }
            
            // Se arriviamo qui, non abbiamo ottenuto il token
            content.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p style="color: #dc3545; margin-bottom: 10px;">Autenticazione richiesta</p>
                    <p style="color: #666; font-size: 12px; margin-bottom: 15px;">Effettua il login su encryptio.it per continuare.</p>
                    <a href="https://www.encryptio.it/auth/login" target="_blank" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-size: 12px;">Vai al Login</a>
                    <button class="retry-button" style="display: block; margin: 10px auto 0; padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">Riprova</button>
                </div>
            `;
            // Aggiungi event listener per il pulsante
            setTimeout(() => {
                const retryBtn = content.querySelector('.retry-button');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => location.reload());
                }
            }, 100);
            return;
        }

        console.log('Chiamata API vault');
        
        // Aggiungi timeout alla chiamata API
        const response = await Promise.race([
            secureFetch('https://www.encryptio.it/password/api/v1/vault', {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout connessione API')), 15000)
            )
        ]);

        console.log('Risposta API vault:', response.status, response.statusText);

        if (!response.ok) {
            // SECURITY: Generic error messages for user, detailed only in console
            console.error('[API Error]', response.status, response.statusText);

            if (response.status === 401) {
                // Token non valido o scaduto
                await chrome.storage.local.remove(['auth_token']);
                content.innerHTML = `
                    <div style="padding: 20px; text-align: center;">
                        <p style="color: #dc3545; margin-bottom: 10px;">Authentication required</p>
                        <p style="color: #666; font-size: 12px; margin-bottom: 15px;">Please login to encryptio.it</p>
                        <a href="https://www.encryptio.it/user/settings" target="_blank" style="color: #007bff; text-decoration: underline; font-size: 12px;">Go to settings</a>
                    </div>
                `;
            } else if (response.status === 429) {
                throw new Error('Too many requests. Please wait a moment.');
            } else if (response.status >= 500) {
                throw new Error('Server error. Please try again later.');
            } else {
                throw new Error('Request failed. Please check your connection.');
            }
            return;
        }

        const data = await response.json();
        console.log('Dati vault ricevuti:', Array.isArray(data) ? `${data.length} elementi` : 'Non è un array', data);
        vaultData = Array.isArray(data) ? data : [];
        
        // Renderizza gli elementi ricevuti
        renderVaultItems(vaultData);
    } catch (error) {
        // SECURITY: Log detailed error only in console
        console.error('[Vault Error]', error);

        // Generic user-facing error message
        let userMessage = 'Connection error';
        if (error.message.includes('timeout')) {
            userMessage = 'Request timeout. Please try again.';
        } else if (error.message.includes('unauthorized')) {
            userMessage = 'Authentication failed';
        } else if (error.message.includes('Rate limit')) {
            userMessage = error.message; // Rate limit messages are safe to show
        }

        content.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #dc3545; margin-bottom: 10px;">Error</p>
                <p style="color: #666; font-size: 12px; margin-bottom: 10px;">${userMessage}</p>
                <button class="fill-btn retry-button" style="margin-top: 10px;">Retry</button>
            </div>
        `;
        // Aggiungi event listener per il pulsante
        setTimeout(() => {
            const retryBtn = content.querySelector('.retry-button');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => location.reload());
            }
        }, 100);
    }
}

/**
 * Genera l'HTML per la lista delle password con suggerimenti basati su dominio
 */
function renderVaultItems(data) {
    const content = document.getElementById('content');
    content.innerHTML = '';

    if (!data || data.length === 0) {
        content.innerHTML = `<div style="padding: 20px; color: #888; text-align: center;">Nessun elemento trovato nel vault.</div>`;
        return;
    }

    // Ordina per rilevanza: elementi del dominio corrente in alto
    const sortedData = [...data].sort((a, b) => {
        const aDomain = extractDomain(a.domain || a.url || a.name || '');
        const bDomain = extractDomain(b.domain || b.url || b.name || '');
        const aMatch = currentDomain && aDomain && aDomain.includes(currentDomain);
        const bMatch = currentDomain && bDomain && bDomain.includes(currentDomain);
        
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
    });

    // Mostra suggerimenti per il sito corrente se disponibili
    if (currentDomain) {
        const siteMatches = sortedData.filter(item => {
            const itemDomain = extractDomain(item.domain || item.name || '');
            return itemDomain.includes(currentDomain);
        });

        if (siteMatches.length > 0) {
            const suggestionSection = document.createElement('div');
            suggestionSection.className = 'site-suggestion';
            suggestionSection.innerHTML = `<p class="section-title">Suggerimenti per questo sito</p>`;
            content.appendChild(suggestionSection);

            siteMatches.slice(0, 3).forEach(item => {
                const div = createVaultItemElement(item, true);
                suggestionSection.appendChild(div);
            });

            if (sortedData.length > siteMatches.length) {
                const allSection = document.createElement('div');
                allSection.style.marginTop = '20px';
                allSection.innerHTML = `<p class="section-title">Tutti gli elementi</p>`;
                content.appendChild(allSection);

                sortedData.filter(item => {
                    const itemDomain = extractDomain(item.domain || item.url || item.name || '');
                    return !itemDomain || !itemDomain.includes(currentDomain);
                }).forEach(item => {
                    allSection.appendChild(createVaultItemElement(item, false));
                });
            }
        } else {
            // Nessun match, mostra tutti gli elementi
            sortedData.forEach(item => {
                content.appendChild(createVaultItemElement(item, false));
            });
        }
    } else {
        // Nessun dominio rilevato, mostra tutti gli elementi
        sortedData.forEach(item => {
            content.appendChild(createVaultItemElement(item, false));
        });
    }
}

/**
 * Estrae il dominio da una stringa o URL
 */
function extractDomain(str) {
    if (!str) return '';
    try {
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return new URL(str).hostname.replace('www.', '').toLowerCase();
        }
        // Se è già un dominio, rimuovi www.
        return str.toLowerCase().replace('www.', '');
    } catch {
        return str.toLowerCase();
    }
}

/**
 * Crea un elemento DOM per un item del vault
 */
function createVaultItemElement(item, isSuggestion = false) {
    const div = document.createElement('div');
    div.className = 'vault-item';
    if (isSuggestion) {
        div.style.background = '#f0f7ff';
    }
    
    // Usa domain se disponibile, altrimenti estrai da URL o usa name
    let domain = item.domain;
    if (!domain && item.url) {
        try {
            const url = new URL(item.url);
            domain = url.hostname.replace('www.', '');
        } catch (e) {
            domain = item.name || 'example.com';
        }
    }
    if (!domain) {
        domain = item.name || 'example.com';
    }

    const displayName = item.name || domain;

    // SECURITY: Non caricare favicon da domini esterni (Google)
    // Usa solo icona locale per evitare tracking e dipendenze esterne
    const faviconImg = document.createElement('img');
    faviconImg.className = 'vault-favicon';
    faviconImg.src = 'icon.png'; // Usa sempre icona locale
    faviconImg.alt = '';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = displayName;

    const userSpan = document.createElement('span');
    userSpan.className = 'user';
    userSpan.textContent = item.username || 'N/A';

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(userSpan);

    const fillBtn = document.createElement('button');
    fillBtn.className = 'fill-btn';
    fillBtn.textContent = 'Inserisci';

    div.appendChild(faviconImg);
    div.appendChild(infoDiv);
    div.appendChild(fillBtn);

    // Funzione per inserire le credenziali
    const fillCredentials = async (e) => {
        // Previeni doppio trigger se si clicca sul pulsante
        if (e && e.target && e.target.classList.contains('fill-btn')) {
            e.stopPropagation();
        }
        
        const fillBtn = div.querySelector('.fill-btn');
        const originalText = fillBtn.textContent;
        fillBtn.disabled = true;
        fillBtn.textContent = '...';
        div.style.opacity = '0.6';
        
        try {
            // Le password dall'API sono già decrittate lato server
            let password = item.password;
            
            // Se per qualche motivo la password è ancora criptata (formato legacy)
            if (item.encrypted_password || (password && password.includes(':') && password.split(':').length === 3)) {
                // Password criptata, decrittografa localmente
                const masterPassword = await getMasterPassword();
                if (masterPassword) {
                    password = await decryptPassword(
                        item.encrypted_password || password,
                        masterPassword
                    );
                } else {
                    showNotification('Errore: chiave master non trovata', 'error');
                    fillBtn.disabled = false;
                    fillBtn.textContent = originalText;
                    div.style.opacity = '1';
                    return;
                }
            }
            
            // Valida le credenziali prima di inviarle
            const username = (item.username || '').trim();
            const passwordValue = (password || '').trim();
            
            if (!passwordValue) {
                showNotification('Errore: password vuota', 'error');
                fillBtn.disabled = false;
                fillBtn.textContent = originalText;
                div.style.opacity = '1';
                return;
            }
            
            await sendToContentScript(username, passwordValue);
        } catch (error) {
            console.error('Error decrypting/filling:', error);
            showNotification('Errore durante l\'inserimento', 'error');
            fillBtn.disabled = false;
            fillBtn.textContent = originalText;
            div.style.opacity = '1';
        }
    };

    // Evento al click sull'intero elemento (non solo sul pulsante)
    div.addEventListener('click', fillCredentials);
    
    // Evento anche sul pulsante per compatibilità
    const fillBtn = div.querySelector('.fill-btn');
    fillBtn.addEventListener('click', fillCredentials);

    return div;
}

/**
 * Escape HTML per prevenire XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Verifica e ottiene automaticamente un token API se necessario
 */
async function ensureAuthToken() {
    const existingToken = await getSavedToken();
    
    // Se c'è già un token, verifica che sia valido
    if (existingToken) {
        // Verifica rapida: prova a chiamare l'API
        try {
            const testResponse = await secureFetch('https://www.encryptio.it/password/api/v1/vault', {
                headers: {
                    'Authorization': 'Bearer ' + existingToken,
                    'Content-Type': 'application/json'
                }
            });
            
            if (testResponse.ok) {
                // Token valido, non serve fare nulla
                console.log('Token esistente valido');
                return;
            }
            
            // Token non valido, rimuovilo
            if (testResponse.status === 401) {
                console.log('Token non valido, rimozione...');
                await chrome.storage.local.remove(['auth_token']);
            }
        } catch (error) {
            // Errore di rete, mantieni il token e riprova dopo
            console.log('Network error checking token, will retry later:', error.message);
            return;
        }
    }
    
    // Non c'è token valido, prova a ottenerlo automaticamente
    console.log('Tentativo di ottenere nuovo token...');
    try {
        const token = await Promise.race([
            getAutoToken(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout ottenimento token')), 10000)
            )
        ]);
        if (token) {
            await chrome.storage.local.set({ auth_token: token });
            console.log('Token API ottenuto automaticamente e salvato');
        }
    } catch (error) {
        console.log('Impossibile ottenere token automaticamente:', error.message);
        // Non mostrare errore all'utente qui, sarà gestito in loadVaultFromFlask
    }
}

/**
 * Ottiene automaticamente un token API se l'utente è loggato su encryptio.it
 */
async function getAutoToken() {
    // Prova prima direttamente l'API (i cookie potrebbero essere condivisi)
    try {
        const directResponse = await secureFetch('https://www.encryptio.it/password/api/v1/token/auto', {
            method: 'POST',
            credentials: 'include', // Invia i cookie di sessione
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (directResponse.ok) {
            const data = await directResponse.json();
            if (data.ok && data.token) {
                console.log('Token ottenuto direttamente dall\'API');
                return data.token;
            }
        } else if (directResponse.status === 401) {
            console.log('API restituisce 401, utente non loggato o cookie non condivisi');
        }
    } catch (error) {
        console.log('Errore chiamata diretta API:', error);
    }
    
    // Se la chiamata diretta non funziona, prova tramite content script
    return new Promise((resolve, reject) => {
        // Usa il background script per comunicare con encryptio.it
        chrome.runtime.sendMessage({ action: "get_auto_token" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Errore comunicazione background:', chrome.runtime.lastError);
                reject(new Error('Errore di comunicazione con l\'estensione'));
                return;
            }
            
            if (response && response.success && response.token) {
                console.log('Token ottenuto tramite content script');
                resolve(response.token);
            } else {
                const errorMsg = response?.error || 'Token non ottenuto. Assicurati di essere loggato su encryptio.it';
                console.error('Errore ottenimento token:', errorMsg);
                reject(new Error(errorMsg));
            }
        });
    });
}

/**
 * Funzioni di Utility
 */
async function getSavedToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['auth_token'], (result) => {
            resolve(result.auth_token || null);
        });
    });
}

function generateRandomPassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let retVal = "";
    const length = 20; // Aumentato a 20 caratteri per maggiore sicurezza
    for (let i = 0; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const passElement = document.getElementById('gen-pass');
    if (passElement) {
        passElement.innerText = retVal;
    }
}
