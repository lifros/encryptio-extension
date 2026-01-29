/**
 * ENCRYPTIO - Content Script
 * Gestisce l'interazione diretta con le pagine web
 */

// Carica funzioni utility (se disponibili, altrimenti usa fallback)
let normalizeUrl, urlsMatch, cleanupExpiredCredentials;
if (typeof window.normalizeUrl === 'function') {
    normalizeUrl = window.normalizeUrl;
    urlsMatch = window.urlsMatch;
    cleanupExpiredCredentials = window.cleanupExpiredCredentials;
} else {
    // Fallback inline se utils.js non è caricato
    normalizeUrl = function(u) {
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
    urlsMatch = function(url1, url2) {
        const n1 = normalizeUrl(url1);
        const n2 = normalizeUrl(url2);
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
    };
    cleanupExpiredCredentials = async function() {};
}

// Funzione per creare/mostrare overlay di stato
function showStatusOverlay(message, type = 'info') {
    // Rimuovi overlay esistente se presente
    const existingOverlay = document.getElementById('encryptio-status-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Crea nuovo overlay
    const overlay = document.createElement('div');
    overlay.id = 'encryptio-status-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#007bff'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 350px;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
    `;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : '⏳';

    // SECURITY: Usa textContent invece di innerHTML per prevenire XSS
    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '18px';
    iconSpan.textContent = icon;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    overlay.appendChild(iconSpan);
    overlay.appendChild(messageSpan);
    
    // Aggiungi animazione CSS
    if (!document.getElementById('encryptio-overlay-styles')) {
        const style = document.createElement('style');
        style.id = 'encryptio-overlay-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    
    // Auto-rimuovi dopo alcuni secondi (tranne per 'info' che rimane fino a quando non viene sostituito manualmente)
    if (type !== 'info') {
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => overlay.remove(), 300);
            }
        }, type === 'success' ? 3000 : 5000);
    } else {
        // Per overlay di tipo 'info', rimani visibile fino a quando non viene sostituito o rimosso manualmente
        // Non rimuovere automaticamente
    }
    
    return overlay;
}

// Funzione per rimuovere overlay
function removeStatusOverlay() {
    const overlay = document.getElementById('encryptio-status-overlay');
    if (overlay) {
        overlay.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => overlay.remove(), 300);
    }
}

// Controlla se ci sono credenziali salvate per questa pagina e inseriscile automaticamente
async function checkAndFillAutoCredentials() {
    try {
        const currentUrl = normalizeUrl(window.location.href);
        console.log('[Encryptio] Controllo credenziali salvate per URL:', currentUrl);
        
        // Cerca tutte le chiavi di storage che iniziano con encryptio_autofill_
        const allStorage = await chrome.storage.local.get(null);
        const autofillKeys = Object.keys(allStorage).filter(key => key.startsWith('encryptio_autofill_'));
        
        // Cerca anche marker di "nessuna password trovata"
        const noPasswordKey = `encryptio_no_password_${currentUrl.replace(/[^a-z0-9]/g, '_').substring(0, 100)}`;
        const noPasswordMarker = allStorage[noPasswordKey];
        
        if (noPasswordMarker) {
            console.log('[Encryptio] Marker trovato: nessuna password disponibile per questo sito');
            showStatusOverlay('✕ Nessuna password trovata per questo sito', 'error');
            // Rimuovi il marker dopo averlo mostrato
            await chrome.storage.local.remove(noPasswordKey);
            return;
        }
        
        let credentialsFound = false;
        
        for (const key of autofillKeys) {
            const storedData = allStorage[key];
            if (!storedData) continue;

            // Decifra i dati se sono cifrati
            let data;
            if (storedData.encrypted && storedData.data) {
                try {
                    data = await decryptTemporaryData(storedData.data);
                } catch (error) {
                    console.error('[Encryptio] Errore decifratura credenziali:', error);
                    continue;
                }
            } else {
                // Formato legacy non cifrato
                data = storedData;
            }

            if (!data || !data.url) continue;

            const savedUrl = normalizeUrl(data.url);
            
            // Verifica se l'URL corrisponde usando funzione migliorata
            if (urlsMatch(savedUrl, currentUrl)) {
                credentialsFound = true;
                console.log('[Encryptio] Credenziali trovate per autofill automatico');
                
                // Mostra overlay di ricerca (rimane visibile fino al completamento)
                const passwordName = data.passwordName || 'Password';
                const searchOverlay = showStatusOverlay(`⏳ Encryptio: ricerca credenziali per ${passwordName}...`, 'info');
                
                // Attendi che la pagina sia completamente caricata
                if (document.readyState === 'loading') {
                    await new Promise(resolve => {
                        if (document.readyState === 'complete') {
                            resolve();
                        } else {
                            window.addEventListener('load', resolve, { once: true });
                        }
                    });
                }
                
                // Attendi un po' per assicurarsi che i campi siano renderizzati
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Aggiorna overlay: cerca campi login
                showStatusOverlay(`🔍 Encryptio: ricerca campi login...`, 'info');
                
                // Inserisci le credenziali
                const success = await fillLoginFields(data.username || '', data.password || '');
                
                if (success) {
                    console.log('[Encryptio] Credenziali inserite automaticamente con successo');
                    removeStatusOverlay();
                    showStatusOverlay('✓ Credenziali inserite con successo!', 'success');
                    // Rimuovi le credenziali dallo storage dopo l'inserimento (per sicurezza)
                    await chrome.storage.local.remove(key);
                } else {
                    console.log('[Encryptio] Campi login non trovati, riprovo tra 1 secondo...');
                    showStatusOverlay(`🔍 Encryptio: riprovo ricerca campi login...`, 'info');
                    
                    // Riprova dopo 1 secondo (alcuni siti caricano i campi dinamicamente)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const retrySuccess = await fillLoginFields(data.username || '', data.password || '');
                    
                    if (retrySuccess) {
                        removeStatusOverlay();
                        showStatusOverlay('✓ Credenziali inserite con successo!', 'success');
                        await chrome.storage.local.remove(key);
                    } else {
                        removeStatusOverlay();
                        showStatusOverlay('✕ Campi login non trovati su questa pagina', 'error');
                        // Rimuovi comunque le credenziali dopo il tentativo (evita accumulo)
                        await chrome.storage.local.remove(key);
                    }
                }
                
                break; // Inserisci solo la prima corrispondenza
            }
        }
        
        // Se non sono state trovate credenziali e non c'era un marker, potrebbe essere un problema
        if (!credentialsFound && autofillKeys.length > 0) {
            console.log('[Encryptio] Nessuna credenziale corrispondente trovata per questo URL');
            showStatusOverlay('✕ Nessuna credenziale corrispondente trovata', 'error');
        }
        
    } catch (error) {
        console.error('[Encryptio] Errore durante autofill automatico:', error);
        removeStatusOverlay();
        showStatusOverlay('✕ Errore durante l\'inserimento delle credenziali: ' + error.message, 'error');
    }
}

// Pulisci credenziali scadute all'avvio
cleanupExpiredCredentials();

// Esegui il controllo quando la pagina è pronta
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndFillAutoCredentials);
} else {
    // La pagina è già caricata
    setTimeout(checkAndFillAutoCredentials, 500);
}

// 1. Ascolta i messaggi provenienti dal POPUP o dal BACKGROUND
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
      // Verifica che lo script sia caricato
      sendResponse({ pong: true });
      return false;
  } else if (request.action === "fill_credentials") {
      const success = fillLoginFields(request.username, request.password);
      sendResponse({
          status: success ? "success" : "fields_not_found",
          message: success ? "Credenziali inserite con successo" : "Campi login non trovati"
      });
      return true; // Indica che risponderemo in modo asincrono se necessario
  }
});

// 2. Funzione per iniettare i dati nei campi
async function fillLoginFields(user, pass) {
  // Valida input con funzioni da utils.js
  const usernameValidation = validateUsername(user);
  const passwordValidation = validatePassword(pass);

  if (!passwordValidation.valid) {
    console.warn('[Encryptio] Password validation failed:', passwordValidation.error);
    return false;
  }

  if (!usernameValidation.valid) {
    console.warn('[Encryptio] Username validation failed:', usernameValidation.error);
    return false;
  }

  const sanitizedUser = usernameValidation.sanitized;
  const sanitizedPass = passwordValidation.sanitized;

  console.log('[Encryptio] Tentativo di inserire credenziali');
  
  // Cerchiamo i campi password con selettori migliorati
  const passwordField = document.querySelector('input[type="password"]');
  
  if (!passwordField) {
      console.log('[Encryptio] Campo password non trovato');
      return false;
  }

  console.log('[Encryptio] Campo password trovato');

  // Selettori migliorati per username - cerca in ordine di priorità
  let userField = null;
  
  // 1. Campi con attributi specifici (più affidabili)
  const prioritySelectors = [
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[name="username"]',
      'input[id*="username" i]',
      'input[name="login"]',
      'input[id*="login" i]',
      'input[name="user"]',
      'input[id*="user" i]',
      'input[name="account"]',
      'input[id*="account" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
      'input[placeholder*="user" i]',
      'input[placeholder*="login" i]'
  ];
  
  for (const selector of prioritySelectors) {
      try {
          const field = document.querySelector(selector);
          if (field && field !== passwordField && field.type !== 'password' && 
              !field.disabled && !field.hidden && isFieldVisible(field)) {
              userField = field;
              console.log('[Encryptio] Campo username trovato con selettore:', selector);
              break;
          }
      } catch (e) {
          // Selettore non valido, continua
      }
  }
  
  // 2. Fallback: cerca tutti i campi input visibili e trova quello prima del campo password
  if (!userField) {
      const allInputs = Array.from(document.querySelectorAll('input'));
      const passwordIndex = allInputs.indexOf(passwordField);
      
      if (passwordIndex > 0) {
          // Cerca indietro dal campo password
          for (let i = passwordIndex - 1; i >= 0; i--) {
              const field = allInputs[i];
              if (field && field.type !== 'password' && 
                  !field.disabled && !field.hidden && 
                  isFieldVisible(field) &&
                  (field.type === 'text' || field.type === 'email' || !field.type)) {
                  userField = field;
                  console.log('[Encryptio] Campo username trovato come campo prima della password');
                  break;
              }
          }
      }
      
      // Se ancora non trovato, cerca il primo campo text/email nel form
      if (!userField && passwordField.form) {
          const formInputs = Array.from(passwordField.form.querySelectorAll('input'));
          for (const field of formInputs) {
              if (field !== passwordField && field.type !== 'password' && 
                  !field.disabled && !field.hidden && 
                  isFieldVisible(field) &&
                  (field.type === 'text' || field.type === 'email' || !field.type)) {
                  userField = field;
                  console.log('[Encryptio] Campo username trovato nel form');
                  break;
              }
          }
      }
  }

  try {
      // Funzione helper per impostare valore con tutti gli eventi necessari
      function setFieldValue(field, value) {
          if (!field || !value) return;
          
          try {
              // Metodo 1: Focus e impostazione diretta
              field.focus();
              field.value = '';
              field.value = value;
              
              // Metodo 2: Usa il setter nativo per bypassare eventuali proxy
              try {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype, 
                      'value'
                  )?.set;
                  if (nativeInputValueSetter) {
                      nativeInputValueSetter.call(field, value);
                  }
              } catch (e) {
                  // Fallback se non disponibile
                  field.value = value;
              }
              
              // Metodo 3: Triggera eventi per React
              const reactInputEvent = new Event('input', { bubbles: true, cancelable: true });
              Object.defineProperty(reactInputEvent, 'target', { 
                  value: field, 
                  enumerable: true,
                  writable: false
              });
              field.dispatchEvent(reactInputEvent);
              
              // Metodo 4: Triggera eventi standard
              const events = ['input', 'change', 'keyup', 'keydown'];
              events.forEach(eventType => {
                  const evt = new Event(eventType, { bubbles: true, cancelable: true });
                  field.dispatchEvent(evt);
              });
              
              // Metodo 5: Per Vue.js e altri framework
              const vueInputEvent = new InputEvent('input', {
                  bubbles: true,
                  cancelable: true,
                  data: value
              });
              field.dispatchEvent(vueInputEvent);
              
              // Metodo 6: Verifica e riprova se necessario
              if (field.value !== value) {
                  console.log('[Encryptio] Valore non persistito, riprovo con metodo alternativo');
                  field.setAttribute('value', value);
                  field.value = value;
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true }));
              }
              
          } catch (error) {
              console.error('[Encryptio] Errore in setFieldValue:', error);
              // Fallback semplice
              field.value = value;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
          }
      }
      
      // Inseriamo prima l'username (se presente), poi la password
      if (userField && sanitizedUser) {
          // Prova multipla per assicurarsi che il valore venga mantenuto
          for (let attempt = 0; attempt < 3; attempt++) {
              setFieldValue(userField, sanitizedUser);
              await new Promise(resolve => setTimeout(resolve, 50));
              
              if (userField.value === sanitizedUser) {
                  console.log('[Encryptio] Username inserito correttamente');
                  break;
              } else if (attempt < 2) {
                  console.log('[Encryptio] Tentativo', attempt + 1, 'fallito, riprovo...');
              } else {
                  console.warn('[Encryptio] Username non persistito dopo 3 tentativi');
              }
          }
      } else if (!userField) {
          console.warn('[Encryptio] Campo username non trovato, inserita solo la password');
      } else if (!sanitizedUser) {
          console.warn('[Encryptio] Username non fornito');
      }
      
      // Piccolo delay prima di inserire la password
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Inseriamo la password
      setFieldValue(passwordField, sanitizedPass);
      console.log('[Encryptio] Password inserita');
      
      // Verifica finale che i valori siano stati effettivamente impostati
      setTimeout(() => {
          if (userField && sanitizedUser && userField.value !== sanitizedUser) {
              console.warn('[Encryptio] Username perso dopo inserimento, valore attuale:', userField.value);
              // Ultimo tentativo
              userField.focus();
              userField.value = sanitizedUser;
              userField.dispatchEvent(new Event('input', { bubbles: true }));
              userField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (passwordField.value !== sanitizedPass) {
              console.warn('[Encryptio] Password persa dopo inserimento');
              passwordField.focus();
              passwordField.value = sanitizedPass;
              passwordField.dispatchEvent(new Event('input', { bubbles: true }));
              passwordField.dispatchEvent(new Event('change', { bubbles: true }));
          }
      }, 300);
      
      return true;
  } catch (error) {
      console.error('[Encryptio] Errore durante l\'inserimento:', error);
      return false;
  }
}

/**
 * Verifica se un campo è visibile
 */
function isFieldVisible(field) {
    if (!field) return false;
    
    const style = window.getComputedStyle(field);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    
    // Verifica anche se il campo o i suoi parent sono nascosti
    let element = field;
    while (element && element !== document.body) {
        const elemStyle = window.getComputedStyle(element);
        if (elemStyle.display === 'none' || elemStyle.visibility === 'hidden') {
            return false;
        }
        element = element.parentElement;
    }
    
    return true;
}

// 3. Analisi della pagina all'avvio (opzionale: aggiunge un'icona nei campi)
function highlightFields() {
  const inputs = document.querySelectorAll('input[type="password"]');
  inputs.forEach(input => {
      // Esempio: aggiunge una piccola ombra blu per indicare che Encryptio è attivo
      input.style.boxShadow = "0 0 5px rgba(0, 123, 255, 0.5)";
      input.style.borderColor = "#007bff";
  });
}

// Eseguiamo un controllo leggero al caricamento
highlightFields();