// =================================================================
// src/public/app.js - Logique Principale du Frontend
// Code COMPLET pour l'authentification, l'onboarding et la gestion des produits.
// =================================================================

// -----------------------------------------------------------------
// 1. Dépendances Firebase (Imports)
// -----------------------------------------------------------------
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, collection, getDocs, query, where, limit, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";


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
    
    if (!box) {
        console.error(`Notification Box not found. Message: ${message}, Type: ${type}`);
        return;
    }
    
    // Position et style par défaut
    box.className = 'p-4 rounded-lg shadow-xl text-white font-medium fixed top-4 right-4 z-50';
    box.style.display = 'block';

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
        box.style.display = 'none'; 
    }, 5000);
}


/**
 * Génère un identifiant unique (Ex: JHSMPv12345).
 * @param {string} rolePrefix - 'JHSMPv', 'JHSMPA', ou 'JHSMPa'.
 * @param {string} uid - L'UID Firebase (utilisé pour garantir l'unicité).
 * @returns {string} L'ID personnalisé.
 */
function generateCustomId(rolePrefix, uid) {
    const uniquePart = uid.substring(0, 8).toUpperCase(); 
    return `${rolePrefix}${uniquePart}`;
}


// -----------------------------------------------------------------
// 3. FONCTIONS DE SAUVEGARDE DE L'ONBOARDING
// -----------------------------------------------------------------

/**
 * Sauvegarde les liens sociaux (Vendeur, Affilié, Acheteur) dans Firestore.
 */
async function saveSocialLinks(form, nextUrl) {
    if (!window.auth.currentUser) {
        showNotification("Session expirée. Veuillez vous reconnecter.", 'error');
        setTimeout(() => { window.location.href = 'connexion.html'; }, 1500);
        return;
    }
    
    const uid = window.auth.currentUser.uid;
    const links = [];
    
    for (let i = 1; i <= 5; i++) {
        const link = form[`social_link_${i}`] ? form[`social_link_${i}`].value.trim() : '';
        if (link) links.push(link);
    }
    
    try {
        const userRef = doc(window.db, "users", uid);
        await setDoc(userRef, { 
            socials: links, 
            onboardingComplete: true
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
 */
async function saveAffiliateLinks(form) {
    if (!window.auth.currentUser) {
        window.location.href = 'connexion.html'; 
        return;
    }
    
    const uid = window.auth.currentUser.uid;
    
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
        }, { merge: true });
        
        showNotification("Liens d'affiliation sauvegardés avec succès!", 'success');
        
        setTimeout(() => {
            window.location.href = 'affilié-social.html';
        }, 500);

    } catch (error) {
        showNotification(`Erreur lors de la sauvegarde des liens: ${error.message}`, 'error');
    }
}


// -----------------------------------------------------------------
// 4. LOGIQUE DE GESTION DES PRODUITS (Vendeur)
// -----------------------------------------------------------------

/**
 * Télécharge toutes les images du produit dans Firebase Storage.
 */
async function uploadProductImages(files, productId, vendorId) {
    // Si 'window.app' et 'window.storage' sont initialisés sur la page HTML, c'est mieux.
    if (!window.storage && window.app) {
        window.storage = getStorage(window.app);
    }

    if (!window.storage) {
         throw new Error("Firebase Storage non initialisé. Vérifiez votre page HTML.");
    }
    
    const uploadPromises = [];
    const imageUrls = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(window.storage, `products/${vendorId}/${productId}/${file.name}`);
        
        const uploadPromise = uploadBytes(storageRef, file).then(async (snapshot) => {
            const url = await getDownloadURL(snapshot.ref);
            imageUrls.push(url);
        });
        
        uploadPromises.push(uploadPromise);
    }

    await Promise.all(uploadPromises);
    
    return imageUrls;
}


/**
 * Gère l'ajout d'un nouveau produit (Storage et Firestore).
 */
async function saveNewProduct(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Sauvegarde en cours...";
    
    if (!window.auth.currentUser) {
        showNotification("Session expirée. Veuillez vous reconnecter.", 'error');
        submitButton.disabled = false;
        submitButton.textContent = "Sauvegarder le Produit";
        return;
    }
    
    const vendorId = window.auth.currentUser.uid;
    const imagesInput = document.getElementById('product_images');
    const images = imagesInput.files;

    if (images.length === 0) {
        showNotification("Veuillez télécharger au moins une image de produit.", 'error');
        submitButton.disabled = false;
        submitButton.textContent = "Sauvegarder le Produit";
        return;
    }
    
    try {
        // 1. Créer d'abord un document vide pour obtenir un ID de Produit unique
        const productRef = doc(collection(window.db, "products"));
        const productId = productRef.id;

        // 2. Télécharger les images
        const imageUrls = await uploadProductImages(images, productId, vendorId);

        // 3. Récupérer les autres données du formulaire
        const productData = {
            id: productId,
            vendorId: vendorId,
            name: form.product_name.value.trim(),
            description: form.product_description.value.trim(),
            category: form.product_category.value,
            stock: parseInt(form.product_stock.value, 10),
            
            price: parseFloat(form.selling_price.value),
            cost: parseFloat(form.product_cost.value) || 0,
            affiliateCommissionPercent: parseFloat(form.affiliate_commission.value),
            
            imageUrls: imageUrls, 
            
            status: 'active',
            createdAt: new Date(),
            lastUpdated: new Date()
        };

        // 4. Enregistrer les données complètes du produit dans Firestore
        await setDoc(productRef, productData);
        
        showNotification("Produit enregistré et images téléchargées avec succès !", 'success');

        // 5. Redirection
        setTimeout(() => {
            window.location.href = 'produits-vendeurs.html';
        }, 1500);

    } catch (error) {
        console.error("Erreur lors de l'ajout du produit:", error);
        showNotification(`Erreur critique : Impossible d'enregistrer le produit. ${error.message}`, 'error');
        submitButton.disabled = false;
        submitButton.textContent = "Sauvegarder le Produit";
    }
}


