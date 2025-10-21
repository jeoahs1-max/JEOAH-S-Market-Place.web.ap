 
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// L'initialisation de Firebase est supposée avoir été faite dans firebase-config.js ou directement dans les fichiers HTML
// Nous utilisons window.auth, window.db, window.storage qui sont initialisés dans les fichiers HTML pour plus de simplicité.

// -----------------------------------------------------------------
// 1. UTILS & NOTIFICATIONS
// -----------------------------------------------------------------

/**
 * Affiche une notification temporaire à l'utilisateur.
 * @param {string} message - Le message à afficher.
 * @param {string} type - 'success', 'error', 'info', 'warning'.
 * @param {number} duration - Durée d'affichage en ms (default 5000).
 */
function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-box') || document.getElementById('notificationContainer');
    if (!container) {
        console.warn(`Notification: ${type.toUpperCase()}: ${message}`);
        return;
    }

    const color = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    }[type] || 'bg-gray-500';

    const notification = document.createElement('div');
    notification.className = `p-3 rounded-lg text-white shadow-lg mb-2 ${color} transition transform ease-out duration-300`;
    notification.innerHTML = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('opacity-0');
        notification.addEventListener('transitionend', () => notification.remove());
    }, duration);
}

// -----------------------------------------------------------------
// 2. LOGIQUE D'AUTHENTIFICATION & REDIRECTION
// -----------------------------------------------------------------

/**
 * Gère l'inscription d'un nouvel utilisateur et son rôle.
 */
async function registerUser(form) {
    const email = form.email.value;
    const password = form.password.value;
    const role = form.role.value;
    const firstName = form.firstName.value;

    try {
        const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;

        // Créer le document utilisateur dans Firestore
        await setDoc(doc(window.db, "users", user.uid), {
            uid: user.uid,
            email: email,
            role: role,
            firstName: firstName,
            createdAt: new Date(),
            subscriptionPlan: 'trial_basic' // Plan par défaut
        });

        showNotification("Inscription réussie ! Redirection...", 'success');
        
        // Redirection en fonction du rôle pour l'onboarding
        let redirectUrl;
        if (role === 'vendor') {
            redirectUrl = 'fournisseur-step-social.html'; 
        } else if (role === 'affiliate') {
            redirectUrl = 'liens-d-affiliation.html';
        } else { // buyer
            redirectUrl = 'acheteur-social-setup.html';
        }
        
        setTimeout(() => window.location.href = redirectUrl, 1500);

    } catch (error) {
        console.error("Erreur d'inscription:", error);
        showNotification(`Erreur d'inscription: ${error.message}`, 'error');
    }
}

/**
 * Gère la connexion et la redirection en fonction du rôle.
 */
async function loginUser(form) {
    const email = form.email.value;
    const password = form.password.value;

    try {
        const userCredential = await signInWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;

        // Récupérer le rôle pour la redirection
        const userDoc = await getDoc(doc(window.db, "users", user.uid));
        const role = userDoc.exists() ? userDoc.data().role : 'buyer';
        
        showNotification("Connexion réussie ! Redirection...", 'success');

        let redirectUrl;
        if (role === 'vendor') {
            redirectUrl = 'produits-vendeurs.html';
        } else if (role === 'affiliate') {
            redirectUrl = 'dashboard-affilié.html';
        } else {
            redirectUrl = 'index.html';
        }
        
        setTimeout(() => window.location.href = redirectUrl, 1500);

    } catch (error) {
        console.error("Erreur de connexion:", error);
        showNotification(`Erreur de connexion: ${error.message}`, 'error');
    }
}

/**
 * Déconnecte l'utilisateur.
 */
function logoutUser() {
    signOut(window.auth).then(() => {
        showNotification("Déconnexion réussie.", 'info');
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error("Erreur de déconnexion:", error);
        showNotification("Erreur de déconnexion.", 'error');
    });
}

// -----------------------------------------------------------------
// 3. LOGIQUE D'ONBOARDING (Liens Sociaux & Affiliation)
// -----------------------------------------------------------------

/**
 * Sauvegarde les liens d'affiliation (Affilié).
 */
