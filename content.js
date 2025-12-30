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
  // Cerchiamo i campi password con selettori migliorati
  const passwordField = document.querySelector('input[type="password"]');
  
  if (!passwordField) {
      return false;
  }

  // Selettori migliorati per username - cerca in ordine di priorità
  let userField = null;
  
  // 1. Campi con attributi specifici (più affidabili)
  const prioritySelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[name="username"]',
      'input[id*="username" i]',
      'input[name="login"]',
      'input[id*="login" i]',
      'input[name="user"]',
      'input[id*="user" i]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]'
  ];
  
  for (const selector of prioritySelectors) {
      const field = document.querySelector(selector);
      if (field && field.type !== 'password' && !field.disabled && !field.hidden) {
          userField = field;
          break;
      }
  }
  
  // 2. Fallback: cerca il primo campo text prima del campo password
  if (!userField) {
      const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"]'));
      const passwordIndex = allInputs.indexOf(passwordField);
      if (passwordIndex > 0) {
          userField = allInputs[passwordIndex - 1];
      }
  }

  try {
      // Inseriamo la password
      passwordField.value = pass;
      // Triggeriamo gli eventi per far capire al sito (es. React/Vue) che il campo è cambiato
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      passwordField.dispatchEvent(new Event('blur', { bubbles: true }));

      if (userField) {
          userField.value = user;
          userField.dispatchEvent(new Event('input', { bubbles: true }));
          userField.dispatchEvent(new Event('change', { bubbles: true }));
          userField.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      
      return true;
  } catch (error) {
      console.error('Error filling fields:', error);
      return false;
  }
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