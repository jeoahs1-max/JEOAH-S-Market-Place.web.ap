// =================================================================
// src/public/app.js - Logique Principale du Frontend
// Code COMPLET pour l'authentification, l'onboarding, la gestion des produits
// Vendeur et Affilié, l'affichage des détails de produit, le panier et la commande.
// =================================================================

// -----------------------------------------------------------------
// 1. Dépendances Firebase (Imports)
// -----------------------------------------------------------------
import { createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Nouveaux imports: updateDoc, deleteDoc, addDoc
import { doc, setDoc, collection, getDocs, query, where, limit, addDoc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
// 4. LOGIQUE DE GESTION DES PRODUITS (Vendeur - Côté Création)
// -----------------------------------------------------------------

/**
 * Télécharge toutes les images du produit dans Firebase Storage.
 */
async function uploadProductImages(files, productId, vendorId) {
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
// 5. LOGIQUE D'AFFICHAGE DES PRODUITS (Vendeur Dashboard)
// -----------------------------------------------------------------

/**
 * Récupère et affiche les produits du vendeur connecté.
 */
function displayVendorProducts() {
    const productsContainer = document.getElementById('productsList');
    if (!productsContainer) return;

    productsContainer.innerHTML = '<div class="text-center py-10 text-gray-500">Chargement de vos produits...</div>';
    
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
                        <p class="text-gray-600 mb-4">Vous n'avez pas encore ajouté de produits.</p>
                        <a href="configuration-du-vendeur.html" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition">Ajouter votre premier produit</a>
                    </div>
                `;
                return;
            }

            productsContainer.innerHTML = ''; 
            
            querySnapshot.forEach((doc) => {
                const product = doc.data();
                
                const commission = (product.price * (product.affiliateCommissionPercent / 100)).toFixed(2);
                const platformFee = (product.price * 0.03).toFixed(2); // 3% de frais plateforme
                const netProfit = (product.price - commission - product.cost - platformFee).toFixed(2); // Inclure le coût et les frais plateforme dans le calcul du profit

                const productHtml = `
                    <div class="flex items-center bg-white p-4 rounded-lg shadow-sm mb-4 border border-gray-100">
                        <img src="${product.imageUrls[0] || 'placeholder.png'}" alt="${product.name}" class="w-16 h-16 object-cover rounded mr-4">
                        
                        <div class="flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${product.name}</h3>
                            <p class="text-sm text-gray-500">Catégorie: ${product.category}</p>
                        </div>

                        <div class="text-right mx-4 hidden sm:block">
                            <p class="font-medium text-indigo-600">Prix: $${product.price.toFixed(2)}</p>
                            <p class="text-sm text-green-600">Profit net estimé (après frais JHS): $${netProfit}</p>
                        </div>
                        
                        <div class="text-right">
                            <p class="font-bold text-gray-800">${product.stock} en Stock</p>
                            <a href="modifier-produit.html?id=${product.id}" class="text-sm text-blue-500 hover:underline">Modifier</a>
                        </div>
                    </div>
                `;
                productsContainer.innerHTML += productHtml;
            });

        } catch (error) {
            console.error("Erreur lors de la récupération des produits:", error);
            productsContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger les produits.</div>`;
        }
    });
}


// -----------------------------------------------------------------
// 6. LOGIQUE D'AFFICHAGE DES PRODUITS (Affilié Dashboard)
// -----------------------------------------------------------------

/**
 * Récupère et affiche TOUS les produits de la marketplace pour l'Affilié.
 */
