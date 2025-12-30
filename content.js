// Funzione base per trovare i campi password nella pagina
function findPasswordFields() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    
    passwordInputs.forEach(input => {
      // Aggiungiamo un piccolo bordo azzurro per testare che il rilevamento funzioni
      input.style.border = "2px solid #007bff";
      
      // Qui potresti inserire un'icona di Encryptio cliccabile dentro il campo
      console.log("Campo password trovato in questa pagina!");
    });
  }
  
  // Esegui la scansione all'apertura della pagina
  findPasswordFields();