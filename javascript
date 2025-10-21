// PWA Service Worker Registration (Code existant)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
  .then(() => console.log("Service Worker enregistré avec succès"))
  .catch(err => console.error("Erreur SW:", err));
}

// Configuration Firebase (PLACEHOLDER - REMPLACER AVEC VOS CLÉS !)
// L'initialisation doit être faite dans le code réel de production

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    
    // --- Logique d'Inscription (Prêt pour la Connexion Backend) ---
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm_password').value;
            // Récupère le rôle sélectionné
            const role = document.getElementById('role').value; 

            // 1. Validation des mots de passe
            if (password !== confirmPassword) {
                alert("Erreur: Les mots de passe ne correspondent pas.");
                return;
            }
            if (!email) {
                alert("Erreur: L'email est requis.");
                return;
            }

            alert("Connexion à la base de données pour l'inscription (15 jours d'essai) en cours... Veuillez patienter.");

            try {
                // SIMULATION DE CONNEXION FIREBASE RÉUSSIE

                // 2. Redirection spécifique selon le rôle
                if (role === 'vendeur') {
                    // Redirection vers l'étape 1 du Détaillant (Setup social)
                    window.location.href = 'vendor-setup.html'; 
                } else if (role === 'affilie') {
                    // Redirection vers l'étape 1 de l'Affilié (Setup ID)
                    window.location.href = 'affiliate-setup.html'; 
                } else {
                    // Acheteur ou défaut va directement au tableau de bord
                    window.location.href = 'dashboard.html';
                }

            } catch (error) {
                // En cas d'échec de la connexion Firebase (si elle est active)
                alert(`Erreur Firebase : Connexion échouée. Redirection forcée pour le test.`);
                window.location.href = 'dashboard.html'; 
            }
        });
    }
});