// -----------------------------------------------------------------
// 5. LISTENERS D'ÉVÉNEMENTS (Logique Principale)
// -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // S'assurer que les services Firebase sont chargés
    if (!window.auth || !window.db) return;

    const path = window.location.pathname;

    // --- A. Logique d'Inscription (registerForm) ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitButton = document.getElementById('submit-button');
            submitButton.disabled = true;
            submitButton.textContent = "Inscription en cours...";

            const formData = new FormData(registerForm);
            const email = formData.get('email');
            const password = formData.get('password');
            const confirmPassword = formData.get('confirm_password');
            const fullName = formData.get('full_name');
            const role = formData.get('role') || 'acheteur'; 

            if (password !== confirmPassword) {
                showNotification("Les mots de passe ne correspondent pas.", 'error');
                submitButton.disabled = false;
                submitButton.textContent = "S'inscrire (15 jours offerts aux 25 premiers)";
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
                const user = userCredential.user;
                const uid = user.uid;

                let rolePrefix = (role === 'vendeur') ? 'JHSMPv' : (role === 'affilie') ? 'JHSMPA' : 'JHSMPa';
                const customId = generateCustomId(rolePrefix, uid);
                const referralLink = `${window.location.origin}/inscription.html?ref=${customId}`; 
                
                const now = new Date();
                const trialEnds = new Date(now.setDate(now.getDate() + 15));


                await setDoc(doc(window.db, "users", uid), {
                    fullName: fullName,
                    email: email,
                    role: role,
                    customId: customId,
                    referralLink: referralLink,
                    socials: [], // Laisser vide, rempli lors de l'onboarding
                    affiliateLinks: {}, // Laisser vide
                    isTrial: true,
                    trialEnds: trialEnds,
                    isAdmin: (email === "jeoahs1@gmail.com"), 
                    createdAt: new Date()
                });

                showNotification(`Bienvenue sur JEOAH'S, ${fullName}! Votre compte ${role} est créé.`, 'success');
                
                let redirectUrl;
                if (role === 'vendeur') {
                    redirectUrl = 'fournisseur-step-social.html'; 
                } else if (role === 'affilie') {
                    redirectUrl = 'liens-d-affiliation.html';
                } else {
                    redirectUrl = 'index.html'; 
                }
                
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 2000);


            } catch (error) {
                let errorMessage = "Une erreur inconnue est survenue.";
                if (error.code === 'auth/email-already-in-use') {
                    errorMessage = "Cet email est déjà utilisé. Veuillez vous connecter.";
                } else if (error.code === 'auth/weak-password') {
                    errorMessage = "Le mot de passe est trop faible (6 caractères minimum).";
                }
                
                showNotification(`Erreur: ${errorMessage}`, 'error');
                submitButton.disabled = false;
                submitButton.textContent = "S'inscrire (15 jours offerts aux 25 premiers)";
            }
        });
    }

    // --- B. Logique d'Onboarding (gestion des formulaires post-inscription) ---
    if (path.includes('liens-d-affiliation.html')) {
        const form = document.getElementById('affiliateLinksForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveAffiliateLinks(form); });
        const skipButton = document.getElementById('skipButton');
        if (skipButton) skipButton.addEventListener('click', () => { window.location.href = 'affilié-social.html'; });
    }
    
    if (path.includes('fournisseur-step-social.html')) {
        const form = document.getElementById('supplierSocialForm');
        const nextUrl = 'produits-vendeurs.html';
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveSocialLinks(form, nextUrl); });
        const skipButton = document.getElementById('skipButton');
        if (skipButton) skipButton.addEventListener('click', () => { window.location.href = nextUrl; });
    }

    if (path.includes('affilié-social.html')) {
        const form = document.getElementById('affiliateSocialForm');
        const nextUrl = 'produits-affiliés.html';
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveSocialLinks(form, nextUrl); });
        const skipButton = document.getElementById('skipButton');
        if (skipButton) skipButton.addEventListener('click', () => { window.location.href = nextUrl; });
    }
    
    if (path.includes('acheteur-social-setup.html')) {
        const form = document.getElementById('buyerSocialForm');
        const nextUrl = 'index.html';
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveSocialLinks(form, nextUrl); });
        const skipButton = document.getElementById('skipButton');
        if (skipButton) skipButton.addEventListener('click', () => { window.location.href = nextUrl; });
    }

    // --- C. Logique du Formulaire d'Ajout de Produit (Vendeur) ---
    if (path.includes('configuration-du-vendeur.html')) {
        const form = document.getElementById('productForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveNewProduct(form);
            });
        }
    }

    // --- D. Logique IA (Démo - Simplifiée) ---
    const aiDemoButton = document.getElementById('ai-demo-button');
    if (aiDemoButton) {
        aiDemoButton.addEventListener('click', () => {
            showNotification("La démo IA sera disponible après l'intégration des Cloud Functions!", 'info');
        });
    }
});
