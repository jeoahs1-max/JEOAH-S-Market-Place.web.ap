// --- MODULES FIREBASE (Version 11.6.1 OBLIGATOIRE pour la compatibilité CDN) ---
import { initializeApp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ET INITIALISATION FIREBASE (MANDATORY) ---
// Récupération des variables globales de l'environnement Canvas
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

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
                // Fallback en connexion anonyme si le token échoue
                signInAnonymously(auth).then(() => console.log("Connexion Firebase anonyme réussie après échec token.")).catch(e => console.error("Erreur de connexion anonyme:", e));
            });
    } else {
        signInAnonymously(auth)
            .then(() => console.log("Connexion Firebase anonyme réussie."))
            .catch(error => console.error("Erreur de connexion anonyme :", error));
    }
} else {
    console.error("Firebase n'a pas pu être initialisé : configuration manquante.");
}

// --- FONCTIONS UTILITAIRES (Implémentations de base pour la PoC) ---

/** Affiche une notification (simulée via console et un élément DOM s'il existe) */
function displayNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]: ${message}`);
    const notificationBox = document.getElementById('notificationBox');
    if (notificationBox) {
        // Crée une notification visible temporaire
        const div = document.createElement('div');
        div.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-xl text-white z-50 transition-opacity duration-300 ${type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`;
        div.textContent = message;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    }
}

/** Formate le prix en USD (locale FR pour les décimales) */
function formatPrice(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
    // Utilisation de la devise USD avec le formatage français pour le séparateur de décimales (virgule)
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

// --- VARIABLES GLOBALES DE L'APPLICATION ---
let currentAffiliateId = null;
let JEOAHS_FEE_RATE = 0.03; // 3% de frais de plateforme

// =========================================================================
// SECTION 1: Enregistrement et Rôles (register.html)
// =========================================================================

const registrationForm = document.getElementById('registrationForm');
if (registrationForm) {
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = registrationForm.email.value;
        const password = registrationForm.password.value;
        // J'ajoute l'accès au champ de confirmation
        const confirmPassword = registrationForm.confirmPassword ? registrationForm.confirmPassword.value : password; 
        const fullName = registrationForm.fullName.value;
        const role = registrationForm.role.value;

        // VERIFICATION AJOUTÉE: Les mots de passe doivent correspondre
        if (password !== confirmPassword) {
            displayNotification("Les mots de passe ne correspondent pas.", 'error');
            return;
        }

        if (password.length < 6) {
            displayNotification("Le mot de passe doit contenir au moins 6 caractères.", 'error');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Enregistrer l'utilisateur dans Firestore
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: email,
                fullName: fullName,
                role: role,
                isConfigured: false, // Flag de configuration
                createdAt: new Date()
            });

            displayNotification(`Inscription réussie en tant que ${role}! Redirection...`, 'success');
            
            // Redirection en fonction du rôle
            handleRoleRedirection(role);

        } catch (error) {
            console.error("Erreur d'inscription:", error);
            if (error.code === 'auth/email-already-in-use') {
                displayNotification("Cet email est déjà utilisé. Veuillez vous connecter.", 'error');
            } else {
                displayNotification(`Erreur d'inscription: ${error.message}`, 'error');
            }
        }
    });
}
// =========================================================================
// SECTION 2: Connexion (login.html)
// =========================================================================

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            displayNotification("Connexion réussie! Redirection...", 'success');
            
            // Récupérer le rôle de l'utilisateur
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                handleRoleRedirection(userData.role);
            } else {
                // Par défaut, si le rôle n'est pas trouvé (ce qui ne devrait pas arriver)
                window.location.href = 'vitrine.html'; 
            }

        } catch (error) {
            console.error("Erreur de connexion:", error);
            if (error.code === 'auth/invalid-email' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                displayNotification("Email ou mot de passe incorrect.", 'error');
            } else {
                displayNotification(`Erreur de connexion: ${error.message}`, 'error');
            }
        }
    });
}

// =========================================================================
// SECTION 3: Configuration (Onboarding)
// =========================================================================

// Cette fonction n'est plus utilisée pour la redirection dans 'onAuthStateChanged'
// car la redirection est gérée directement dans le listener principal.
/*
async function checkUserConfiguration(user) {
    // ... code original ...
}
*/

function handleRoleRedirection(role) {
    // Les redirections pour la configuration si l'utilisateur est nouveau
    if (role === 'vendeur') {
        window.location.href = 'vendor-setup.html'; 
    } else if (role === 'affilie') { // CORRIGÉ: Utiliser 'affilie' au lieu de 'affilié' pour correspondre au formulaire
        window.location.href = 'affiliate-social.html'; 
    } else {
        // Acheteur ou Rôle non défini => vers l'étape sociale simple
        window.location.href = 'acheteur-social-setup.html';
    }
}

// Formulaire de configuration Acheteur (acheteur-social-setup.html)
const buyerSocialForm = document.getElementById('buyerSocialForm');
if (buyerSocialForm) {
    buyerSocialForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;
        
        const socialData = {
            social_link_1: buyerSocialForm.social_link_1 ? buyerSocialForm.social_link_1.value : '',
            // ... autres liens sociaux
            isConfigured: true, 
            // Conserver le rôle initial
        };

        try {
            await updateDoc(doc(db, "users", user.uid), socialData);
            displayNotification("Configuration du profil réussie !", 'success');
            window.location.href = 'vitrine.html';
        } catch (error) {
            displayNotification(`Erreur lors de la sauvegarde: ${error.message}`, 'error');
        }
    });
    
    // Logique pour le bouton Sauter
    const skipBuyerSocialButton = document.getElementById('skipBuyerSocialButton');
    if (skipBuyerSocialButton) {
        skipBuyerSocialButton.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                // Seulement marquer comme configuré sans enregistrer les données sociales
                await updateDoc(doc(db, "users", user.uid), { isConfigured: true }); 
                displayNotification("Configuration sautée. Redirection vers la vitrine.");
                window.location.href = 'vitrine.html';
            } catch (error) {
                displayNotification(`Erreur lors du saut: ${error.message}`, 'error');
            }
        });
    }
}

