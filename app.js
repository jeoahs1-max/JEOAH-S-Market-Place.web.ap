// =================================================================
// src/public/app.js - Logique Principale du Frontend
// Connecte l'inscription à Firebase (Auth & Firestore)
// =================================================================

// Les objets Firebase (app, auth, db) sont importés depuis la balise <script type="module">
// dans inscription.html et sont disponibles via window.auth et window.db.

// -----------------------------------------------------------------
// 1. Dépendances Firebase (importées dans inscription.html)
// -----------------------------------------------------------------

// Les fonctions createUserWithEmailAndPassword et setDoc sont nécessaires.
// NOTE: Nous supposons que vous avez accès à l'API Admin ou à une Cloud Function
// pour un enregistrement sécurisé dans Firestore, mais pour ce code client, nous utilisons
// la méthode standard.

import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// -----------------------------------------------------------------
// 2. Fonctions Utilitaire de l'Interface
// -----------------------------------------------------------------

/**
 * Affiche une notification professionnelle à l'utilisateur.
 * @param {string} message - Le texte à afficher.
 * @param {string} type - 'success', 'error', ou 'info'.
 */
function showNotification(message, type) {
    const box = document.getElementById('notification-box');
    
    // Réinitialiser les classes
    box.className = 'p-4 rounded-lg shadow-xl text-white font-medium';
    box.classList.add('show');

    // Définir les styles en fonction du type
    if (type === 'success') {
        box.classList.add('bg-green-500');
    } else if (type === 'error') {
        box.classList.add('bg-red-600');
    } else {
        box.classList.add('bg-blue-500');
    }

    box.textContent = message;

    // Masquer après 5 secondes
    setTimeout(() => {
        box.classList.remove('show');
    }, 5000);
}


/**
 * Génère un identifiant unique (Ex: JHSMPv12345).
 * @param {string} rolePrefix - 'JHSMPv', 'JHSMPA', ou 'JHSMPa'.
 * @param {string} uid - L'UID Firebase (utilisé pour garantir l'unicité).
 * @returns {string} L'ID personnalisé.
 */
function generateCustomId(rolePrefix, uid) {
    //// --- 4. FONCTIONS DE SAUVEGARDE DE L'ONBOARDING ---

/**
 * Sauvegarde les liens sociaux (Vendeur, Affilié, Acheteur) dans Firestore.
 * @param {HTMLFormElement} form - Le formulaire d'entrée des liens sociaux.
 * @param {string} nextUrl - L'URL de redirection après la sauvegarde.
 */
async function saveSocialLinks(form, nextUrl) {
    if (!window.auth.currentUser) {
        showNotification("Session expirée. Veuillez vous reconnecter.", 'error');
        setTimeout(() => { window.location.href = 'connexion.html'; }, 1500);
        return;
    }
    
    const uid = window.auth.currentUser.uid;
    const links = [];
    
    // Récupération des 5 liens sociaux
    for (let i = 1; i <= 5; i++) {
        const link = form[`social_link_${i}`].value.trim();
        if (link) links.push(link);
    }
    
    try {
        const userRef = doc(window.db, "users", uid);
        await setDoc(userRef, { 
            socials: links, // Mise à jour du champ 'socials'
            onboardingComplete: true // Marquer l'onboarding comme terminé
        }, { merge: true });

        showNotification("Configuration sociale sauvegardée avec succès!", 'success');
        
        setTimeout(() => {
            window.location.href = nextUrl;
        }, 500);

    } catch (error) {
        showNotification(`Erreur de sauvegarde sociale : ${error.message}`, 'error');
    }
}

/**
 * Sauvegarde les liens d'affiliation externes dans le document utilisateur Firestore.
 * Utilisé uniquement par l'Affilié sur liens-d-affiliation.html.
 * @param {HTMLFormElement} form - Le formulaire d'entrée des liens d'affiliation.
 */
async function saveAffiliateLinks(form) {
    if (!window.auth.currentUser) {
        window.location.href = 'connexion.html'; 
        return;
    }
    
    const uid = window.auth.currentUser.uid;
    
    // Récupération des liens spécifiques à l'affiliation
    const links = {
        amazon: form.amazon_link.value.trim() || null,
        temu: form.temu_link.value.trim() || null,
        aliexpress: form.aliexpress_link.value.trim() || null,
        ebay: form.ebay_link.value.trim() || null,
        custom1: form.custom_link_1.value.trim() || null,
        custom2: form.custom_link_2.value.trim() || null,
    };

    try {
        const userRef = doc(window.db, "users", uid);
        await setDoc(userRef, { 
            affiliateLinks: links 
        }, { merge: true }); // 'merge: true' garde les autres champs intacts
        
        showNotification("Liens d'affiliation sauvegardés avec succès!", 'success');
        
        // Redirection vers l'étape suivante: setup social pour l'Affilié
        setTimeout(() => {
            window.location.href = 'affilié-social.html';
        }, 500);

    } catch (error) {
        showNotification(`Erreur lors de la sauvegarde des liens: ${error.message}`, 'error');
    }
} Utilise une partie de l'UID pour garantir l'unicité
    const uniquePart = uid.substring(0, 8).toUpperCase(); 
    return `${rolePrefix}${uniquePart}`;
}