function displayAffiliateProducts() {
    const productsContainer = document.getElementById('affiliateProductsList');
    if (!productsContainer) return; 

    productsContainer.innerHTML = '<div class="text-center py-10 text-gray-500">Chargement de tous les produits disponibles...</div>';
    
    onAuthStateChanged(window.auth, async (user) => {
        if (!user || !window.db) {
            productsContainer.innerHTML = '<div class="text-center py-10 text-red-500">Veuillez vous connecter pour voir les produits.</div>';
            return;
        }

        const affiliateId = user.uid; 
        
        try {
            const productsRef = collection(window.db, "products");
            const querySnapshot = await getDocs(productsRef);

            if (querySnapshot.empty) {
                productsContainer.innerHTML = `
                    <div class="text-center py-20 border-2 border-dashed border-gray-200 rounded-lg">
                        <p class="text-gray-600 mb-4">Aucun produit n'est disponible pour l'affiliation pour l'instant.</p>
                    </div>
                `;
                return;
            }

            productsContainer.innerHTML = ''; 
            
            querySnapshot.forEach((doc) => {
                const product = doc.data();
                
                const commissionAmount = (product.price * (product.affiliateCommissionPercent / 100)).toFixed(2);
                
                const affiliateLink = `${window.location.origin}/produit.html?id=${product.id}&affiliate=${affiliateId}`;

                const productHtml = `
                    <div class="bg-white p-4 rounded-lg shadow-sm mb-4 border border-gray-100 flex items-center">
                        <img src="${product.imageUrls[0] || 'placeholder.png'}" alt="${product.name}" class="w-16 h-16 object-cover rounded mr-4">
                        
                        <div class="flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${product.name}</h3>
                            <p class="text-sm text-gray-500">Prix: $${product.price.toFixed(2)} - Commission: ${product.affiliateCommissionPercent}% ($${commissionAmount})</p>
                        </div>
                        
                        <div class="text-right">
                            <button 
                                onclick="navigator.clipboard.writeText('${affiliateLink}'); showNotification('Lien copié !', 'success');"
                                class="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition font-medium text-sm"
                            >
                                Copier le Lien
                            </button>
                        </div>
                    </div>
                `;
                productsContainer.innerHTML += productHtml;
            });

        } catch (error) {
            console.error("Erreur lors de la récupération des produits affiliés:", error);
            productsContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur: Impossible de charger les produits.</div>`;
        }
    });
}


// -----------------------------------------------------------------
// 7. LOGIQUE D'AFFICHAGE DES DÉTAILS DU PRODUIT (produit.html)
// -----------------------------------------------------------------

/**
 * Récupère les liens d'affiliation génériques de l'Affilié et les affiche.
 */
async function displayComparisonLinks(affiliateId, container) {
    try {
        const affiliateDoc = doc(window.db, "users", affiliateId);
        const affiliateSnapshot = await getDoc(affiliateDoc);
        
        if (!affiliateSnapshot.exists() || !affiliateSnapshot.data().affiliateLinks) {
            container.innerHTML = `<p class="text-sm text-gray-500 mt-4">Pas de liens de comparaison disponibles pour cet affilié.</p>`;
            return;
        }

        const links = affiliateSnapshot.data().affiliateLinks;
        let comparisonHtml = `<h3 class="text-xl font-semibold mb-3 border-b pb-2">Comparer les prix chez nos partenaires</h3>`;
        let linksFound = false;
        
        const linkMap = {
            amazon: { name: "Amazon", color: "bg-yellow-600" },
            temu: { name: "Temu", color: "bg-blue-600" },
            aliexpress: { name: "AliExpress", color: "bg-red-600" },
            ebay: { name: "eBay", color: "bg-purple-600" }
        };

        for (const [key, details] of Object.entries(linkMap)) {
            const url = links[key];
            if (url) {
                comparisonHtml += `
                    <a href="${url}" target="_blank" class="${details.color} text-white py-3 px-6 rounded-md hover:opacity-90 transition duration-150 font-semibold block mt-2 text-center">
                        Voir le produit sur ${details.name} (Lien Affilié)
                    </a>
                `;
                linksFound = true;
            }
        }
        
        if (linksFound) {
            container.innerHTML = comparisonHtml;
        } else {
             container.innerHTML = `<p class="text-sm text-gray-500 mt-4">Aucun lien d'affiliation externe trouvé pour ce partenaire.</p>`;
        }


    } catch (error) {
        console.error("Erreur lors du chargement des liens de comparaison:", error);
    }
}

/**
 * Affiche les détails d'un produit et les liens d'affiliation alternatifs de l'affilié.
 */
async function displayProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const affiliateId = params.get('affiliate');

    const productContainer = document.getElementById('productDetailsContainer');
    
    if (!productId || !productContainer) {
        if(productContainer) productContainer.innerHTML = '<div class="text-center py-10 text-red-500">Produit non trouvé.</div>';
        return;
    }

    try {
        const productDoc = doc(window.db, "products", productId);
        const productSnapshot = await getDoc(productDoc);

        if (!productSnapshot.exists()) {
            productContainer.innerHTML = '<div class="text-center py-10 text-red-500">Ce produit n\'existe pas.</div>';
            return;
        }

        const product = productSnapshot.data();

        let imagesHtml = product.imageUrls.map(url => `<img src="${url}" class="w-full h-auto object-cover rounded-lg mb-2 shadow-md" alt="${product.name}">`).join('');
        
        productContainer.innerHTML = `
            <div class="md:grid md:grid-cols-2 gap-8">
                <div class="image-gallery">
                    ${imagesHtml}
                </div>
                <div>
                    <h1 class="text-4xl font-bold text-gray-900">${product.name}</h1>
                    <p class="text-2xl font-semibold text-indigo-600 mt-2">$${product.price.toFixed(2)}</p>
                    <div class="mt-4">
                        <p class="text-gray-700 font-medium">Description :</p>
                        <p class="text-gray-600">${product.description}</p>
                    </div>
                    <div class="mt-4">
                         <button 
                            id="addToCartButton" 
                            class="bg-indigo-600 text-white py-3 px-6 rounded-md hover:bg-indigo-700 transition duration-150 font-semibold w-full"
                        >
                            Ajouter au Panier
                        </button>
                    </div>
                    
                    <div id="comparisonLinks" class="mt-8"></div>
                </div>
            </div>
        `;
        
        if (affiliateId && document.getElementById('comparisonLinks')) {
            await displayComparisonLinks(affiliateId, document.getElementById('comparisonLinks'));
        }
        
        // NOUVEAU: Listener pour ajouter au panier
        const buyButton = document.getElementById('addToCartButton');
        if (buyButton) {
            buyButton.addEventListener('click', () => {
                 addItemToCart(productId, affiliateId); 
            });
        }


    } catch (error) {
        console.error("Erreur lors du chargement des détails du produit:", error);
        productContainer.innerHTML = `<div class="text-center py-10 text-red-500">Erreur critique de chargement.</div>`;
    }
}