// Formulaire de configuration Affilié (affiliate-social.html)
const affiliateSocialForm = document.getElementById('affiliateSocialForm');
if (affiliateSocialForm) {
    affiliateSocialForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const socialData = {
            facebook: affiliateSocialForm.facebook.value,
            instagram: affiliateSocialForm.instagram.value,
            tiktok: affiliateSocialForm.tiktok.value,
            youtube: affiliateSocialForm.youtube.value,
            isConfigured: true,
        };

        try {
            await updateDoc(doc(db, "users", user.uid), socialData);
            displayNotification("Configuration du profil réussie ! Redirection vers le tableau de bord.", 'success');
            window.location.href = 'affiliate-dashboard.html'; 
        } catch (error) {
            displayNotification(`Erreur lors de la sauvegarde: ${error.message}`, 'error');
        }
    });

    const skipButton = document.getElementById('skipButton');
    if (skipButton) {
        skipButton.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                await updateDoc(doc(db, "users", user.uid), { isConfigured: true });
                displayNotification("Configuration sautée. Redirection vers le tableau de bord.");
                window.location.href = 'affiliate-dashboard.html'; 
            } catch (error) {
                displayNotification(`Erreur lors du saut: ${error.message}`, 'error');
            }
        });
    }
}


// Formulaire de configuration Vendeur (vendor-setup.html)
const vendorConfigForm = document.getElementById('vendorConfigForm');
if (vendorConfigForm) {
    vendorConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;
        
        const selectedPlan = document.querySelector('input[name="adPlan"]:checked');
        if (!selectedPlan) {
            displayNotification("Veuillez sélectionner un plan d'abonnement.", 'error');
            return;
        }

        try {
            await updateDoc(doc(db, "users", user.uid), {
                shopName: vendorConfigForm.shopName.value,
                shopDescription: vendorConfigForm.shopDescription.value,
                adPlan: selectedPlan.value,
                isConfigured: true
            });

            displayNotification("Configuration de la boutique réussie ! Redirection vers la gestion des produits.", 'success');
            window.location.href = 'vendor-products.html'; 
        } catch (error) {
            displayNotification(`Erreur lors de la sauvegarde: ${error.message}`, 'error');
        }
    });
}

// =========================================================================
// SECTION 4: Affichage des Plans (vendor-setup.html)
// =========================================================================

async function displayAdPlans() {
    const plansContainer = document.getElementById('plansContainer');
    if (!plansContainer) return;

    try {
        const plansSnapshot = await getDocs(collection(db, "ad_plans"));
        
        if (plansSnapshot.empty) {
            plansContainer.innerHTML = '<p class="text-red-500">Aucun plan d\'abonnement trouvé. Créez la collection "ad_plans" dans Firestore.</p>';
            return;
        }

        plansContainer.innerHTML = ''; // Vider le conteneur
        
        plansSnapshot.forEach(doc => {
            const plan = doc.data();
            const planId = doc.id;
            
            const div = document.createElement('div');
            div.className = "p-4 border rounded-lg shadow-sm hover:border-indigo-600 transition cursor-pointer";
            div.innerHTML = `
                <label for="${planId}" class="flex justify-between items-center cursor-pointer">
                    <div class="flex items-center">
                        <input type="radio" id="${planId}" name="adPlan" value="${planId}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500" required>
                        <span class="ml-3 font-medium text-gray-900">${plan.name}</span>
                    </div>
                    <span class="font-bold text-indigo-600">${formatPrice(plan.price)}</span>
                </label>
                <p class="text-sm text-gray-500 mt-1 ml-7">${plan.description}</p>
            `;
            plansContainer.appendChild(div);

            // Gérer le clic sur la div pour sélectionner le radio (UX)
            div.addEventListener('click', () => {
                document.getElementById(planId).checked = true;
            });
        });

    } catch (error) {
        plansContainer.innerHTML = `<p class="text-red-500">Erreur de chargement des plans : ${error.message}</p>`;
    }
}

// =========================================================================
// SECTION 5: Gestion des Produits (vendor-products.html et modification)
// =========================================================================

const productForm = document.getElementById('productForm');
const productFormContainer = document.getElementById('productFormContainer');
const addProductButton = document.getElementById('addProductButton');
const cancelFormButton = document.getElementById('cancelFormButton');

if (addProductButton) {
    addProductButton.addEventListener('click', () => {
        productFormContainer.classList.remove('hidden');
        document.getElementById('formTitle').textContent = 'Ajouter un Produit';
        productForm.reset();
        // Le champ hidden 'productId' doit être réinitialisé
        const productIdField = productForm.querySelector('[name="productId"]');
        if (productIdField) {
            productIdField.value = ''; 
        }
    });
}

if (cancelFormButton) {
    cancelFormButton.addEventListener('click', () => {
        productFormContainer.classList.add('hidden');
    });
}

