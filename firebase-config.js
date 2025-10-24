// Importations nécessaires de Firebase (version 11.6.1 obligatoire pour la compatibilité CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

// --- CONFIGURATION FIREBASE (MANDATORY) ---
// Récupération des variables globales de l'environnement Canvas
// Ceci est la méthode OBLIGATOIRE
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialisation de Firebase
let app, db, auth;

if (firebaseConfig) {
    setLogLevel('Debug');
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Tentative de connexion (Authentification)
    if (initialAuthToken) {
        signInWithCustomToken(auth, initialAuthToken)
            .then(() => console.log("Connexion Firebase réussie avec le token personnalisé."))
            .catch(error => {
                console.error("Erreur de connexion avec le token personnalisé :", error);
                signInAnonymously(auth);
            });
    } else {
        signInAnonymously(auth)
            .then(() => console.log("Connexion Firebase anonyme réussie."))
            .catch(error => console.error("Erreur de connexion anonyme :", error));
    }
} else {
    console.error("Firebase n'a pas pu être initialisé : configuration manquante.");
}


// --- GESTION DE L'ÉTAT UTILISATEUR ET DU PLAN ---

let currentPlan = 'free'; // Par défaut, l'utilisateur est sur le plan gratuit.
let userId = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        console.log("UserID défini:", userId);
        // Charger le plan actuel de l'utilisateur après l'authentification
        loadUserPlan(userId);
    } else {
        // En cas de déconnexion, définir un ID temporaire et le plan gratuit
        userId = crypto.randomUUID();
        currentPlan = 'free';
        console.log("Utilisateur non authentifié, ID temporaire:", userId);
    }
});

// Chemin vers la collection des plans utilisateurs (chemin privé obligatoire)
function getUserPlanRef(uid) {
    return doc(db, `artifacts/${appId}/users/${uid}/plans/current`);
}

/**
 * Charge le plan de l'utilisateur depuis Firestore.
 */
async function loadUserPlan(uid) {
    if (!db || !uid) return;

    try {
        const docSnap = await getDoc(getUserPlanRef(uid));
        if (docSnap.exists()) {
            currentPlan = docSnap.data().planId;
            console.log(`Plan utilisateur chargé : ${currentPlan}`);
        } else {
            console.log("Aucun plan trouvé, défini sur 'free'.");
            currentPlan = 'free';
        }
        updateUI();
    } catch (error) {
        console.error("Erreur lors du chargement du plan utilisateur:", error);
        currentPlan = 'free'; // Revenir au plan gratuit en cas d'erreur
        updateUI();
    }
}

/**
 * Met à jour le plan de l'utilisateur dans Firestore. (Simulation de la souscription)
 */
async function setUserPlan(planId) {
    if (!db || !userId) {
        showModal('Erreur', 'Veuillez vous authentifier pour sélectionner un plan.');
        return;
    }

    try {
        await setDoc(getUserPlanRef(userId), {
            planId: planId,
            timestamp: new Date().toISOString()
        });
        currentPlan = planId;
        updateUI();
        showModal('Succès !', `Votre plan ${planId.toUpperCase()} a été activé (Simulation).`);
        console.log(`Plan utilisateur mis à jour vers ${planId}`);
    } catch (error) {
        console.error("Erreur lors de la mise à jour du plan:", error);
        showModal('Erreur de Sauvegarde', "Impossible de sauvegarder le plan. Veuillez réessayer.");
    }
}

/**
 * Fonction de mise à jour de l'interface utilisateur.
 */
function updateUI() {
    const geminiSection = document.getElementById('generateSloganBtn');
    if (geminiSection) {
        if (currentPlan === 'free') {
            geminiSection.disabled = true;
            geminiSection.textContent = "Plan Gratuit: Mise à niveau requise pour l'outil IA";
            geminiSection.classList.add('opacity-50', 'cursor-not-allowed');
            geminiSection.classList.remove('gemini-button'); // Assure que le style n'est pas appliqué si désactivé
        } else {
            geminiSection.disabled = false;
            geminiSection.textContent = "Générer 3 Idées de Slogans";
            geminiSection.classList.remove('opacity-50', 'cursor-not-allowed');
            geminiSection.classList.add('gemini-button');
        }
    }
}

// --- LOGIQUE GEMINI (GÉNÉRATEUR DE SLOGANS) ---

const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const API_KEY = ""; // La clé est gérée par l'environnement Canvas

/**
 * Affiche une modale simple pour les messages à l'utilisateur.
 */
function showModal(title, message) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = message;
    document.getElementById('messageModal').classList.remove('hidden');
    document.getElementById('messageModal').classList.add('flex');
}

/**
 * Gère l'appel à l'API Gemini pour générer des slogans.
 */
async function generateSlogans() {
    // 1. Vérification du plan
    if (currentPlan === 'free') {
        showModal('Accès Restreint', "L'outil Gemini est réservé aux plans payants (Journalier et supérieur). Veuillez souscrire à un plan.");
        return;
    }

    const productInput = document.getElementById('productInput');
    const sloganOutput = document.getElementById('sloganOutput');
    const geminiLoader = document.getElementById('geminiLoader');
    const promptValue = productInput.value.trim();

    if (!promptValue) {
        sloganOutput.textContent = "Veuillez entrer une description de produit ou une idée pour générer des slogans.";
        return;
    }

    // 2. Préparation du prompt et de l'affichage
    sloganOutput.textContent = "";
    geminiLoader.classList.remove('hidden');
    
    const systemPrompt = `Vous êtes un expert en marketing publicitaire percutant et créatif. Vous devez générer une liste de 3 slogans courts et mémorables pour le produit décrit. Formatez la sortie en Markdown.`;

    const userQuery = `Génère 3 slogans pour : ${promptValue}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        }
    };

    // 3. Appel à l'API avec Backoff
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur : Slogans non générés par l'IA.";
            
            sloganOutput.textContent = text;
            geminiLoader.classList.add('hidden');
            return; 
            
        } catch (error) {
            attempt++;
            console.warn(`Tentative ${attempt} échouée. Erreur: ${error.message}`);
            
            if (attempt >= MAX_RETRIES) {
                geminiLoader.classList.add('hidden');
                sloganOutput.textContent = "Échec de la génération des slogans après plusieurs tentatives. Veuillez réessayer plus tard.";
                console.error("Échec final de l'appel à l'API Gemini.");
                return;
            }

            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}


// --- GESTION DES ÉVÉNEMENTS DOM ---

window.onload = function () {
    // 1. Logique pour le bouton Gemini
    const generateBtn = document.getElementById('generateSloganBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateSlogans);
    } 

    // 2. Logique pour les boutons de sélection de plan
    const planButtons = document.querySelectorAll('.btn[data-plan]');
    planButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault(); 
            const planId = event.currentTarget.getAttribute('data-plan');
            
            if (planId === 'free') {
                setUserPlan(planId);
            } else {
                showModal('Passer au Paiement', `Vous êtes sur le point de souscrire au plan ${planId.toUpperCase()} pour ${event.currentTarget.closest('.plan').querySelector('.price').textContent}. Ceci mènera à la page de paiement sécurisé. (Simulation)`);
                // En production: Après paiement réussi, appeler setUserPlan(planId);
            }
        });
    });
    
    // 3. Fermeture de la modale
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            document.getElementById('messageModal').classList.add('hidden');
            document.getElementById('messageModal').classList.remove('flex');
        });
    }

    // Mise à jour initiale de l'UI
    if (auth && auth.currentUser) {
        updateUI();
    }
};