// -----------------------------------------------------------------
// 8. LOGIQUE DE MODIFICATION & SUPPRESSION DE PRODUIT (Vendeur)
// -----------------------------------------------------------------

/**
 * Charge les détails du produit dans le formulaire pour la modification.
 */
async function loadProductForEdit() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const loadingMessage = document.getElementById('loadingMessage');
    const editForm = document.getElementById('editProductForm');

    if (!productId) {
        if(loadingMessage) loadingMessage.innerHTML = '<div class="text-red-500">ID de produit manquant.</div>';
        return;
    }
    
    if (!window.auth.currentUser) {
        if(loadingMessage) loadingMessage.innerHTML = '<div class="text-red-500">Veuillez vous connecter.</div>';
        return;
    }

    try {
        const productRef = doc(window.db, "products", productId);
        const productSnapshot = await getDoc(productRef);

        if (!productSnapshot.exists()) {
            if(loadingMessage) loadingMessage.innerHTML = '<div class="text-red-500">Produit non trouvé.</div>';
            return;
        }

        const product = productSnapshot.data();
        
        if (product.vendorId !== window.auth.currentUser.uid) {
            if(loadingMessage) loadingMessage.innerHTML = '<div class="text-red-500">Accès refusé. Vous n\'êtes pas le propriétaire de ce produit.</div>';
            return;
        }

        document.getElementById('product_id').value = productId;
        document.getElementById('product_name').value = product.name;
        document.getElementById('product-title-display').textContent = `Modification de : ${product.name}`;
        document.getElementById('product_description').value = product.description;
        document.getElementById('product_category').value = product.category;
        document.getElementById('selling_price').value = product.price;
        document.getElementById('product_cost').value = product.cost;
        document.getElementById('affiliate_commission').value = product.affiliateCommissionPercent;
        document.getElementById('product_stock').value = product.stock;

        const imagesDisplay = document.getElementById('currentImagesDisplay');
        imagesDisplay.innerHTML = '';
        if (product.imageUrls && product.imageUrls.length > 0) {
            product.imageUrls.forEach(url => {
                imagesDisplay.innerHTML += `<img src="${url}" class="w-20 h-20 object-cover rounded shadow-sm" alt="Image actuelle">`;
            });
        } else {
             imagesDisplay.innerHTML = `<p class="text-sm text-gray-500">Aucune image actuelle.</p>`;
        }

        if(loadingMessage) loadingMessage.style.display = 'none';
        if(editForm) editForm.style.display = 'block';

    } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        if(loadingMessage) loadingMessage.innerHTML = `<div class="text-red-500">Erreur de chargement des données du produit.</div>`;
    }
}


/**
 * Sauvegarde les modifications du produit dans Firestore.
 */