if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            displayNotification("Veuillez vous connecter.", 'error');
            return;
        }
        
        const productIdField = productForm.querySelector('[name="productId"]');
        const productId = productIdField ? productIdField.value : null;

        const productData = {
            userId: user.uid,
            name: productForm.name.value,
            price: parseFloat(productForm.price.value),
            commissionRate: parseInt(productForm.commissionRate.value),
            description: productForm.description.value,
            // Si c'est un nouvel ajout, la date de création est maintenant. Sinon, elle sera mise à jour/conservée.
            createdAt: productId ? productForm.createdAt.value : new Date(), 
            updatedAt: new Date()
        };

        try {
            if (productId) {
                // Modification
                const productRef = doc(db, "products", productId);
                await updateDoc(productRef, productData);
                displayNotification("Produit mis à jour avec succès!", 'success');
            } else {
                // Ajout
                await addDoc(collection(db, "products"), productData);
                displayNotification("Produit ajouté avec succès!", 'success');
                productForm.reset();
            }
            productFormContainer.classList.add('hidden');
            displayVendorProducts(); // Rafraîchir la liste
        } catch (error) {
            displayNotification(`Erreur de sauvegarde du produit: ${error.message}`, 'error');
        }
    });
}

async function displayVendorProducts() {
    const listContainer = document.getElementById('vendorProductsList');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Chargement des produits...</p>';
    const user = auth.currentUser;
    if (!user) {
        listContainer.innerHTML = '<p class="text-red-500 text-center py-10">Veuillez vous connecter pour voir vos produits.</p>';
        return;
    }

    try {
        const q = query(collection(db, "products"), where("userId", "==", user.uid));
        const productsSnapshot = await getDocs(q);
        
        if (productsSnapshot.empty) {
            listContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Vous n\'avez pas encore ajouté de produit.</p>';
            return;
        }

        listContainer.innerHTML = ''; // Vider le message de chargement

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const productId = doc.id;
            
            const div = document.createElement('div');
            div.className = "bg-white p-4 rounded-lg shadow flex justify-between items-center border-l-4 border-indigo-600";
            div.innerHTML = `
                <div>
                    <h3 class="text-lg font-semibold text-gray-900">${product.name}</h3>
                    <p class="text-sm text-gray-600">${product.description.substring(0, 50)}...</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-bold text-indigo-600">${formatPrice(product.price)}</p>
                    <p class="text-xs text-green-600">Comm. Affilié: ${product.commissionRate}%</p>
                </div>
                <div class="flex space-x-2">
                    <button data-id="${productId}" class="edit-btn py-1 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">Modifier</button>
                    <button data-id="${productId}" class="delete-btn py-1 px-3 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition">Supprimer</button>
                </div>
            `;
            listContainer.appendChild(div);
        });

        // Ajouter les écouteurs pour modifier/supprimer
        listContainer.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = e.target.dataset.id;
                // Rediriger vers la page de modification
                window.location.href = `edit-product.html?id=${productId}`; 
            });
        });

        listContainer.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = e.target.dataset.id;
                
                // CORRECTION CRITIQUE: Remplacement de window.confirm() par une notification
                displayNotification("Produit en cours de suppression...", 'error');
                deleteProduct(productId);
                // NOTE: Dans une application réelle, une modale HTML personnalisée serait utilisée pour la confirmation.
            });
        });

    } catch (error) {
        listContainer.innerHTML = `<p class="text-red-500 text-center py-10">Erreur de chargement des produits: ${error.message}</p>`;
    }
}

async function deleteProduct(productId) {
    try {
        await deleteDoc(doc(db, "products", productId));
        displayNotification("Produit supprimé avec succès.", 'success');
        displayVendorProducts(); // Rafraîchir
    } catch (error) {
        displayNotification(`Erreur de suppression: ${error.message}`, 'error');
    }
}

// =========================================================================
// SECTION 6: Générateur de Liens Affiliés (affiliate-links.html)
// =========================================================================

async function displayAffiliateProductsForLink() {
    const selectElement = document.getElementById('productSelect');
    if (!selectElement) return;

    try {
        // Récupérer uniquement les produits configurés (dans un vrai scénario)
        const productsSnapshot = await getDocs(collection(db, "products"));
        
        selectElement.innerHTML = '<option value="">-- Choisir un produit --</option>';

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            // Utiliser le nom du vendeur si possible, sinon l'UID
            const vendorId = product.userId.substring(0, 4);
            option.textContent = `${product.name} (Vendeur: ${vendorId}...) - ${formatPrice(product.price)} | Comm: ${product.commissionRate}%`;
            selectElement.appendChild(option);
        });

    } catch (error) {
        displayNotification(`Erreur de chargement des produits: ${error.message}`, 'error');
    }
}

const linkGeneratorForm = document.getElementById('linkGeneratorForm');
if (linkGeneratorForm) {
    linkGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            displayNotification("Veuillez vous connecter en tant qu'affilié.", 'error');
            return;
        }

        const productId = linkGeneratorForm.productSelect.value;
        if (!productId) {
            displayNotification("Veuillez sélectionner un produit.", 'error');
            return;
        }

        // Simuler la construction de l'URL du produit
        const baseURL = window.location.origin;
        // Le lien doit pointer vers produit.html avec l'ID du produit et l'ID de l'affilié
        const affiliateLink = `${baseURL}/product.html?id=${productId}&affid=${user.uid}`; 
        
        document.getElementById('affiliateLinkOutput').value = affiliateLink;
        document.getElementById('generatedLinkContainer').classList.remove('hidden');
        displayNotification("Lien généré ! Copiez-le et partagez-le.", 'info');

        // Enregistrer le clic (simulé) de génération
        await addDoc(collection(db, "affiliate_clicks"), {
            affiliateId: user.uid,
            productId: productId,
            timestamp: new Date(),
            type: 'generate'
        });
    });
}

