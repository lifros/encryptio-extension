/**
 * ENCRYPTIO - popup.js
 * Logica per la gestione dell'interfaccia dell'estensione
 */

let currentDomain = '';
let vaultData = [];

document.addEventListener('DOMContentLoaded', async function() {
    
    // 1. RILEVAMENTO SITO ATTIVO (prima di tutto)
    await detectCurrentDomain();

    // 2. INIZIALIZZAZIONE: Carica i dati dal Vault
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
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs[0]) {
                showNotification('Nessuna scheda attiva', 'error');
                resolve(false);
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, {
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

/**
 * Copia la password generata negli appunti
 */
function copyGeneratedPassword() {
    const passElement = document.getElementById('gen-pass');
    if (passElement && passElement.textContent !== '********') {
        navigator.clipboard.writeText(passElement.textContent).then(() => {
            showNotification('Password copiata!', 'success');
        }).catch(() => {
            showNotification('Errore nella copia', 'error');
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
            content.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p style="color: #dc3545; margin-bottom: 10px;">Autenticazione richiesta</p>
                    <p style="color: #666; font-size: 12px;">Effettua il login su encryptio.it per continuare.</p>
                </div>
            `;
            return;
        }

        const response = await fetch('https://www.encryptio.it/api/v1/vault', {
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                content.innerHTML = `
                    <div style="padding: 20px; text-align: center;">
                        <p style="color: #dc3545; margin-bottom: 10px;">Sessione scaduta</p>
                        <p style="color: #666; font-size: 12px;">Effettua nuovamente il login su encryptio.it</p>
                    </div>
                `;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            return;
        }

        const data = await response.json();
        vaultData = Array.isArray(data) ? data : [];
        
        // Renderizza gli elementi ricevuti
        renderVaultItems(vaultData);
    } catch (error) {
        console.error('Error loading vault:', error);
        content.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #dc3545; margin-bottom: 10px;">Errore di connessione</p>
                <p style="color: #666; font-size: 12px;">Impossibile caricare il vault. Verifica la connessione.</p>
                <button class="fill-btn" onclick="location.reload()" style="margin-top: 10px;">Riprova</button>
            </div>
        `;
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
        const aDomain = extractDomain(a.domain || a.name || '');
        const bDomain = extractDomain(b.domain || b.name || '');
        const aMatch = currentDomain && aDomain.includes(currentDomain);
        const bMatch = currentDomain && bDomain.includes(currentDomain);
        
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
                    const itemDomain = extractDomain(item.domain || item.name || '');
                    return !itemDomain.includes(currentDomain);
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
 * Estrae il dominio da una stringa
 */
function extractDomain(str) {
    try {
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return new URL(str).hostname.replace('www.', '').toLowerCase();
        }
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
    
    const domain = item.domain || item.name || 'example.com';
    const displayName = item.name || domain;
    
    div.innerHTML = `
        <img src="https://www.google.com/s2/favicons?domain=${domain}" alt="" onerror="this.src='icon.png'">
        <div class="info">
            <span class="name">${escapeHtml(displayName)}</span>
            <span class="user">${escapeHtml(item.username || 'N/A')}</span>
        </div>
        <button class="fill-btn">Inserisci</button>
    `;

    // Evento al click sul tasto inserisci
    const fillBtn = div.querySelector('.fill-btn');
    fillBtn.addEventListener('click', async () => {
        fillBtn.disabled = true;
        fillBtn.textContent = '...';
        
        try {
            // Decrittografa la password se è criptata
            let password = item.password;
            
            if (item.encrypted_password || (item.password && item.password.includes(':'))) {
                // Password criptata, decrittografa
                const masterPassword = await getMasterPassword();
                if (masterPassword) {
                    password = await decryptPassword(
                        item.encrypted_password || item.password,
                        masterPassword
                    );
                } else {
                    showNotification('Errore: chiave master non trovata', 'error');
                    fillBtn.disabled = false;
                    fillBtn.textContent = 'Inserisci';
                    return;
                }
            }
            
            await sendToContentScript(item.username, password);
        } catch (error) {
            console.error('Error decrypting/filling:', error);
            showNotification('Errore durante l\'inserimento', 'error');
        } finally {
            fillBtn.disabled = false;
            fillBtn.textContent = 'Inserisci';
        }
    });

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