// -----------------------------------------------------------------
// 3. Logique d'Inscription (Événement du Formulaire)
// -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Désactiver le bouton pour éviter les soumissions multiples
        const submitButton = document.getElementById('submit-button');
        submitButton.disabled = true;
        submitButton.textContent = "Inscription en cours...";

        const formData = new FormData(registerForm);
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirm_password');
        const fullName = formData.get('full_name');
        
        // Le rôle peut être null si rien n'est sélectionné (par défaut 'acheteur')
        const selectedRole = formData.get('role');
        const role = selectedRole || 'acheteur'; 

        // Récupérer les liens sociaux
        const socialLinks = [];
        for (let i = 1; i <= 5; i++) {
            const link = formData.get(`social_link_${i}`);
            if (link) socialLinks.push(link);
        }

        // Vérification de base
        if (password !== confirmPassword) {
            showNotification("Les mots de passe ne correspondent pas.", 'error');
            submitButton.disabled = false;
            submitButton.textContent = "S'inscrire (15 jours offerts aux 25 premiers)";
            return;
        }

        // --- Début du Processus d'Inscription ---
        try {
            // 1. Création de l'utilisateur dans Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
            const user = userCredential.user;
            const uid = user.uid;

            // 2. Détermination de l'ID, du Plan et du Statut d'Essai
            let rolePrefix = 'JHSMPa'; // Acheteur par défaut
            if (role === 'vendeur') rolePrefix = 'JHSMPv';
            if (role === 'affilie') rolePrefix = 'JHSMPA';

            const customId = generateCustomId(rolePrefix, uid);
            const referralLink = `${window.location.origin}/inscription.html?ref=${customId}`; // Lien de parrainage
            
            // Logique d'essai gratuit pour les 25 premiers (doit être sécurisé côté serveur à terme)
            // Pour l'instant, on simule la vérification (à améliorer avec une Cloud Function)
            let isTrial = false;
            let trialEnds = null;
            
            // Simplification: En attendant la Cloud Function pour compter les 25 premiers, 
            // nous mettons tout le monde en essai pour ce test initial.
            isTrial = true; 
            const now = new Date();
            trialEnds = new Date(now.setDate(now.getDate() + 15));


            // 3. Enregistrement des données dans Firestore (collection 'users')
            await setDoc(doc(window.db, "users", uid), {
                fullName: fullName,
                email: email,
                role: role,
                customId: customId,
                referralLink: referralLink,
                socials: socialLinks,
                isTrial: isTrial,
                trialEnds: trialEnds,
                // IMPORTANT: À terme, votre propre UID Admin doit être marqué ici
                isAdmin: (email === "jeoahs1@gmail.com"), // À personnaliser
                createdAt: new Date()
            });

            // 4. Redirection après Succès
            showNotification(`Bienvenue sur JEOAH'S, ${fullName}! Votre compte ${role} est créé.`, 'success');
            
            let redirectUrl;
            if (role === 'vendeur') {
                // Redirection Vendeur: setup social -> dashboard
                redirectUrl = 'fournisseur-step-social.html'; 
            } else if (role === 'affilie') {
                // Redirection Affilié: setup liens affiliation -> setup social
                redirectUrl = 'liens-d-affiliation.html';
            } else {
                // Redirection Acheteur (ou autre)
                redirectUrl = 'index.html'; 
            }
            
            // Attendre un court instant avant de rediriger
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 2000);


        } catch (error) {
            console.error("Erreur d'inscription:", error);
            let errorMessage = "Une erreur inconnue est survenue.";

            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Cet email est déjà utilisé. Veuillez vous connecter.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "L'adresse email n'est pas valide.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Le mot de passe est trop faible (6 caractères minimum).";
            }
            
            showNotification(`Erreur: ${errorMessage}`, 'error');
            submitButton.disabled = false;
            submitButton.textContent = "S'inscrire (15 jours offerts aux 25 premiers)";
        }
    });

    // -----------------------------------------------------------------
    // 4. Logique IA (Démo - Simplifiée)
    // -----------------------------------------------------------------

    const aiDemoButton = document.getElementById('ai-demo-button');
    if (aiDemoButton) {
        aiDemoButton.addEventListener('click', () => {
            showNotification("La démo IA sera disponible après l'intégration des Cloud Functions!", 'info');
        });
    }
});// -----------------------------------------------------------------
// 5. Logique des Formulaires d'Onboarding (Post-Inscription)
// -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // S'assurer que les services Firebase sont chargés
    if (!window.auth || !window.db) return;

    const path = window.location.pathname;

    // --- A. Logique Affilié: Liens Externes (liens-d-affiliation.html) ---
    if (path.includes('liens-d-affiliation.html')) {
        const form = document.getElementById('affiliateLinksForm');
        const skipButton = document.getElementById('skipButton');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveAffiliateLinks(form);
            });
        }
        
        if (skipButton) {
             skipButton.addEventListener('click', () => {
                // Pas de sauvegarde, redirection vers l'étape suivante (affilié-social)
                window.location.href = 'affilié-social.html';
            });
        }
    }
    
    // --- B. Logique Social Vendeur (fournisseur-step-social.html) ---
    if (path.includes('fournisseur-step-social.html')) {
        const form = document.getElementById('supplierSocialForm');
        const skipButton = document.getElementById('skipButton');
        const nextUrl = 'produits-vendeurs.html'; // Dashboard Vendeur
        
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveSocialLinks(form, nextUrl);
            });
        }
        
        if (skipButton) {
             skipButton.addEventListener('click', () => {
                window.location.href = nextUrl;
            });
        }
    }

    // --- C. Logique Social Affilié (affilié-social.html) ---
    if (path.includes('affilié-social.html')) {
        const form = document.getElementById('affiliateSocialForm');
        const skipButton = document.getElementById('skipButton');
        const nextUrl = 'produits-affiliés.html'; // Dashboard Affilié
        
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveSocialLinks(form, nextUrl);
            });
        }
        
        if (skipButton) {
             skipButton.addEventListener('click', () => {
                window.location.href = nextUrl;
            });
        }
    }
    
    // --- D. Logique Social Acheteur (acheteur-social-setup.html) ---
    if (path.includes('acheteur-social-setup.html')) {
        const form = document.getElementById('buyerSocialForm');
        const skipButton = document.getElementById('skipButton');
        const nextUrl = 'index.html'; // Vitrine
        
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveSocialLinks(form, nextUrl);
            });
        }
        
        if (skipButton) {
             skipButton.addEventListener('click', () => {
                window.location.href = nextUrl;
            });
        }
    }
});