// =========================================================================
// SECTION 7: Panier (cart.html)
// =========================================================================

// Fonction pour récupérer l'affiliate ID depuis l'URL (si présent)
function getAffiliateIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const affid = urlParams.get('affid');
    if (affid) {
        // Enregistrer l'ID dans le storage pour la session
        sessionStorage.setItem('affiliateId', affid);
        displayNotification(`[Affiliation] Vous suivez l'affilié ${affid.substring(0, 8)}...`, 'info');

        // Enregistrer le clic de tracking
        const productId = urlParams.get('id');
        if (productId) {
            // Logique de tracking pour le tableau de bord affilié
            addDoc(collection(db, "affiliate_clicks"), {
                affiliateId: affid,
                productId: productId,
                timestamp: new Date(),
                type: 'click'
            });
        }
        
    }
    // Mise à jour de la variable globale avec l'ID en session
    currentAffiliateId = sessionStorage.getItem('affiliateId');
}

// Fonction pour ajouter un produit au panier (à utiliser sur product.html)
async function addToCart(productId) {
    const cartItems = JSON.parse(localStorage.getItem('cart') || '[]');
    
    // Récupérer les détails du produit
    try {
        const productDoc = await getDoc(doc(db, "products", productId));
        if (!productDoc.exists()) {
            displayNotification("Produit non trouvé.", 'error');
            return;
        }
        const product = productDoc.data();
        product.id = productId; // Ajouter l'ID
        
        // Simuler l'ajout
        const existingItem = cartItems.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            // IMPORTANT: Stocker une copie propre des détails du produit
            cartItems.push({ 
                id: productId, 
                quantity: 1, 
                productDetails: {
                    name: product.name,
                    price: product.price,
                    commissionRate: product.commissionRate,
                    userId: product.userId,
                    description: product.description.substring(0, 50) + '...' // Limiter les données stockées
                } 
            });
        }
        
        localStorage.setItem('cart', JSON.stringify(cartItems));
        displayNotification(`${product.name} ajouté au panier !`, 'success');
        
        // Mise à jour du compteur de panier si un élément le gère
        // updateCartCount();
        
    } catch (error) {
        displayNotification(`Erreur lors de l'ajout au panier: ${error.message}`, 'error');
    }
}


// Affichage du panier (panier.html)
function displayCartItems() {
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const cartSummary = document.getElementById('cartSummary');
    const checkoutButton = document.getElementById('checkoutButton');
    
    if (!cartItemsContainer || !cartSummary) return;

    const cartItems = JSON.parse(localStorage.getItem('cart') || '[]');
    cartItemsContainer.innerHTML = '';
    
    let subtotal = 0;
    
    if (cartItems.length === 0) {
        cartItemsContainer.innerHTML = '<p class="text-gray-500 text-center py-10">Votre panier est vide.</p>';
        if (checkoutButton) checkoutButton.disabled = true;
        updateSummary(0);
        return;
    }

    cartItems.forEach(item => {
        const product = item.productDetails;
        const total = product.price * item.quantity;
        subtotal += total;

        const div = document.createElement('div');
        div.className = "bg-white p-4 rounded-xl shadow flex justify-between items-center border-l-4 border-indigo-600 mb-3";
        div.innerHTML = `
            <div>
                <h3 class="text-lg font-semibold text-gray-900">${product.name}</h3>
                <p class="text-sm text-gray-600">${formatPrice(product.price)} x ${item.quantity}</p>
            </div>
            <div class="text-right">
                <p class="text-xl font-bold text-indigo-600">${formatPrice(total)}</p>
                <p class="text-xs text-red-500">Commission: ${product.commissionRate}%</p>
            </div>
            <button data-id="${item.id}" class="remove-btn text-red-500 hover:text-red-700 transition">Retirer</button>
        `;
        cartItemsContainer.appendChild(div);
    });

    // Écouteurs pour retirer un article
    cartItemsContainer.querySelectorAll('.remove-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = e.target.dataset.id;
            removeFromCart(productId);
        });
    });

    updateSummary(subtotal);
    if (checkoutButton) checkoutButton.disabled = false;
}

function removeFromCart(productId) {
    let cartItems = JSON.parse(localStorage.getItem('cart') || '[]');
    cartItems = cartItems.filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cartItems));
    displayNotification("Article retiré du panier.");
    displayCartItems(); // Rafraîchir
}

function updateSummary(subtotal) {
    const summarySubtotalEl = document.getElementById('summarySubtotal');
    const summaryFeesEl = document.getElementById('summaryFees');
    const summaryTotalEl = document.getElementById('summaryTotal');
    
    if (!summarySubtotalEl || !summaryFeesEl || !summaryTotalEl) return;
    
    const fees = subtotal * JEOAHS_FEE_RATE;
    const total = subtotal + fees;
    
    summarySubtotalEl.textContent = formatPrice(subtotal);
    summaryFeesEl.textContent = formatPrice(fees);
    summaryTotalEl.textContent = formatPrice(total);
}

// =========================================================================
// SECTION 8: Passer la Commande (panier.html)
// =========================================================================