async function saveAffiliateLinks(form) {
    if (!window.auth.currentUser) return;
    const userId = window.auth.currentUser.uid;
    
    try {
        await updateDoc(doc(window.db, "users", userId), {
            affiliateLinkPersonalized: form.affiliateLinkPersonalized.value,
            affiliateCode: form.affiliateCode.value,
            // Simuler l'enregistrement sur le serveur JEOAH'S
            jeoahsServerId: userId 
        });
        showNotification("Liens d'affiliation enregistrés.", 'success');
        window.location.href = 'affilié-social.html';
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

/**
 * Sauvegarde les liens sociaux pour tous les rôles.
 */
async function saveSocialLinks(form, nextUrl) {
    if (!window.auth.currentUser) return;
    const userId = window.auth.currentUser.uid;

    try {
        await updateDoc(doc(window.db, "users", userId), {
            socialLinks: {
                facebook: form.facebook.value,
                instagram: form.instagram.value,
                tiktok: form.tiktok.value,
                youtube: form.youtube.value
            }
        });
        showNotification("Liens sociaux enregistrés.", 'success');
        setTimeout(() => window.location.href = nextUrl, 500);
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// -----------------------------------------------------------------
// 4. LOGIQUE D'AJOUT DE PRODUIT (Vendeur)
// -----------------------------------------------------------------

/**
 * Télécharge les images sur Firebase Storage.
 */
async function uploadImages(files, vendorId, productId = null) {
    const imageUrls = [];
    for (const file of files) {
        const path = productId 
            ? `products/${vendorId}/${productId}/${file.name}`
            : `products/${vendorId}/temp/${file.name}_${new Date().getTime()}`; // Utiliser temp si pas d'ID encore

        const imageRef = ref(window.storage, path);
        await uploadBytes(imageRef, file);
        const url = await getDownloadURL(imageRef);
        imageUrls.push(url);
    }
    return imageUrls;
}

/**
 * Enregistre un nouveau produit dans Firestore et gère les images.
 */
async function saveNewProduct(form) {
    if (!window.auth.currentUser || window.auth.currentUser.role === 'buyer') {
        showNotification("Accès refusé.", 'error');
        return;
    }
    
    const vendorId = window.auth.currentUser.uid;
    const files = form.images.files;
    
    // Désactiver le bouton et montrer le chargement
    const button = form.querySelector('button[type="submit"]');
    if (button) {
        button.disabled = true;
        button.textContent = "Chargement...";
    }
    
    try {
        // Étape 1: Créer d'abord un document pour obtenir un ID temporaire (non nécessaire ici car on utilise addDoc)
        // Mais nous allons le faire en une seule étape
        
        const imageUrls = await uploadImages(files, vendorId); 
        
        const productData = {
            vendorId: vendorId,
            name: form.name.value,
            description: form.description.value,
            price: parseFloat(form.price.value),
            category: form.category.value,
            affiliateCommissionPercent: parseInt(form.affiliateCommission.value),
            stock: parseInt(form.stock.value),
            createdAt: new Date(),
            imageUrls: imageUrls
        };

        const productRef = await addDoc(collection(window.db, "products"), productData);
        
        showNotification("Produit enregistré avec succès !", 'success');
        
        // >>> Déclenchement de la pub automatique après succès <<<
        await triggerAutomaticAd(vendorId, productData); 
        
        window.location.href = 'produits-vendeurs.html';

    } catch (error) {
        console.error("Erreur lors de l'enregistrement du produit:", error);
        showNotification(`Erreur: ${error.message}`, 'error');
    } finally {
         if (button) {
            button.disabled = false;
            button.textContent = "Enregistrer le Produit";
        }
    }
}

// -----------------------------------------------------------------
// 5. LOGIQUE DE GESTION DES PRODUITS (Vendeur)
// -----------------------------------------------------------------

/**
 * Affiche la liste des produits du vendeur connecté.
 */
function displayVendorProducts() {
    const productsContainer = document.getElementById('vendorProductsList');
    if (!productsContainer) return;

    onAuthStateChanged(window.auth, async (user) => {
        if (!user || !window.db) {
            productsContainer.innerHTML = '<div class="text-center py-10 text-red-500">Veuillez vous connecter pour voir vos produits.</div>';
            return;
        }

        const vendorId = user.uid;
        
        try {
            const productsRef = collection(window.db, "products");
            const q = query(productsRef, where("vendorId", "==", vendorId));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                productsContainer.innerHTML = `
                    <div class="text-center py-20 border-2 border-dashed border-gray-200 rounded-lg">
                        <p class="text-gray-600 mb-4">Vous n'avez pas encore ajouté de produit.</p>
                        <a href="configuration-du-vendeur.html" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition">Ajouter un produit</a>
                    </div>
                `;
                return;
            }

            let productsHtml = '';
            querySnapshot.forEach((doc) => {
                const product = doc.data();
                const productID = doc.id;
                
                // Le prix du vendeur est Price - Affiliate Commission
                const affiliateCommission = product.price * (product.affiliateCommissionPercent / 100);
                const platformFee = product.price * 0.03; // Frais JEOAH'S
                const estimatedNetProfit = (product.price - affiliateCommission).toFixed(2);
                
                // NOTA BENE: Les frais de 3% sont payés par l'Acheteur, donc le revenu du Vendeur n'est affecté que par la commission Affilié.

                productsHtml += `
                    <div class="bg-white p-4 rounded-lg shadow-sm mb-4 border border-gray-100 flex items-center">
                        <img src="${product.imageUrls[0] || 'placeholder.png'}" alt="${product.name}" class="w-16 h-16 object-cover rounded mr-4">
                        
                        <div class="flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${product.name}</h3>
                            <p class="text-sm text-gray-500">Prix: $${product.price.toFixed(2)} - Commission: ${product.affiliateCommissionPercent}%</p>
                            <p class="text-sm text-green-600 font-medium">Profit Net Estimé: $${estimatedNetProfit}</p>
                        </div>
                        
                        <div class="text-right">
                            <span class="text-sm font-semibold text-gray-700 block mb-1">Stock: ${product.stock}</span>
                            <a href="modifier-produit.html?id=${productID}" class="bg-indigo-500 text-white py-2 px-4 rounded-md hover:bg-indigo-600 transition font-medium text-sm">Modifier</a>
                        </div>
                    </div>
                `;
            });
            productsContainer.innerHTML = productsHtml;

        } catch (error) {
            console.error("Erreur lors de la récupération des produits:", error);
            productsContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger les produits.</div>`;
        }
    });
}

/**
 * Enregistre les modifications d'un produit existant.
 */
async function saveProductChanges(form) {
    if (!window.auth.currentUser) return;
    
    const productId = form.dataset.productId;
    const productRef = doc(window.db, "products", productId);
    
    const button = form.querySelector('button[type="submit"]');
    if (button) {
        button.disabled = true;
        button.textContent = "Sauvegarde en cours...";
    }

    try {
        const updatedData = {
            name: form.name.value,
            description: form.description.value,
            price: parseFloat(form.price.value),
            category: form.category.value,
            affiliateCommissionPercent: parseInt(form.affiliateCommission.value),
            stock: parseInt(form.stock.value),
            updatedAt: new Date(),
        };
        
        // Gérer l'upload de nouvelles images si besoin
        if (form.images.files.length > 0) {
            const vendorId = window.auth.currentUser.uid;
            const newImageUrls = await uploadImages(form.images.files, vendorId, productId);
            updatedData.imageUrls = newImageUrls; // Remplacer les anciennes URL
        }
        
        const vendorId = window.auth.currentUser.uid;
        
        await updateDoc(productRef, updatedData);
        
        showNotification("Produit mis à jour avec succès !", 'success');
        
        // >>> Déclenchement de la pub automatique après succès <<<
        // On récupère les données mises à jour pour la pub
        const finalProductData = (await getDoc(productRef)).data(); 
        await triggerAutomaticAd(vendorId, finalProductData); 

        window.location.href = 'produits-vendeurs.html';
        
    } catch (error) {
        console.error("Erreur lors de la mise à jour du produit:", error);
        showNotification(`Erreur lors de la mise à jour: ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Enregistrer les Modifications";
        }
    }
}

/**
 * Charge les données du produit à modifier.
 */
async function loadProductForEdit() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    if (!productId) {
        showNotification("ID du produit manquant.", 'error');
        return;
    }

    try {
        const productRef = doc(window.db, "products", productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
            showNotification("Produit introuvable.", 'error');
            return;
        }

        const product = productSnap.data();
        const form = document.getElementById('editProductForm');

        // Pré-remplir le formulaire
        form.dataset.productId = productId;
        form.name.value = product.name;
        form.description.value = product.description;
        form.price.value = product.price;
        form.category.value = product.category;
        form.affiliateCommission.value = product.affiliateCommissionPercent;
        form.stock.value = product.stock;

        // Afficher l'image actuelle (pour l'exemple)
        const imagePreview = document.getElementById('imagePreview');
        if (imagePreview && product.imageUrls && product.imageUrls.length > 0) {
            imagePreview.innerHTML = `<img src="${product.imageUrls[0]}" class="w-24 h-24 object-cover rounded shadow-md" alt="Image actuelle">`;
        }

    } catch (error) {
        console.error("Erreur lors du chargement du produit:", error);
    }
}

/**
 * Supprime un produit.
 */
async function deleteProduct(productId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce produit ?")) return;
    
    try {
        await deleteDoc(doc(window.db, "products", productId));
        showNotification("Produit supprimé avec succès.", 'success');
        window.location.href = 'produits-vendeurs.html';
    } catch (error) {
        showNotification(`Erreur lors de la suppression: ${error.message}`, 'error');
    }
}

// -----------------------------------------------------------------
// 6. LOGIQUE D'AFFICHAGE DES PRODUITS (Vitrine Publique / Affilié Dashboard)
// -----------------------------------------------------------------

/**
 * Récupère et affiche TOUS les produits de la marketplace (Vitrine Publique).
 * Si un Affilié est connecté, il voit en plus l'option de "Copier le Lien".
 */
function displayAffiliateProducts() {
    const productsContainer = document.getElementById('affiliateProductsList');
    if (!productsContainer) return; 

    productsContainer.innerHTML = '<div class="text-center py-10 text-gray-500">Chargement de tous les produits disponibles...</div>';
    
    // Déterminer l'ID de l'Affilié s'il est connecté
    const currentUser = window.auth.currentUser;
    let affiliateId = null;
    let currentUserRole = null;

    if (currentUser) {
        // Charger le rôle pour s'assurer que l'utilisateur est bien un affilié
        getDoc(doc(window.db, "users", currentUser.uid)).then(userSnap => {
            if (userSnap.exists()) {
                const userData = userSnap.data();
                currentUserRole = userData.role;
                if (currentUserRole === 'affiliate') {
                    affiliateId = currentUser.uid;
                }
            }
            loadProducts();
        }).catch(() => loadProducts()); // Charger les produits même si la récupération du rôle échoue

    } else {
        loadProducts(); // Charger pour tout le monde (vitrine publique)
    }
    
    const loadProducts = async () => {
        try {
            const productsRef = collection(window.db, "products");
            const querySnapshot = await getDocs(productsRef); // Requête publique

            if (querySnapshot.empty) {
                productsContainer.innerHTML = `
                    <div class="text-center py-20 border-2 border-dashed border-gray-200 rounded-lg">
                        <p class="text-gray-600 mb-4">Aucun produit n'est disponible pour l'instant.</p>
                    </div>
                `;
                return;
            }

            productsContainer.innerHTML = ''; 
            
            querySnapshot.forEach((doc) => {
                const product = doc.data();
                
                const commissionAmount = (product.price * (product.affiliateCommissionPercent / 100)).toFixed(2);
                
                const trackingLink = affiliateId 
                    ? `${window.location.origin}/produit.html?id=${doc.id}&affiliate=${affiliateId}` 
                    : `${window.location.origin}/produit.html?id=${doc.id}`; // Lien public pour l'Acheteur non-tracé

                let linkButtonHtml = '';
                if (affiliateId) {
                    // C'est le tableau de bord Affilié, on donne le bouton de copie
                    linkButtonHtml = `
                        <button 
                            onclick="navigator.clipboard.writeText('${trackingLink}'); showNotification('Lien copié !', 'success');"
                            class="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition font-medium text-sm"
                        >
                            Copier Lien Affilié
                        </button>
                    `;
                } else {
                    // C'est la vitrine publique pour un Acheteur non connecté, on propose de voir le détail
                    linkButtonHtml = `
                        <a href="${trackingLink}" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition font-medium text-sm">
                            Voir le Produit
                        </a>
                    `;
                }


                const productHtml = `
                    <div class="bg-white p-4 rounded-lg shadow-sm mb-4 border border-gray-100 flex items-center">
                        <img src="${product.imageUrls[0] || 'placeholder.png'}" alt="${product.name}" class="w-16 h-16 object-cover rounded mr-4">
                        
                        <div class="flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${product.name}</h3>
                            <p class="text-sm text-gray-500">Prix: $${product.price.toFixed(2)} - Commission Affilié: ${product.affiliateCommissionPercent}% ($${commissionAmount})</p>
                        </div>
                        
                        <div class="text-right">
                            ${linkButtonHtml}
                        </div>
                    </div>
                `;
                productsContainer.innerHTML += productHtml;
            });

        } catch (error) {
            console.error("Erreur lors de la récupération des produits affiliés (vitrine):", error);
            productsContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger les produits.</div>`;
        }
    };
}

// -----------------------------------------------------------------
// 7. LOGIQUE D'AFFICHAGE PAGE PRODUIT (Acheteur)
// -----------------------------------------------------------------

/**
 * Affiche les détails d'un seul produit et gère le tracking affilié.
 */
async function displayProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const affiliateId = params.get('affiliate'); // ID de l'affilié pour le tracking

    if (!productId) return;
    
    try {
        const productSnap = await getDoc(doc(window.db, "products", productId));
        if (!productSnap.exists()) return;

        const product = productSnap.data();
        const detailsContainer = document.getElementById('productDetailsContainer');
        
        // Afficher les détails du produit
        if (detailsContainer) {
            detailsContainer.innerHTML = `
                <div class="md:flex md:space-x-8">
                    <div class="md:w-1/2">
                        <img src="${product.imageUrls[0] || 'placeholder.png'}" alt="${product.name}" class="w-full h-auto object-cover rounded-lg shadow-xl">
                    </div>
                    <div class="md:w-1/2 mt-6 md:mt-0">
                        <h1 class="text-4xl font-extrabold text-gray-900">${product.name}</h1>
                        <p class="text-gray-500 mt-2">Catégorie: ${product.category}</p>
                        <p class="text-5xl font-bold text-indigo-600 my-4">$${product.price.toFixed(2)}</p>
                        
                        <p class="text-gray-700">${product.description}</p>
                        
                        <div class="mt-6 p-4 bg-gray-100 rounded-lg">
                            <p class="text-sm text-gray-600">Stock disponible: ${product.stock}</p>
                            <p class="text-sm text-green-700">Commission Affilié: ${product.affiliateCommissionPercent}%</p>
                            ${affiliateId ? `<p class="text-sm text-blue-700 font-semibold">Vous êtes ici via: Affilié ${affiliateId.substring(0, 8)}...</p>` : ''}
                        </div>
                        
                        <button id="addToCartButton" 
                                data-product-id="${productId}" 
                                data-affiliate-id="${affiliateId || ''}"
                                class="w-full mt-6 py-3 bg-green-600 text-white text-xl font-bold rounded-lg hover:bg-green-700 transition">
                            Ajouter au Panier
                        </button>
                    </div>
                </div>
            `;
            
            // Ajouter le listener pour l'ajout au panier
            const addToCartButton = document.getElementById('addToCartButton');
            if (addToCartButton) {
                addToCartButton.addEventListener('click', () => {
                    const id = addToCartButton.dataset.productId;
                    const affId = addToCartButton.dataset.affiliateId || null;
                    addItemToCart(id, affId);
                });
            }
        }

    } catch (error) {
        console.error("Erreur lors de l'affichage du produit:", error);
    }
}

// -----------------------------------------------------------------
// 8. LOGIQUE DE GESTION DU PANIER (Acheteur)
// -----------------------------------------------------------------

/**
 * Récupère le panier stocké dans localStorage.
 * @returns {Array} Le contenu du panier.
 */
function getCart() {
    const cart = localStorage.getItem('jeoahs_cart');
    return cart ? JSON.parse(cart) : [];
}

/**
 * Sauvegarde le panier dans localStorage.
 * @param {Array} cart - Le contenu du panier à sauvegarder.
 */
function saveCart(cart) {
    localStorage.setItem('jeoahs_cart', JSON.stringify(cart));
}

/**
 * Ajoute un produit au panier (ou augmente la quantité).
 * @param {string} productId - L'ID du produit.
 * @param {string} affiliateId - L'ID de l'affilié parrain, s'il existe.
 */
async function addItemToCart(productId, affiliateId = null) {
    const cart = getCart();
    const productRef = doc(window.db, "products", productId);
    
    try {
        const productSnapshot = await getDoc(productRef);

        if (!productSnapshot.exists()) {
            showNotification("Produit introuvable.", 'error');
            return;
        }

        const product = productSnapshot.data();
        
        const existingItemIndex = cart.findIndex(item => item.id === productId);

        if (existingItemIndex !== -1) {
            if (cart[existingItemIndex].quantity < product.stock) { 
                 cart[existingItemIndex].quantity += 1;
                 showNotification(`Quantité de ${product.name} augmentée.`, 'info');
            } else {
                 showNotification(`Stock maximum pour ${product.name} atteint.`, 'info');
            }
           
        } else {
            if (product.stock < 1) {
                 showNotification(`Produit en rupture de stock.`, 'error');
                 return;
            }
            cart.push({
                id: productId,
                name: product.name,
                price: product.price,
                image: product.imageUrls[0] || 'placeholder.png',
                vendorId: product.vendorId,
                affiliateId: affiliateId, 
                quantity: 1
            });
            showNotification(`${product.name} ajouté au panier !`, 'success');
        }

        saveCart(cart);
        
    } catch (error) {
        console.error("Erreur lors de l'ajout au panier:", error);
        showNotification("Erreur: Impossible d'ajouter l'article au panier.", 'error');
    }
}


/**
 * Retire un produit du panier ou diminue la quantité.
 */
function updateCartItem(productId, quantityChange, removeAll = false) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId);

    if (itemIndex === -1) return;

    if (removeAll || cart[itemIndex].quantity + quantityChange <= 0) {
        cart = cart.filter(item => item.id !== productId);
        showNotification("Article retiré du panier.", 'info');
    } else {
        cart[itemIndex].quantity += quantityChange;
        showNotification("Quantité ajustée.", 'info');
    }

    saveCart(cart);
    displayCartContents(); 
}


/**
 * Affiche le contenu du panier dans la page panier.html.
 */
function displayCartContents() {
    const container = document.getElementById('cartItemsContainer');
    const loadingMessage = document.getElementById('cartLoadingMessage');
    const subtotalDisplay = document.getElementById('subtotalDisplay');
    const totalDisplay = document.getElementById('totalDisplay');
    const checkoutButton = document.getElementById('checkoutButton');
    
    const cart = getCart();
    let subtotal = 0;

    if (loadingMessage) loadingMessage.style.display = 'none';

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="text-center py-20">
                <p class="text-gray-600 mb-4 text-lg">Votre panier est vide.</p>
                <a href="vitrine.html" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition">Commencer vos achats</a>
            </div>
        `;
        subtotalDisplay.textContent = '$0.00';
        totalDisplay.textContent = '$0.00';
        if(checkoutButton) checkoutButton.disabled = true;
        return;
    }

    let itemsHtml = '';
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        itemsHtml += `
            <div class="flex items-center border-b pb-4 mb-4">
                <img src="${item.image}" alt="${item.name}" class="w-20 h-20 object-cover rounded-lg mr-4 shadow-sm">
                
                <div class="flex-grow">
                    <h3 class="font-semibold text-gray-800">${item.name}</h3>
                    <p class="text-sm text-gray-500">$${item.price.toFixed(2)} / unité</p>
                    <p class="text-sm text-gray-500">Parrainé par: ${item.affiliateId ? 'Affilié' : 'Direct'}</p>
                </div>

                <div class="flex items-center space-x-2 mr-4">
                    <button onclick="updateCartItem('${item.id}', -1)" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full hover:bg-gray-300">-</button>
                    <span class="font-medium text-lg">${item.quantity}</span>
                    <button onclick="updateCartItem('${item.id}', 1)" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full hover:bg-gray-300">+</button>
                </div>

                <div class="text-right w-24">
                    <p class="font-bold text-gray-900">$${itemTotal.toFixed(2)}</p>
                    <button onclick="updateCartItem('${item.id}', 0, true)" class="text-red-500 hover:text-red-700 text-sm mt-1">Retirer</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = itemsHtml;
    
    subtotalDisplay.textContent = `$${subtotal.toFixed(2)}`;
    
    // Calcul des frais de plateforme de 3%
    const totalPlatformFee = subtotal * 0.03;
    const totalAmountPaid = subtotal + totalPlatformFee; 
    
    totalDisplay.textContent = `$${totalAmountPaid.toFixed(2)}`;
    
    // Mettre à jour les frais de livraison pour afficher les frais JHS
    const shippingDisplay = document.getElementById('shippingDisplay');
    if (shippingDisplay) {
         shippingDisplay.textContent = `$${totalPlatformFee.toFixed(2)} (Frais Plateforme JHS)`;
    }
    
    if(checkoutButton) checkoutButton.disabled = false;

    window.updateCartItem = updateCartItem; 
}


/**
 * Crée le document de commande dans Firestore et traite les calculs financiers (Correction 3% JEOAH'S).
 */
async function createOrder() {
    if (!window.auth.currentUser) {
        showNotification("Veuillez vous connecter pour finaliser votre achat.", 'error');
        return;
    }

    const buyerId = window.auth.currentUser.uid;
    const cart = getCart();

    if (cart.length === 0) {
        showNotification("Votre panier est vide.", 'error');
        return;
    }
    
    const checkoutButton = document.getElementById('checkoutButton');
    if (checkoutButton) {
        checkoutButton.disabled = true;
        checkoutButton.textContent = "Traitement de la commande...";
    }
    
    try {
        // --- 1. Calculs Financiers Globaux et Préparation de la Commande ---
        let subtotal = 0; 
        let totalAffiliateCommission = 0;
        let totalPlatformFee = 0; 
        const PLATFORM_FEE_RATE = 0.03; 
        
        const orderItems = {}; 
        
        const productPromises = cart.map(item => getDoc(doc(window.db, "products", item.id)));
        const productSnapshots = await Promise.all(productPromises);

        for (let i = 0; i < cart.length; i++) {
            const item = cart[i];
            const productSnapshot = productSnapshots[i];

            if (!productSnapshot.exists()) continue;
            
            const product = productSnapshot.data();
            const itemPrice = item.price;
            const itemQuantity = item.quantity;
            const itemTotal = itemPrice * itemQuantity; 
            
            subtotal += itemTotal;
            
            const affiliateCommissionRate = product.affiliateCommissionPercent / 100; 
            
            const affiliateCommission = itemTotal * affiliateCommissionRate;
            const platformFee = itemTotal * PLATFORM_FEE_RATE; 
            
            // REVENU VENDEUR: Prix Total - Commission Affilié (Les 3% sont payés par l'Acheteur)
            const vendorRevenue = itemTotal - affiliateCommission;
            
            totalAffiliateCommission += affiliateCommission;
            totalPlatformFee += platformFee; 

            if (!orderItems[item.vendorId]) {
                 orderItems[item.vendorId] = [];
            }
            
            orderItems[item.vendorId].push({
                productId: item.id,
                name: item.name,
                price: itemPrice,
                quantity: itemQuantity,
                image: item.image,
                
                affiliateId: item.affiliateId || null, 
                affiliateCommission: affiliateCommission.toFixed(2), 
                platformFee: platformFee.toFixed(2), 
                vendorRevenue: vendorRevenue.toFixed(2), 
            });
        }
        
        const totalAmountPaid = subtotal + totalPlatformFee; 
        
        // --- 2. Création du Document de Commande Principal ---
        const orderData = {
            buyerId: buyerId,
            orderDate: new Date(),
            status: 'Pending Payment', 
            totalAmount: totalAmountPaid.toFixed(2), 
            subtotal: subtotal.toFixed(2),
            
            totalPlatformFee: totalPlatformFee.toFixed(2), 
            totalAffiliateCommission: totalAffiliateCommission.toFixed(2),
            
            itemsByVendor: orderItems,
        };

        const orderRef = await addDoc(collection(window.db, "orders"), orderData);
        
        // --- 3. Nettoyage et Confirmation ---
        localStorage.removeItem('jeoahs_cart'); 
        showNotification(`Commande #${orderRef.id} créée. Total payé (incl. frais JHS): $${totalAmountPaid.toFixed(2)}`, 'success');
        
        displayCartContents(); 
        
        setTimeout(() => {
            window.location.href = 'index.html'; 
        }, 3000);

    } catch (error) {
        console.error("Erreur critique lors du traitement de la commande:", error);
        showNotification(`Erreur: Impossible de passer la commande. ${error.message}`, 'error');
        
        if (checkoutButton) {
            checkoutButton.disabled = false;
            checkoutButton.textContent = "Passer à la Caisse (Paiement)";
        }
    }
}


// -----------------------------------------------------------------
// 9. LOGIQUE DE GESTION DES COMMANDES (Vendeur)
// -----------------------------------------------------------------

/**
 * Récupère et affiche les commandes en attente pour le Vendeur connecté.
 */
function displayVendorOrders() {
    const ordersContainer = document.getElementById('vendorOrdersList');
    
    if (!ordersContainer) return;

    onAuthStateChanged(window.auth, async (user) => {
        if (!user || !window.db) {
            ordersContainer.innerHTML = '<div class="text-center py-10 text-red-500">Veuillez vous connecter pour voir vos commandes.</div>';
            return;
        }

        const vendorId = user.uid;
        
        try {
            const ordersRef = collection(window.db, "orders");
            const querySnapshot = await getDocs(ordersRef);

            let vendorOrdersHtml = '';
            let orderCount = 0;

            querySnapshot.forEach((doc) => {
                const order = doc.data();
                const orderId = doc.id;
                
                if (order.itemsByVendor && order.itemsByVendor[vendorId]) {
                    orderCount++;
                    const vendorItems = order.itemsByVendor[vendorId];
                    let totalVendorRevenue = 0;
                    
                    const itemsHtml = vendorItems.map(item => {
                        totalVendorRevenue += parseFloat(item.vendorRevenue);
                        return `
                             <li class="flex justify-between text-sm text-gray-600">
                                <span>${item.quantity} x ${item.name}</span>
                                <span class="font-medium">$${(item.price * item.quantity).toFixed(2)}</span>
                            </li>
                        `;
                    }).join('');

                    vendorOrdersHtml += `
                        <div class="bg-gray-50 p-4 rounded-xl shadow-md border-t-4 border-indigo-500 mb-4">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <h3 class="text-lg font-bold text-gray-800">Commande #${orderId.substring(0, 8)}...</h3>
                                    <p class="text-sm text-gray-500">Passée le: ${order.orderDate.toDate().toLocaleDateString('fr-FR')}</p>
                                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(order.status)}">${order.status}</span>
                                </div>
                                <div class="text-right">
                                    <p class="text-2xl font-extrabold text-green-700">$${totalVendorRevenue.toFixed(2)}</p>
                                    <p class="text-sm text-gray-500">Votre revenu net estimé</p>
                                </div>
                            </div>

                            <ul class="border-t pt-3 mb-4 space-y-1">
                                ${itemsHtml}
                            </ul>

                            <div class="border-t pt-4 flex justify-between items-center">
                                <select onchange="updateOrderStatus('${orderId}', this.value)" class="p-2 border rounded-md text-sm">
                                    <option value="${order.status}">${order.status} (Actuel)</option>
                                    <option value="Processing">En Traitement</option>
                                    <option value="Shipped">Expédiée</option>
                                    <option value="Delivered">Livrée</option>
                                </select>
                                <button onclick="viewOrderDetails('${orderId}')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Voir Détails</button>
                            </div>
                        </div>
                    `;
                }
            });
            
            if (orderCount > 0) {
                ordersContainer.innerHTML = vendorOrdersHtml;
            } else {
                ordersContainer.innerHTML = `
                    <div class="text-center py-20 border-2 border-dashed border-gray-200 rounded-lg">
                        <p class="text-gray-600 mb-4">Vous n'avez aucune nouvelle commande pour l'instant.</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des commandes:", error);
            ordersContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger les commandes.</div>`;
        }
    });
}

/**
 * Change la couleur du badge de statut.
 */
function getStatusColor(status) {
    switch(status) {
        case 'Pending Payment': return 'bg-yellow-100 text-yellow-800';
        case 'Processing': return 'bg-blue-100 text-blue-800';
        case 'Shipped': return 'bg-indigo-100 text-indigo-800';
        case 'Delivered': return 'bg-green-100 text-green-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Met à jour le statut d'une commande dans Firestore.
 */
async function updateOrderStatus(orderId, newStatus) {
    if (!window.db || !window.auth.currentUser) {
         showNotification("Veuillez vous reconnecter.", 'error');
         return;
    }
    try {
        const orderRef = doc(window.db, "orders", orderId);
        
        await updateDoc(orderRef, {
            status: newStatus,
            lastStatusUpdate: new Date()
        });
        
        showNotification(`Statut de la commande #${orderId.substring(0, 8)} mis à jour à "${newStatus}".`, 'success');
        
        displayVendorOrders(); 

    } catch (error) {
        console.error("Erreur lors de la mise à jour du statut:", error);
        showNotification("Erreur lors de la mise à jour du statut.", 'error');
    }
}


/**
 * Simule l'affichage de détails supplémentaires (pour l'exemple).
 */
function viewOrderDetails(orderId) {
    showNotification(`Affichage des détails pour la commande #${orderId.substring(0, 8)}. (Non implémenté)`, 'info');
}

// -----------------------------------------------------------------
// 10. LOGIQUE DE GESTION DU DASHBOARD AFFILIÉ
// -----------------------------------------------------------------

/**
 * Calcule et affiche les statistiques de ventes et de commissions pour l'Affilié connecté.
 */
function displayAffiliateDashboard() {
    const affiliateSalesList = document.getElementById('affiliateSalesList');
    if (!affiliateSalesList) return;

    onAuthStateChanged(window.auth, async (user) => {
        if (!user || !window.db) {
            affiliateSalesList.innerHTML = '<div class="text-center py-10 text-red-500">Veuillez vous connecter pour voir votre dashboard.</div>';
            return;
        }

        const affiliateId = user.uid;
        let totalCommission = 0;
        let totalSalesCount = 0;
        let salesHtml = '';

        try {
            const ordersRef = collection(window.db, "orders");
            const querySnapshot = await getDocs(ordersRef);

            querySnapshot.forEach((doc) => {
                const order = doc.data();
                const orderId = doc.id;

                for (const vendorId in order.itemsByVendor) {
                    const vendorItems = order.itemsByVendor[vendorId];
                    
                    vendorItems.forEach(item => {
                        if (item.affiliateId === affiliateId) {
                            const commission = parseFloat(item.affiliateCommission);
                            
                            totalCommission += commission;
                            totalSalesCount++;

                            salesHtml += `
                                <div class="bg-gray-50 p-4 rounded-lg shadow-sm flex justify-between items-center border-l-4 border-green-400">
                                    <div>
                                        <p class="font-semibold text-gray-800">${item.name} (${item.quantity}x)</p>
                                        <p class="text-sm text-gray-500">Vendeur: ${vendorId.substring(0, 8)}...</p>
                                        <p class="text-xs text-gray-400">Commande ID: ${orderId.substring(0, 8)}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-2xl font-bold text-green-600">+$${commission.toFixed(2)}</p>
                                        <p class="text-sm text-gray-500">Statut: ${order.status}</p>
                                    </div>
                                </div>
                            `;
                        }
                    });
                }
            });

            // Mise à jour de l'interface
            document.getElementById('totalCommission').textContent = `$${totalCommission.toFixed(2)}`;
            document.getElementById('totalSales').textContent = totalSalesCount;
            document.getElementById('affiliateSalesList').innerHTML = salesHtml || `<p class="text-center py-10 text-gray-500">Aucune vente enregistrée pour vous pour l'instant.</p>`;
            
            // Simulation des Clics 
            const simulatedClicks = totalSalesCount * 25 + Math.floor(Math.random() * 50);
            document.getElementById('totalClicks').textContent = simulatedClicks;


        } catch (error) {
            console.error("Erreur lors de la récupération du dashboard affilié:", error);
            affiliateSalesList.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger vos statistiques.</div>`;
        }
    });
}


// -----------------------------------------------------------------
// 11. LOGIQUE DE PUBLICITÉ AUTOMATIQUE (Simulation)
// -----------------------------------------------------------------

const ADVERTISING_SITES = [
    { name: "Facebook", url: "https://www.facebook.com/jeoahsmarketplace", type: "Social", requiresImage: true },
    { name: "Instagram", url: "https://www.instagram.com/jeoahsmarketplace", type: "Social", requiresImage: true },
    { name: "X (Twitter)", url: "https://twitter.com", type: "Social", requiresImage: true },
    { name: "YouTube Shorts", url: "https://www.youtube.com/@jeoahs1", type: "Video/Image", requiresImage: true },
    { name: "TikTok", url: "https://tiktok.com/@jeoahs1", type: "Video/Image", requiresImage: true },
    { name: "Telegram (Canal)", url: "https://telegram.org", type: "Text/Image", requiresImage: true },
    { name: "Snapchat", url: "https://www.snapchat.com", type: "Social", requiresImage: true },
    { name: "Reddit", url: "https://www.reddit.com", type: "Discussion", requiresImage: false },
    { name: "Quora", url: "https://fr.quora.com", type: "Discussion", requiresImage: false },
    { name: "Le Bon Coin", url: "https://www.leboncoin.fr", type: "Classified", requiresImage: true },
    { name: "Pinterest", url: "https://www.pinterest.com", type: "Social", requiresImage: true },
    { name: "LinkedIn", url: "https://www.linkedin.com", type: "Professional", requiresImage: true },
    { name: "Tumblr", url: "https://www.tumblr.com", type: "Blog", requiresImage: true },
];

const ADVERTISING_PLANS = {
    'annual_pro': { dailyLimit: 5, weeklyLimit: 20, priority: 1 },
    'monthly_standard': { dailyLimit: 2, weeklyLimit: 8, priority: 2 },
    'trial_basic': { dailyLimit: 0, weeklyLimit: 0, priority: 3 },
};

/**
 * Simule la publication automatique d'un produit basé sur le plan d'abonnement du Vendeur/Affilié.
 */
async function triggerAutomaticAd(userId, product) {
    if (!window.db) return;

    try {
        const userDoc = await getDoc(doc(window.db, "users", userId));
        if (!userDoc.exists()) return showNotification("Utilisateur introuvable pour la publicité.", 'error');
        
        const userData = userDoc.data();
        const planId = userData.subscriptionPlan || 'trial_basic'; 
        const plan = ADVERTISING_PLANS[planId];

        if (!plan || plan.dailyLimit === 0) {
            return showNotification("Votre plan d'abonnement n'inclut pas la publicité automatique.", 'info');
        }

        // --- SIMULATION DU COMPTEUR DE PUBLICATION (Dans une vraie app, ce serait dans Firestore) ---
        const adCountToday = 1; 
        
        if (adCountToday > plan.dailyLimit) {
            return showNotification(`Limite journalière de ${plan.dailyLimit} publicités atteinte pour votre plan.`, 'warning');
        }

        // --- LOGIQUE DE PUBLICATION SIMULÉE (avec priorité) ---
        const prioritySites = ADVERTISING_SITES.filter(site => site.requiresImage); 
        const basicSites = ADVERTISING_SITES.filter(site => !site.requiresImage); 

        let availableSites = [];
        if (plan.priority === 1) { 
            // 70% de chance d'être sur un réseau social majeur (Image)
            availableSites = Math.random() < 0.7 ? prioritySites : ADVERTISING_SITES;
        } else {
            // Autres plans: 50% de chance sur un site textuel
            availableSites = Math.random() < 0.5 ? basicSites : ADVERTISING_SITES;
        }
        
        if (availableSites.length === 0) availableSites = ADVERTISING_SITES; 
        
        const siteToPublish = availableSites[Math.floor(Math.random() * availableSites.length)];
        
        const contentContext = siteToPublish.requiresImage ? `Image + Texte` : `Texte Seul`;
        const adMessage = `NOUVEAU: ${product.name} par JEOAH'S. Prix: $${product.price.toFixed(2)}. ${product.description.substring(0, 50)}... [Lien Affilié]`;

        console.log(`[AD PRIORITY ${plan.priority}]: Tentative de publication sur ${siteToPublish.name} (${contentContext}).`);

        // --- Confirmation (Le point le plus important pour l'utilisateur) ---
        showNotification(`Publicité de "${product.name}" publiée sur ${siteToPublish.name} !`, 'success', 10000); 
        
        const confirmationMessage = `
            <div class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mt-2" role="alert">
                <p class="font-bold">Confirmation de Publicité</p>
                <p>Votre publicité pour **${product.name}** a été publiée sur **${siteToPublish.name}** (${contentContext}).</p>
                <p class="text-xs mt-1">Lien de la page (simulation): <a href="${siteToPublish.url}" target="_blank" class="underline text-blue-600">${siteToPublish.url}</a></p>
                <p class="text-xs mt-1">Contenu publié (Texte): "${adMessage.substring(0, 100)}..."</p>
            </div>
        `;
        const notifBox = document.getElementById('notification-box') || document.getElementById('notificationContainer'); 
        if(notifBox) notifBox.innerHTML += confirmationMessage;


    } catch (error) {
        console.error("Erreur lors de la simulation de publicité:", error);
    }
}
// -----------------------------------------------------------------
// 12. BONUS IA & ANALYSE DE TENDANCES (Simulation)
// -----------------------------------------------------------------

/**
 * Simule une analyse des tendances du marché pour donner des conseils aux Affiliés.
 * Cela vise à déterminer "quand publier" et "qui publier".
 */
function displayAffiliateTrendAnalysis() {
    const adviceContainer = document.getElementById('affiliateAdviceContainer');
    if (!adviceContainer) return;

    // --- Simulation de Tendances ---
    const trends = [
        { product: "Le produit A (Vendeur X)", trend: "UP", advice: "Très forte demande après le live de JEOAH'S hier. Publiez maintenant sur TikTok (vidéo courte).", commissionRisk: "Low" },
        { product: "Le service B (Vendeur Y)", trend: "DOWN", advice: "La demande est stable mais basse. Concentrez-vous sur Quora ou Reddit pour des questions spécifiques.", commissionRisk: "Medium" },
        { product: "Le gadget Z (Vendeur W)", trend: "SPIKE", advice: "Explosion soudaine dans la catégorie 'Tech écolo' ! Publiez immédiatement sur Instagram et X. Le prix pourrait augmenter demain.", commissionRisk: "Low" }
    ];

    const randomTrend = trends[Math.floor(Math.random() * trends.length)];
    const timeOfDay = new Date().getHours();
    
    let timeAdvice = '';
    if (timeOfDay >= 8 && timeOfDay <= 11) {
        timeAdvice = "C'est l'heure idéale pour les publications professionnelles (LinkedIn, X).";
    } else if (timeOfDay >= 18 && timeOfDay <= 21) {
        timeAdvice = "C'est le pic d'audience pour les réseaux sociaux (TikTok, FB, IG).";
    } else {
        timeAdvice = "L'activité est modérée. Les plateformes de discussion (Reddit, Quora) fonctionnent bien.";
    }

    const adviceHtml = `
        <div class="p-6 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg shadow-inner mb-6">
            <h2 class="text-xl font-bold text-yellow-800 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Conseil IA de Tendance du Moment
            </h2>
            <p class="text-lg font-semibold text-gray-800 mb-3">Produit Chaud : ${randomTrend.product}</p>
            <p class="mb-1">Statut de la tendance : <span class="font-bold text-green-600">${randomTrend.trend}</span></p>
            <p class="mb-3 font-medium">${randomTrend.advice}</p>
            <p class="text-sm text-gray-600 border-t pt-2 mt-2">Moment de publication actuel : **${timeAdvice}**</p>
        </div>
    `;

    adviceContainer.innerHTML = adviceHtml;

    // Simulation de l'information sur les produits en solde
    const salesInfo = `
        <div class="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg text-sm mb-4">
            <p class="font-bold text-red-800">Opportunité !</p>
            <p class="text-red-700">Le produit "Kit de démarrage Vendeur" (ID: XYZ) est en solde temporaire. Votre commission passe à 15% au lieu de 10% pour les 48 prochaines heures.</p>
        </div>
    `;
     adviceContainer.innerHTML += salesInfo;
}

// -----------------------------------------------------------------
// 13. LOGIQUE DE NAVIGATION (Barre de Navigation Adaptative - Démo)
// ... (Reste du code de la fonction updateNavBar) ...
// -----------------------------------------------------------------

// -----------------------------------------------------------------
// 13. LOGIQUE DE NAVIGATION (Barre de Navigation Adaptative - Démo)
// -----------------------------------------------------------------

/**
 * Met à jour la barre de navigation en fonction de l'état de connexion et du rôle.
 */
function updateNavBar() {
    const navBar = document.getElementById('main-nav');
    if (!navBar) return;

    onAuthStateChanged(window.auth, async (user) => {
        const authLinks = document.getElementById('auth-links');
        const roleLinks = document.getElementById('role-links');

        if (!authLinks || !roleLinks) return;

        // Effacer les liens existants
        authLinks.innerHTML = '';
        roleLinks.innerHTML = '';

        if (user) {
            // Utilisateur connecté
            const userDoc = await getDoc(doc(window.db, "users", user.uid));
            const role = userDoc.exists() ? userDoc.data().role : 'buyer';
            
            // Liens d'Authentification (Déconnexion)
            authLinks.innerHTML = `
                <span class="text-gray-700 mr-4 hidden sm:inline">Bienvenue, ${userDoc.data().firstName} (${role})</span>
                <button id="logoutButton" class="bg-red-500 text-white py-2 px-3 rounded-md hover:bg-red-600 transition">Déconnexion</button>
            `;
            document.getElementById('logoutButton').addEventListener('click', logoutUser);

            // Liens Spécifiques au Rôle
            if (role === 'vendor') {
                roleLinks.innerHTML = `
                    <a href="produits-vendeurs.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Mes Produits</a>
                    <a href="commandes-vendeur.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Commandes</a>
                `;
            } else if (role === 'affiliate') {
                 roleLinks.innerHTML = `
                    <a href="dashboard-affilié.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Mon Dashboard</a>
                `;
            } else { // buyer
                 roleLinks.innerHTML = `
                    <a href="panier.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Panier</a>
                `;
            }
            
        } else {
            // Utilisateur non connecté
            authLinks.innerHTML = `
                <a href="login.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Connexion</a>
                <a href="register.html" class="bg-indigo-600 text-white py-2 px-3 rounded-md hover:bg-indigo-700 transition">Inscription</a>
            `;
            roleLinks.innerHTML = `
                <a href="vitrine.html" class="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md font-medium">Vitrine</a>
            `;
        }
    });
}


// -----------------------------------------------------------------
// 14. LISTENERS D'ÉVÉNEMENTS (Logique Principale)
// -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Initialiser la navigation sur chaque chargement de page
    updateNavBar(); 
    
    if (!window.auth || !window.db) return;

    const path = window.location.pathname;

    // --- A. Logique d'Inscription/Connexion ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', (e) => { e.preventDefault(); registerUser(registerForm); });
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); loginUser(loginForm); });

    // --- B. Logique d'Onboarding ---
    // ... (Logique Onboarding - reste identique) ...
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
        const nextUrl = 'dashboard-affilié.html'; // Redirection vers le dashboard affilié
     // --- J. Logique de Gestion du Dashboard Affilié (dashboard-affilié.html) ---
    if (path.includes('dashboard-affilié.html')) {
        displayAffiliateDashboard();
        // NOUVEAU: Appel à la logique IA
        displayAffiliateTrendAnalysis(); 
    }
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

    // --- D. Logique d'Affichage Vendeur (produits-vendeurs.html) ---
    if (path.includes('produits-vendeurs.html')) {
        displayVendorProducts();
    }
    
    // --- E. Logique d'Affichage de la Vitrine (vitrine.html) ---
    if (path.includes('vitrine.html')) {
        displayAffiliateProducts(); 
    }
    
    // --- F. Logique d'Affichage de la Page Produit (produit.html) ---
    if (path.includes('produit.html')) {
        displayProductDetails();
    }

    // --- G. Logique de Modification Produit (modifier-produit.html) ---
    if (path.includes('modifier-produit.html')) {
        loadProductForEdit();
        
        const form = document.getElementById('editProductForm');
        if (form) {
            form.addEventListener('submit', (e) => { 
                e.preventDefault(); 
                saveProductChanges(form); 
            });
        }
        
        const deleteBtn = document.getElementById('deleteProductButton');
        const productId = new URLSearchParams(window.location.search).get('id');
        if (deleteBtn && productId) {
            deleteBtn.addEventListener('click', () => {
                deleteProduct(productId);
            });
        }
    }
    
    // --- H. Logique de Gestion du Panier (panier.html) ---
    if (path.includes('panier.html')) {
        window.addItemToCart = addItemToCart; 
        window.updateCartItem = updateCartItem;
        displayCartContents();
        
        const checkoutButton = document.getElementById('checkoutButton');
        if (checkoutButton) {
            checkoutButton.addEventListener('click', createOrder);
        }
    }
    
    // --- I. Logique de Gestion des Commandes Vendeur (commandes-vendeur.html) ---
    if (path.includes('commandes-vendeur.html')) {
        window.updateOrderStatus = updateOrderStatus; 
        window.viewOrderDetails = viewOrderDetails;
        
        displayVendorOrders();
    }
    
    // --- J. Logique de Gestion du Dashboard Affilié (dashboard-affilié.html) ---
    if (path.includes('dashboard-affilié.html')) {
        displayAffiliateDashboard();
    }
    
    // --- K. Logique IA (Démo - Simplifiée) ---
    const aiDemoButton = document.getElementById('ai-demo-button');
    if (aiDemoButton) {
        aiDemoButton.addEventListener('click', () => {
            showNotification("La démo IA sera disponible après l'intégration des Cloud Functions!", 'info');
        });
    }
});
