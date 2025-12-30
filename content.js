/**
 * ENCRYPTIO - Content Script
 * Gestisce l'interazione diretta con le pagine web
 */

// 1. Ascolta i messaggi provenienti dal POPUP o dal BACKGROUND
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fill_credentials") {
      const success = fillLoginFields(request.username, request.password);
      sendResponse({ status: success ? "success" : "fields_not_found" });
  }
});

// 2. Funzione per iniettare i dati nei campi
function fillLoginFields(user, pass) {
  // Cerchiamo i campi password
  const passwordField = document.querySelector('input[type="password"]');
  
  // Cerchiamo il campo username (spesso di tipo email, text o con nomi specifici)
  const userField = document.querySelector('input[type="email"], input[name="username"], input[name="login"], input[type="text"]');

  if (passwordField) {
      // Inseriamo la password
      passwordField.value = pass;
      // Triggeriamo gli eventi per far capire al sito (es. React/Vue) che il campo è cambiato
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));

      if (userField) {
          userField.value = user;
          userField.dispatchEvent(new Event('input', { bubbles: true }));
          userField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      return true;
  }
  return false;
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