const checkoutButton = document.getElementById('checkoutButton');
if (checkoutButton) {
    checkoutButton.addEventListener('click', async () => {
        const cartItems = JSON.parse(localStorage.getItem('cart') || '[]');
        if (cartItems.length === 0) {
            displayNotification("Le panier est vide.", 'error');
            return;
        }

        let totalSubtotal = 0;
        let commissions = [];
        let orderItems = [];

        for (const item of cartItems) {
            // Recharger les données complètes du produit pour la commande finale
            const productDoc = await getDoc(doc(db, "products", item.id));
            if (!productDoc.exists()) continue;
            const product = productDoc.data();
            
            const itemSubtotal = product.price * item.quantity;
            totalSubtotal += itemSubtotal;
            
            // Calculer la commission pour chaque produit
            const commissionAmount = itemSubtotal * (product.commissionRate / 100);
            
            // Ajouter à la liste des commissions (si un affilié a été tracké)
            if (currentAffiliateId) {
                commissions.push({
                    affiliateId: currentAffiliateId,
                    productId: item.id,
                    amount: commissionAmount,
                    vendorId: product.userId,
                    saleAmount: itemSubtotal
                });
            }

            orderItems.push({
                productId: item.id,
                quantity: item.quantity,
                price: product.price,
                vendorId: product.userId,
                commissionRate: product.commissionRate
            });
        }
        
        const totalFees = totalSubtotal * JEOAHS_FEE_RATE;
        const total = totalSubtotal + totalFees;

        try {
            // Créer la commande principale
            const orderRef = await addDoc(collection(db, "orders"), {
                userId: auth.currentUser ? auth.currentUser.uid : 'guest',
                items: orderItems,
                subtotal: totalSubtotal,
                fees: totalFees,
                total: total,
                status: 'Completed',
                createdAt: new Date(),
                affiliateId: currentAffiliateId || null // Enregistrer l'affilié tracké
            });

            // Enregistrer les commissions
            for (const comm of commissions) {
                await addDoc(collection(db, "commissions"), {
                    ...comm,
                    orderId: orderRef.id,
                    createdAt: new Date(),
                    status: 'Pending'
                });
            }

            // Vider le panier
            localStorage.removeItem('cart');
            sessionStorage.removeItem('affiliateId');
            currentAffiliateId = null;

            displayNotification(`Commande #${orderRef.id.substring(0, 6)} créée avec succès ! Total payé: ${formatPrice(total)}`, 'success');
            displayCartItems(); // Rafraîchir le panier vide
            
        } catch (error) {
            displayNotification(`Erreur lors du paiement: ${error.message}`, 'error');
        }
    });
}

// =========================================================================
// SECTION 9: Dashboard Vendeur (vendor-orders.html)
// =========================================================================

async function displayVendorOrders() {
    const ordersListContainer = document.getElementById('vendorOrdersList');
    const totalNetRevenueEl = document.getElementById('totalNetRevenue');
    const pendingOrdersCountEl = document.getElementById('pendingOrdersCount');
    const completedOrdersCountEl = document.getElementById('completedOrdersCount');
    
    if (!ordersListContainer) return;
    
    const user = auth.currentUser;
    if (!user) {
        ordersListContainer.innerHTML = '<p class="text-red-500 text-center py-10">Veuillez vous connecter.</p>';
        return;
    }

    ordersListContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Chargement de vos commandes...</p>';

    try {
        const ordersRef = collection(db, "orders");

        let totalRevenue = 0;
        let pendingCount = 0;
        let completedCount = 0;
        
        const allOrdersSnapshot = await getDocs(ordersRef); 
        ordersListContainer.innerHTML = '';
        let foundOrders = false;
        
        allOrdersSnapshot.forEach(orderDoc => {
            const order = orderDoc.data();
            const orderId = orderDoc.id;
            let vendorSale = 0;
            let vendorCommission = 0;
            let netRevenue = 0;
            
            // Filtrer les articles pour ce vendeur
            const vendorItems = order.items.filter(item => item.vendorId === user.uid);
            
            if (vendorItems.length > 0) {
                foundOrders = true;
                vendorItems.forEach(item => {
                    vendorSale += item.price * item.quantity;
                    vendorCommission += (item.price * item.quantity) * (item.commissionRate / 100);
                });
                
                // Calcul du revenu net : Ventes - Commissions - Frais JEOAH'S sur la vente
                const jeoahsFee = vendorSale * JEOAHS_FEE_RATE;
                netRevenue = vendorSale - vendorCommission - jeoahsFee;
                totalRevenue += netRevenue;

                // Affichage
                const div = document.createElement('div');
                div.className = "bg-white p-4 rounded-lg shadow-sm mb-4 border-l-4 border-yellow-500";
                div.innerHTML = `
                    <p class="font-bold">Commande #${orderId.substring(0, 6)} - ${order.createdAt && order.createdAt.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                    <p class="text-sm">Articles vendus: ${vendorItems.length}</p>
                    <p class="text-sm">Vente brute: ${formatPrice(vendorSale)}</p>
                    <p class="text-sm text-red-500">Commissions versées: ${formatPrice(vendorCommission)}</p>
                    <p class="text-sm text-red-500">Frais JEOAH'S (3%): ${formatPrice(jeoahsFee)}</p>
                    <p class="font-bold text-green-600 mt-1">Revenu Net: ${formatPrice(netRevenue)}</p>
                `;
                ordersListContainer.appendChild(div);

                if (order.status === 'Completed') completedCount++; else pendingCount++;
            }
        });

        if (!foundOrders) {
            ordersListContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Aucune commande trouvée pour vos produits.</p>';
        }

        // Mettre à jour les statistiques
        if(totalNetRevenueEl) totalNetRevenueEl.textContent = formatPrice(totalRevenue);
        if(pendingOrdersCountEl) pendingOrdersCountEl.textContent = pendingCount;
        if(completedOrdersCountEl) completedOrdersCountEl.textContent = completedCount;

    } catch (error) {
        ordersListContainer.innerHTML = `<p class="text-red-500 text-center py-10">Erreur de chargement des commandes: ${error.message}</p>`;
    }
}