async function saveProductChanges(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Sauvegarde en cours...";
    
    const productId = form.product_id.value;
    const vendorId = window.auth.currentUser ? window.auth.currentUser.uid : null;

    if (!productId || !vendorId) {
        showNotification("Erreur: ID de produit ou session utilisateur manquant.", 'error');
        submitButton.disabled = false;
        submitButton.textContent = "Sauvegarder les Modifications";
        return;
    }

    try {
        const imagesInput = document.getElementById('product_images');
        const newImages = imagesInput.files;
        let imageUrlsToMerge = [];

        if (newImages.length > 0) {
            showNotification("Téléchargement des nouvelles images...", 'info');
            imageUrlsToMerge = await uploadProductImages(newImages, productId, vendorId); 
        }

        const updatedData = {
            name: form.product_name.value.trim(),
            description: form.product_description.value.trim(),
            category: form.product_category.value,
            stock: parseInt(form.product_stock.value, 10),
            
            price: parseFloat(form.selling_price.value),
            cost: parseFloat(form.product_cost.value) || 0,
            affiliateCommissionPercent: parseFloat(form.affiliate_commission.value),
            
            lastUpdated: new Date()
        };

        if (imageUrlsToMerge.length > 0) {
            const productRef = doc(window.db, "products", productId);
            const currentSnapshot = await getDoc(productRef);
            const currentImageUrls = currentSnapshot.data().imageUrls || [];
            
            updatedData.imageUrls = [...currentImageUrls, ...imageUrlsToMerge];
        }

        await updateDoc(doc(window.db, "products", productId), updatedData);
        
        showNotification("Produit mis à jour avec succès!", 'success');
        
        setTimeout(() => {
            window.location.href = 'produits-vendeurs.html';
        }, 1500);

    } catch (error) {
        console.error("Erreur lors de la mise à jour du produit:", error);
        showNotification(`Erreur critique : Impossible de sauvegarder les modifications. ${error.message}`, 'error');
        submitButton.disabled = false;
        submitButton.textContent = "Sauvegarder les Modifications";
    }
}


/**
 * Supprime le produit de Firestore et redirige.
 */
async function deleteProduct(productId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.")) {
        return;
    }
    
    if (!window.auth.currentUser) {
        showNotification("Session expirée. Veuillez vous reconnecter.", 'error');
        return;
    }
    
    try {
        await deleteDoc(doc(window.db, "products", productId));
        
        showNotification("Produit supprimé avec succès.", 'success');
        
        setTimeout(() => {
            window.location.href = 'produits-vendeurs.html';
        }, 1000);

    } catch (error) {
        console.error("Erreur lors de la suppression du produit:", error);
        showNotification(`Erreur: Impossible de supprimer le produit. ${error.message}`, 'error');
    }
}

