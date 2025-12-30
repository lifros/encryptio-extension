document.addEventListener('DOMContentLoaded', function() {
    
    // 1. Gestione dei Tab
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Rimuovi active da tutti i tab e aggiungi al cliccato
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.getAttribute('data-target');
            updateMainContent(target);
        });
    });

    // 2. Logica di Ricerca Dinamica
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterVaultItems(query);
    });

    // 3. Rilevamento Sito Attivo (Chrome API)
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        let activeTab = tabs[0];
        let url = new URL(activeTab.url);
        let domain = url.hostname.replace('www.', '');
        
        console.log("Sei su:", domain);
        // Qui chiameremo la funzione per evidenziare la password di questo dominio
    });
});

// Funzione per cambiare il contenuto principale (Mockup)
function updateMainContent(target) {
    const content = document.getElementById('content');
    if (target === 'generator') {
        content.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p>Generatore Password</p>
                <h2 id="gen-pass">********</h2>
                <button class="fill-btn" onclick="generateRandom()">Genera</button>
            </div>
        `;
    } else if (target === 'vault') {
        location.reload(); // Torna alla lista principale
    }
}

// Funzione per filtrare i risultati
function filterVaultItems(query) {
    const items = document.querySelectorAll('.vault-item');
    items.forEach(item => {
        const name = item.querySelector('.name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Funzione per caricare i dati del vault dall'API di Encryptio
async function loadVaultFromFlask() {
    try {
        const response = await fetch('https://www.encryptio.it/api/v1/vault', {
            headers: {
                'Authorization': 'Bearer ' + await getSavedToken() // Recupera il token di sessione
            }
        });
        const data = await response.json();
        renderVaultItems(data);
    } catch (error) {
        console.error("Errore nel caricamento dati:", error);
    }
}