// =========================================================================
// SECTION 10: Dashboard Affilié (affiliate-dashboard.html)
// =========================================================================

async function displayAffiliateDashboard() {
    const transactionsListContainer = document.getElementById('affiliateTransactionsList');
    const totalCommissionsEl = document.getElementById('totalCommissions');
    const totalSalesEl = document.getElementById('totalSales');
    const totalClicksEl = document.getElementById('totalClicks');
    
    if (!transactionsListContainer) return;

    const user = auth.currentUser;
    if (!user) {
        transactionsListContainer.innerHTML = '<p class="text-red-500 text-center py-10">Veuillez vous connecter.</p>';
        return;
    }

    transactionsListContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Chargement de vos transactions...</p>';
    let totalCommissions = 0;
    let totalSales = 0;
    let totalClicks = 0;

    try {
        // 1. Récupérer les Commissions
        const commissionsQ = query(collection(db, "commissions"), where("affiliateId", "==", user.uid));
        const commissionsSnapshot = await getDocs(commissionsQ);
        
        transactionsListContainer.innerHTML = '';
        
        if (commissionsSnapshot.empty) {
            transactionsListContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Aucune commission trouvée.</p>';
        } else {
            commissionsSnapshot.forEach(doc => {
                const commission = doc.data();
                totalCommissions += commission.amount;
                totalSales += 1; // Chaque commission représente une vente

                const div = document.createElement('div');
                div.className = "bg-white p-4 rounded-lg shadow-sm mb-4 border-l-4 border-green-600";
                div.innerHTML = `
                    <p class="font-bold text-green-600">${formatPrice(commission.amount)}</p>
                    <p class="text-sm text-gray-600">Vente de ${formatPrice(commission.saleAmount)} (Produit: ${commission.productId.substring(0, 6)}...)</p>
                    <p class="text-xs text-gray-400">Commande #${commission.orderId.substring(0, 6)} - ${commission.createdAt && commission.createdAt.seconds ? new Date(commission.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                `;
                transactionsListContainer.appendChild(div);
            });
        }

        // 2. Récupérer les Clics
        const clicksQ = query(collection(db, "affiliate_clicks"), where("affiliateId", "==", user.uid));
        const clicksSnapshot = await getDocs(clicksQ);
        totalClicks = clicksSnapshot.size;

        // Mettre à jour les statistiques
        if (totalCommissionsEl) totalCommissionsEl.textContent = formatPrice(totalCommissions);
        if (totalSalesEl) totalSalesEl.textContent = totalSales;
        if (totalClicksEl) totalClicksEl.textContent = totalClicks;

        // Lancer l'analyse de tendance (Section 12)
        displayAffiliateTrendAnalysis();

    } catch (error) {
        transactionsListContainer.innerHTML = `<p class="text-red-500 text-center py-10">Erreur de chargement du tableau de bord: ${error.message}</p>`;
    }
}

// =========================================================================
// SECTION 11: Vitrine et Détails Produit (vitrine.html et product.html)
// =========================================================================

// Affichage de la vitrine
async function displayVitrineProducts() {
    const listContainer = document.getElementById('vitrineProductsList');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Chargement de la vitrine...</p>';
    
    try {
        const productsSnapshot = await getDocs(collection(db, "products"));
        
        if (productsSnapshot.empty) {
            listContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Aucun produit disponible pour le moment.</p>';
            return;
        }

        listContainer.innerHTML = ''; // Vider le message de chargement

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const productId = doc.id;
            
            const a = document.createElement('a');
            // Lien vers la page produit
            a.href = `product.html?id=${productId}`; 
            a.className = "block bg-white p-4 rounded-xl shadow hover:shadow-lg transition";
            a.innerHTML = `
                <h3 class="text-xl font-semibold text-gray-900 truncate">${product.name}</h3>
                <p class="mt-2 text-3xl font-bold text-indigo-600">${formatPrice(product.price)}</p>
                <p class="text-sm text-gray-500 mt-1">${product.description.substring(0, 80)}...</p>
                <p class="text-xs text-green-600 mt-2">Commission Affilié: ${product.commissionRate}%</p>
                <button class="w-full mt-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">Voir les détails</button>
            `;
            listContainer.appendChild(a);
        });

    } catch (error) {
        listContainer.innerHTML = `<p class="text-red-500 text-center py-10">Erreur de chargement de la vitrine: ${error.message}</p>`;
    }
}

