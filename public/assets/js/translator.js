const LANG_KEY = 'jeoahs-lang';
const DEFAULT_LANG = 'fr';

// Fonction globale pour changer la langue
window.setLang = function(lang) {
    localStorage.setItem(LANG_KEY, lang);
    location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Déterminer la langue ---
    let currentLang = localStorage.getItem(LANG_KEY) || DEFAULT_LANG;

    // --- 2. Charger le fichier de langue ---
    let translations = {};
    try {
        const response = await fetch(`/assets/lang/${currentLang}.json`);
        if (!response.ok) {
            console.warn(`Fichier de langue pour '${currentLang}' non trouvé. Utilisation de la langue par défaut.`);
            currentLang = DEFAULT_LANG;
            const defaultResponse = await fetch(`/assets/lang/${DEFAULT_LANG}.json`);
            translations = await defaultResponse.json();
        } else {
            translations = await response.json();
        }
    } catch (error) {
        console.error('Erreur lors du chargement du fichier de langue:', error);
        // Continuer sans traductions si le chargement échoue
        return;
    }

    // --- 3. Appliquer les traductions ---
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[key]) {
            // Gérer les cas spéciaux comme les placeholders ou les valeurs
            if (element.hasAttribute('placeholder')) {
                element.setAttribute('placeholder', translations[key]);
            } else if (element.hasAttribute('value')) {
                element.setAttribute('value', translations[key]);
            } else {
                element.innerHTML = translations[key];
            }
        }
    });

    // Mettre à jour la classe active sur le sélecteur de langue actuel
    const langSelectors = document.querySelectorAll('[data-lang]');
    langSelectors.forEach(selector => {
        if (selector.getAttribute('data-lang') === currentLang) {
            selector.classList.add('active-lang'); // Ajoutez un style pour la langue active
        }
    });
});
