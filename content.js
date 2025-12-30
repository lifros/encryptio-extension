/**
 * ENCRYPTIO - Content Script
 * Gestisce l'interazione diretta con le pagine web
 */

// 1. Ascolta i messaggi provenienti dal POPUP o dal BACKGROUND
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fill_credentials") {
      const success = fillLoginFields(request.username, request.password);
      sendResponse({ 
          status: success ? "success" : "fields_not_found",
          message: success ? "Credenziali inserite con successo" : "Campi login non trovati"
      });
      return true; // Indica che risponderemo in modo asincrono se necessario
  }
});

// 2. Funzione per iniettare i dati nei campi
function fillLoginFields(user, pass) {
  console.log('[Encryptio] Tentativo di inserire credenziali, username:', user ? user.substring(0, 3) + '...' : 'NONE');
  
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
      // Inseriamo la password
      passwordField.value = pass;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      passwordField.dispatchEvent(new Event('blur', { bubbles: true }));
      console.log('[Encryptio] Password inserita');

      if (userField && user) {
          userField.value = user;
          userField.dispatchEvent(new Event('input', { bubbles: true }));
          userField.dispatchEvent(new Event('change', { bubbles: true }));
          userField.dispatchEvent(new Event('blur', { bubbles: true }));
          console.log('[Encryptio] Username inserito');
      } else if (!userField) {
          console.warn('[Encryptio] Campo username non trovato, inserita solo la password');
      } else if (!user) {
          console.warn('[Encryptio] Username non fornito');
      }
      
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