// Affichage des détails du produit (product.html)
async function displayProductDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const container = document.getElementById('productDetailsContainer');
    const addToCartBtn = document.getElementById('addToCartButton');

    if (!productId || !container) return;
    
    container.innerHTML = '<p class="text-center py-10 text-gray-500">Chargement des détails du produit...</p>';

    try {
        const productDoc = await getDoc(doc(db, "products", productId));
        if (!productDoc.exists()) {
            container.innerHTML = '<p class="text-red-500 text-center py-10">Produit non trouvé.</p>';
            return;
        }

        const product = productDoc.data();
        
        // Tenter de charger le nom du vendeur
        let vendorName = product.userId.substring(0, 8) + '...';
        try {
            const vendorDoc = await getDoc(doc(db, "users", product.userId));
            if(vendorDoc.exists() && vendorDoc.data().shopName) {
                vendorName = vendorDoc.data().shopName;
            }
        } catch (e) {
            console.error("Erreur de récupération du nom du vendeur:", e);
        }
        
        container.innerHTML = `
            <div class="lg:flex lg:space-x-8">
                <div class="lg:w-2/3">
                    <h1 class="text-4xl font-bold text-gray-900 mb-4">${product.name}</h1>
                    <p class="text-xl font-semibold text-indigo-600 mb-6">${formatPrice(product.price)}</p>
                    <h2 class="text-2xl font-semibold border-b pb-2 mb-4">Description</h2>
                    <p class="text-gray-700 whitespace-pre-wrap">${product.description}</p>
                </div>
                <div class="lg:w-1/3 mt-8 lg:mt-0 bg-white p-6 rounded-xl shadow-lg h-fit">
                    <h2 class="text-2xl font-semibold mb-4 border-b pb-2">Informations Clés</h2>
                    <div class="space-y-3">
                        <p>Vendeur: <span class="font-medium text-gray-700">${vendorName}</span></p>
                        <p>Commission Affilié: <span class="font-medium text-green-600">${product.commissionRate}%</span></p>
                        <p class="text-sm text-gray-500">Le commission est reversée à l'affilié qui vous a envoyé ici.</p>
                    </div>
                </div>
            </div>
        `;

        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
                addToCart(productId);
            });
        }
        
    } catch (error) {
        container.innerHTML = `<p class="text-red-500 text-center py-10">Erreur de chargement: ${error.message}</p>`;
    }
}

// =========================================================================
// SECTION 12: Ney IA (Simulation d'Analyse de Tendance)
// =========================================================================

async function displayAffiliateTrendAnalysis() {
    const container = document.getElementById('affiliateAdviceContainer');
    if (!container) return;
    
    // NOTE: Ceci est une simulation. Le véritable Ney IA nécessiterait une API de Machine Learning.
    
    // Simuler des données de tendance basées sur les clics/ventes
    const user = auth.currentUser;
    if (!user) return;
    
    const commissionsQ = query(collection(db, "commissions"), where("affiliateId", "==", user.uid));
    const salesSnapshot = await getDocs(commissionsQ);
    const totalSales = salesSnapshot.size;

    let advice = "";

    if (totalSales >= 5) {
        advice = "🚀 **Performance Exceptionnelle**! Votre contenu est très engageant. Continuez à cibler ces mêmes niches pour maximiser vos revenus !";
    } else if (totalSales > 0) {
        advice = "🎯 **Bon Départ !** Vos premières ventes sont un succès. Essayez de créer plus de contenu sur les produits qui vous ont rapporté une commission.";
    } else {
        advice = "💡 **Optimisation Recommandée.** Ney n'a pas encore détecté de ventes. Concentrez-vous sur un seul produit, et assurez-vous que votre lien est bien visible sur vos plateformes sociales.";
    }

    container.innerHTML = `
        <div class="bg-indigo-50 p-6 rounded-xl shadow-lg border-l-4 border-indigo-600">
            <h2 class="text-xl font-bold text-indigo-800 flex items-center mb-2">
                <i class="fas fa-brain mr-3"></i> Analyse de Tendance Ney (IA)
            </h2>
            <p class="text-gray-700">${advice}</p>
        </div>
    `;
}

// =========================================================================
// SECTION 13: Gestion de l'Authentification et Navigation
// =========================================================================