// -----------------------------------------------------------------
// 9. LOGIQUE DE GESTION DU PANIER (Acheteur)
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
            if (cart[existingItemIndex].quantity < product.stock) { // Limité par le stock du vendeur
                 cart[existingItemIndex].quantity += 1;
                 showNotification(`Quantité de ${product.name} augmentée.`, 'info');
            } else {
                 showNotification(`Stock maximum pour ${product.name} atteint.`, 'info');
            }
           
        } else {
            // Vérification initiale du stock
            if (product.stock < 1) {
                 showNotification(`Produit en rupture de stock.`, 'error');
                 return;
            }
            // Ajouter un nouvel article
            cart.push({
                id: productId,
                name: product.name,
                price: product.price,
                image: product.imageUrls[0] || 'placeholder.png',
                vendorId: product.vendorId,
                affiliateId: affiliateId, // Enregistrer l'affilié pour la commission
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
 * @param {string} productId - L'ID du produit.
 * @param {number} quantityChange - La modification de quantité (-1 ou +1).
 * @param {boolean} removeAll - Si vrai, retire toutes les quantités.
 */
function updateCartItem(productId, quantityChange, removeAll = false) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId);

    if (itemIndex === -1) return;

    if (removeAll || cart[itemIndex].quantity + quantityChange <= 0) {
        cart = cart.filter(item => item.id !== productId);
        showNotification("Article retiré du panier.", 'info');
    } else {
        // Dans une application réelle, une vérification du stock en temps réel serait ici
        cart[itemIndex].quantity += quantityChange;
        showNotification("Quantité ajustée.", 'info');
    }

    saveCart(cart);
    displayCartContents(); // Recharger l'affichage
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
                <a href="index.html" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition">Commencer vos achats</a>
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
    const total = subtotal; 
    totalDisplay.textContent = `$${total.toFixed(2)}`;
    if(checkoutButton) checkoutButton.disabled = false;

    window.updateCartItem = updateCartItem; 
}


/**
 * Crée le document de commande dans Firestore et traite les calculs financiers.
 */
async function createOrder() {
    if (!window.auth.currentUser) {
        showNotification("Veuillez vous connecter pour finaliser votre achat.", 'error');
        // Dans une vraie application, on insérerait une étape de connexion ici.
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
        // --- 1. Calculs Financiers Globaux et Création de l'Article de Commande ---
        let subtotal = 0;
        let totalAffiliateCommission = 0;
        let totalPlatformFee = 0; // Ajouté pour le total des frais JEOAH'S
        
        const orderItems = {}; 
        
        // Pour des raisons de sécurité et de précision, nous chargeons tous les produits du panier
        const productPromises = cart.map(item => getDoc(doc(window.db, "products", item.id)));
        const productSnapshots = await Promise.all(productPromises);

        for (let i = 0; i < cart.length; i++) {
            const item = cart[i];
            const productSnapshot = productSnapshots[i];

            if (!productSnapshot.exists()) {
                showNotification(`Erreur: Produit ${item.name} non trouvé dans la base de données.`, 'error');
                continue;
            }
            
            const product = productSnapshot.data();
            const itemPrice = item.price;
            const itemQuantity = item.quantity;
            const itemTotal = itemPrice * itemQuantity;
            
            subtotal += itemTotal;
            
            const affiliateCommissionRate = product.affiliateCommissionPercent / 100; 
            const PLATFORM_FEE_RATE = 0.03; // Commission JEOAH'S fixe: 3%
            
            const affiliateCommission = itemTotal * affiliateCommissionRate;
            const platformFee = itemTotal * PLATFORM_FEE_RATE;
            
            const vendorRevenue = itemTotal - affiliateCommission - platformFee;
            
            totalAffiliateCommission += affiliateCommission;
            totalPlatformFee += platformFee; // Accumuler le total des frais JEOAH'S

            // Initialisation du tableau pour le vendeur si nécessaire
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
            
            // NOTE: Une mise à jour du stock (product.stock -= itemQuantity) serait nécessaire ici. 
            // Nous le laissons de côté pour le moment pour simplifier le flux de commande.
        }
        
        const total = subtotal; 
        
        // --- 2. Création du Document de Commande Principal ---
        const orderData = {
            buyerId: buyerId,
            orderDate: new Date(),
            status: 'Pending Payment', 
            totalAmount: total.toFixed(2),
            subtotal: subtotal.toFixed(2),
            
            totalPlatformFee: totalPlatformFee.toFixed(2), 
            totalAffiliateCommission: totalAffiliateCommission.toFixed(2),
            
            itemsByVendor: orderItems,
        };

        const orderRef = await addDoc(collection(window.db, "orders"), orderData);
        
        // --- 3. Nettoyage et Confirmation ---
        localStorage.removeItem('jeoahs_cart'); 
        showNotification(`Commande #${orderRef.id} créée avec succès! (Simulé: En attente de traitement par le vendeur)`, 'success');
        
        displayCartContents(); // Pour vider l'affichage du panier
        
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
// 10. LISTENERS D'ÉVÉNEMENTS (Logique Principale)
// -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    if (!window.auth || !window.db) return;

    const path = window.location.pathname;

    // --- A. Logique d'Inscription (registerForm) ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
       // ... (Logique d'inscription existante)
    }

    // --- B. Logique d'Onboarding (gestion des formulaires post-inscription) ---
    // ... (Logique d'onboarding existante)
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

    // --- D. Logique d'Affichage Vendeur (produits-vendeurs.html) ---
    if (path.includes('produits-vendeurs.html')) {
        displayVendorProducts();
    }
    
    // --- E. Logique d'Affichage des Produits Affiliés (produits-affiliés.html) ---
    if (path.includes('produits-affiliés.html')) {
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
        // Rendre les fonctions globales accessibles pour les boutons onclick dans le HTML
        window.addItemToCart = addItemToCart; 
        window.updateCartItem = updateCartItem;
        
        // Afficher le contenu du panier au chargement
        displayCartContents();
        
        // Listener pour le bouton de passage à la caisse
        const checkoutButton = document.getElementById('checkoutButton');
        if (checkoutButton) {
            checkoutButton.addEventListener('click', createOrder);
        }
    }
    
    // --- I. Logique IA (Démo - Simplifiée) ---
    const aiDemoButton = document.getElementById('ai-demo-button');
    if (aiDemoButton) {
        aiDemoButton.addEventListener('click', () => {
            showNotification("La démo IA sera disponible après l'intégration des Cloud Functions!", 'info');
        });
    }
});