onAuthStateChanged(auth, (user) => {
    const authLinks = document.getElementById('auth-links');
    const roleLinks = document.getElementById('role-links');
    if (!authLinks || !roleLinks) return;
    
    authLinks.innerHTML = '';
    roleLinks.innerHTML = '';

    if (user) {
        // Utilisateur connecté
        
        // 1. Déconnexion
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Déconnexion';
        logoutButton.className = 'py-1 px-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm';
        logoutButton.addEventListener('click', async () => {
            await signOut(auth);
            // Vider l'état du panier/affilié en local pour la sécurité
            localStorage.removeItem('cart');
            sessionStorage.removeItem('affiliateId');
            window.location.href = 'index.html';
        });
        authLinks.appendChild(logoutButton);

        // 2. Liens de Rôle (Dashboard/Panier)
        const userDocRef = doc(db, "users", user.uid);
        getDoc(userDocRef).then(userDoc => {
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const userRole = userData.role;
                
                // Rediriger vers la configuration si non configuré
                if (!userData.isConfigured && 
                    !window.location.pathname.includes('-setup.html') &&
                    !window.location.pathname.includes('-social.html')) {
                    
                    if (userRole === 'vendeur') {
                        window.location.href = 'vendor-setup.html'; 
                    } else if (userRole === 'affilie') {
                        window.location.href = 'affiliate-social.html'; 
                    } else if (userRole === 'acheteur') {
                        window.location.href = 'acheteur-social-setup.html';
                    }
                    return; // Ne pas afficher les liens si on redirige
                }
                
                let linkHTML = '';
                
                if (userRole === 'vendeur') {
                    linkHTML = `
                        <a href="vendor-products.html" class="text-gray-700 hover:text-indigo-600 mr-4">Mes Produits</a>
                        <a href="vendor-orders.html" class="text-gray-700 hover:text-indigo-600 mr-4">Commandes</a>
                    `; 
                } else if (userRole === 'affilie') {
                    linkHTML = `
                        <a href="affiliate-dashboard.html" class="text-gray-700 hover:text-indigo-600 mr-4">Dashboard Affilié</a>
                        <a href="affiliate-links.html" class="text-gray-700 hover:text-indigo-600 mr-4">Générateur de Liens</a>
                    `; 
                } else if (userRole === 'acheteur') {
                    // Les acheteurs n'ont pas de dashboard complexe, ils vont directement au panier/vitrine
                    // Leur profil est géré par la page acheteur-social-setup
                }
                
                // Lien Panier (pour tous)
                linkHTML += `<a href="panier.html" class="text-gray-700 hover:text-indigo-600">Panier</a>`; 
                
                roleLinks.innerHTML = linkHTML;
            } else {
                // Rôle non trouvé après connexion (devrait rediriger l'utilisateur vers la vitrine ou l'inscription)
                window.location.href = 'vitrine.html';
            }
        }).catch(error => {
            console.error("Erreur de récupération du document utilisateur:", error);
            // Fallback: Redirection vers l'accueil
            window.location.href = 'vitrine.html';
        });

    } else {
        // Utilisateur déconnecté
        authLinks.innerHTML = `
            <a href="login.html" class="text-gray-700 hover:text-indigo-600 mr-4">Connexion</a>
            <a href="register.html" class="py-1 px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm">Inscription</a>
        `;
        // Liens par défaut pour les visiteurs
        roleLinks.innerHTML = `<a href="vitrine.html" class="text-gray-700 hover:text-indigo-600">Vitrine</a>`;
        
        // Vérifier si un Affilié a été tracké (même si déconnecté)
        getAffiliateIdFromURL(); 
    }
});


// =========================================================================
// SECTION 14: Initialisation au Chargement du DOM
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Exécuter l'affichage des données spécifiques à la page
    const pathname = window.location.pathname;

    if (pathname.includes('vendor-setup.html')) { 
        displayAdPlans();
    } else if (pathname.includes('vendor-products.html')) { 
        displayVendorProducts();
    } else if (pathname.includes('edit-product.html')) { 
        loadProductForEdit();
    } else if (pathname.includes('affiliate-links.html')) { 
        displayAffiliateProductsForLink();
    } else if (pathname.includes('affiliate-dashboard.html')) { 
        displayAffiliateDashboard();
    } else if (pathname.includes('vendor-orders.html')) { 
        displayVendorOrders();
    } else if (pathname.includes('vitrine.html')) {
        displayVitrineProducts();
    } else if (pathname.includes('product.html')) {
        // Assurez-vous d'appeler getAffiliateIdFromURL() avant de charger les détails
        getAffiliateIdFromURL(); 
        displayProductDetails();
    } else if (pathname.includes('panier.html')) {
        displayCartItems();
    }
});

// Fonctions pour la page edit-product.html
async function loadProductForEdit() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const form = document.getElementById('editProductForm');
    if (!productId || !form) return;

    try {
        const productDoc = await getDoc(doc(db, "products", productId));
        if (!productDoc.exists()) {
            displayNotification("Produit à modifier non trouvé.", 'error');
            return;
        }
        
        const product = productDoc.data();
        // S'assurer que le formulaire existe
        if (!form.editProductId) {
             console.error("Le formulaire de modification est mal structuré (manque editProductId).");
             return;
        }
        
        form.editProductId.value = productId;
        form.editName.value = product.name;
        form.editPrice.value = product.price;
        form.editCommissionRate.value = product.commissionRate;
        form.editDescription.value = product.description;

    } catch (error) {
        displayNotification(`Erreur de chargement des données: ${error.message}`, 'error');
    }

    // Retirer l'écouteur du formulaire existant s'il y en a un pour éviter les doublons.
    const existingListener = form.__submitListener;
    if (existingListener) {
        form.removeEventListener('submit', existingListener);
    }
    
    // Créer un nouvel écouteur de soumission
    const newListener = async (e) => {
        e.preventDefault();
        
        const updatedData = {
            name: form.editName.value,
            price: parseFloat(form.editPrice.value),
            commissionRate: parseInt(form.editCommissionRate.value),
            description: form.editDescription.value,
            updatedAt: new Date()
        };

        try {
            await updateDoc(doc(db, "products", productId), updatedData);
            displayNotification("Produit mis à jour avec succès!", 'success');
            window.location.href = 'vendor-products.html'; 
        } catch (error) {
            displayNotification(`Erreur de mise à jour: ${error.message}`, 'error');
        }
    };

    form.addEventListener('submit', newListener);
    form.__submitListener = newListener; // Stocker pour le retirer plus tard si nécessaire
}
// Vérifie si l'utilisateur connecté est admin
async function isAdmin(userEmail) {
  try {
    const response = await fetch('/config/admins.json');
    const data = await response.json();
    return data.admins.includes(userEmail);
  } catch (e) {
    console.error('Erreur admin:', e);
    return false;
  }
}

// Exemple d'utilisation :
const userEmail = "jeoahs1@gmail.com"; // ton email
isAdmin(userEmail).then(admin => {
  if (admin) {
    console.log("Bienvenue, admin !");
    document.body.classList.add('is-admin');
  } else {
    console.log("Utilisateur normal");
  }
});
