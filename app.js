<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JEOAH'S Market Place</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f7f9fc; }
        .product-card { transition: transform 0.2s, box-shadow 0.2s; }
        .product-card:hover { transform: translateY(-5px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
    </style>
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, query, getDocs, doc, setDoc, onSnapshot, where, limit, runTransaction, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // IMPORTANT: Variables globales fournies par l'environnement
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        let db;
        let auth;
        let userId = null;
        let currentView = 'login'; // 'login', 'dashboard', 'marketplace'

        setLogLevel('debug'); // Active le logging Firestore pour le débogage

        // --- Fonctions d'authentification et de routage ---

        async function authenticateUser() {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
                userId = auth.currentUser.uid;
                console.log("Authentification réussie. User ID:", userId);
            } catch (error) {
                console.error("Erreur d'authentification:", error);
                // Afficher un message d'erreur si l'authentification échoue
            }
        }

        function setupAuthListener() {
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                    // Déterminer la vue initiale après connexion/auth anonyme
                    if (currentView === 'login') {
                         renderApp(true); // Passer directement à la vitrine si l'utilisateur a cliqué sur "Explorer la Vitrine"
                    } else {
                        // Rester sur la vue actuelle si ce n'est pas l'écran de connexion
                    }
                } else {
                    userId = null;
                    renderLogin(); // Retour à l'écran de connexion si déconnecté
                }
            });
        }
        
        function navigateTo(view, bypassAuthCheck = false) {
            currentView = view;
            renderApp(bypassAuthCheck);
        }

        // --- Fonctions Firestore ---

        function getProductsCollectionRef() {
            // Chemin d'accès aux données publiques : /artifacts/{appId}/public/data/products
            return collection(db, 'artifacts', appId, 'public', 'data', 'products');
        }

        async function loadMarketPlace() {
            const productsContainer = document.getElementById('products-container');
            const errorBanner = document.getElementById('error-banner');
            productsContainer.innerHTML = '<p class="text-center text-gray-500 my-8">Chargement de la vitrine...</p>';
            errorBanner.classList.add('hidden');
            errorBanner.textContent = '';

            if (!userId) {
                errorBanner.textContent = "Erreur: Utilisateur non authentifié. Veuillez patienter pour l'authentification.";
                errorBanner.classList.remove('hidden');
                productsContainer.innerHTML = '';
                return;
            }

            try {
                const q = query(getProductsCollectionRef());
                const querySnapshot = await getDocs(q);
                
                const products = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                productsContainer.innerHTML = '';
                if (products.length === 0) {
                    productsContainer.innerHTML = '<p class="text-center text-gray-500 my-8 text-lg">Aucun produit disponible pour le moment.</p>';
                    return;
                }

                products.forEach(product => {
                    const card = document.createElement('div');
                    card.className = 'product-card bg-white p-4 rounded-xl shadow-lg flex flex-col hover:shadow-2xl';
                    
                    // Assurez-vous que l'URL de l'image est valide ou utilisez un placeholder
                    const imageUrl = product.imageUrl || `https://placehold.co/400x300/4c51bf/ffffff?text=${encodeURIComponent(product.name || 'Produit')}`;

                    card.innerHTML = `
                        <div class="h-48 overflow-hidden rounded-lg mb-4">
                            <img src="${imageUrl}" alt="${product.name}" class="w-full h-full object-cover">
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">${product.name}</h3>
                        <p class="text-sm text-gray-600 flex-grow mb-3">${product.description ? product.description.substring(0, 100) + '...' : 'Pas de description.'}</p>
                        <div class="flex items-center justify-between mt-auto">
                            <span class="text-2xl font-extrabold text-indigo-600">${product.price ? product.price.toFixed(2) : 'N/A'} $</span>
                            <button onclick="handleAddToCart('${product.id}')" 
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:bg-blue-700 transition duration-150 ease-in-out">
                                Acheter
                            </button>
                        </div>
                    `;
                    productsContainer.appendChild(card);
                });

            } catch (error) {
                console.error("Erreur de chargement de la vitrine:", error.message);
                errorBanner.textContent = `Erreur de chargement de la vitrine: ${error.message}. Vérifiez les règles de sécurité Firestore.`;
                errorBanner.classList.remove('hidden');
                productsContainer.innerHTML = '';
            }
        }
        
        // Simuler la gestion du panier
        window.handleAddToCart = (productId) => {
            alert(`Produit ${productId} ajouté au panier (fonctionnalité non implémentée).`);
        };


        // --- Fonctions de rendu des vues ---

        function renderHeader(isAuthenticated) {
            return `
                <header class="bg-white shadow-md sticky top-0 z-10">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                        <h1 class="text-2xl font-extrabold text-indigo-700">JEOAH'S Market Place</h1>
                        <nav class="flex items-center space-x-4">
                            ${isAuthenticated ? `
                                <button onclick="navigateTo('marketplace', true)" 
                                    class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">
                                    Vitrine
                                </button>
                                <button onclick="handleLogout()" 
                                    class="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition">
                                    Déconnexion
                                </button>
                            ` : ''}
                            <!-- Panier (non fonctionnel) -->
                            <button class="text-gray-600 hover:text-gray-900">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            </button>
                        </nav>
                    </div>
                </header>
            `;
        }

        function renderLogin() {
            document.getElementById('app').innerHTML = `
                <div class="min-h-screen flex items-center justify-center p-4">
                    <div class="bg-white p-8 md:p-10 rounded-xl shadow-2xl max-w-sm w-full">
                        <h2 class="text-3xl font-extrabold text-center text-gray-900 mb-2">Se Connecter</h2>
                        <p class="text-center text-gray-600 mb-8">Accédez à JEOAH'S Market Place.</p>
                        
                        <form id="login-form" onsubmit="handleLogin(event)">
                            <div class="mb-4">
                                <label for="email" class="sr-only">Adresse Email</label>
                                <input type="email" id="email" name="email" required placeholder="exemple@mail.com"
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div class="mb-6">
                                <label for="password" class="sr-only">Mot de Passe</label>
                                <input type="password" id="password" name="password" required placeholder="Minimum 6 caractères"
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            
                            <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 transition duration-150 ease-in-out shadow-md">
                                Se Connecter
                            </button>
                        </form>
                        
                        <p class="text-center mt-4">
                            Je n'ai pas de compte (<a href="#" class="text-blue-600 hover:text-blue-800 font-semibold" onclick="handleSignupClick()">Inscription</a>)
                        </p>
                        <p class="text-center mt-2">
                            <a href="#" class="text-indigo-600 hover:text-indigo-800 font-semibold transition" onclick="navigateTo('marketplace', true)">
                                Explorer la Vitrine sans Connexion
                            </a>
                        </p>
                    </div>
                </div>
            `;
        }

        function renderMarketplace() {
            document.getElementById('app').innerHTML = `
                ${renderHeader(true)}
                <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <h2 class="text-4xl font-extrabold text-gray-900 mb-6">Découvrez nos Produits</h2>
                    
                    <!-- Bannière d'erreur (visible en cas de problème de permission/chargement) -->
                    <div id="error-banner" class="hidden bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-6 font-semibold" role="alert">
                        <!-- Le message d'erreur sera inséré ici -->
                    </div>

                    <div id="products-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <!-- Les produits seront chargés ici -->
                    </div>
                </main>
            `;
            loadMarketPlace();
        }

        function renderApp(bypassAuthCheck = false) {
            const container = document.getElementById('app');
            // Si on bypass l'auth check (pour la vitrine), on passe directement à la vue marketplace
            if (bypassAuthCheck && currentView === 'marketplace') {
                renderMarketplace();
            } else if (userId && currentView === 'marketplace') {
                renderMarketplace();
            } else if (userId) {
                // Pour l'instant, si connecté, on affiche la vitrine par défaut
                currentView = 'marketplace';
                renderMarketplace();
            } else {
                renderLogin();
            }
        }

        // --- Gestionnaires d'événements (Stubs car l'implémentation complète n'est pas demandée) ---

        window.handleLogin = (event) => {
            event.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            // TODO: Ajouter la logique de connexion Firebase
            console.log("Tentative de connexion pour:", email);
            
            // Simulation: après connexion réussie (à remplacer par signInWithEmailAndPassword)
            navigateTo('marketplace');
        };

        window.handleSignupClick = () => {
             alert("La page d'inscription n'est pas encore implémentée. Veuillez utiliser un compte existant ou explorer la vitrine.");
        };

        window.handleLogout = async () => {
            try {
                await signOut(auth);
                // navigateTo sera appelé par l'écouteur onAuthStateChanged
            } catch (error) {
                console.error("Erreur de déconnexion:", error);
            }
        };

        // --- Initialisation ---

        async function initApp() {
            try {
                // 1. Initialiser Firebase
                const app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);

                // 2. Authentifier l'utilisateur (avec jeton ou anonymement)
                await authenticateUser();
                
                // 3. Établir l'écouteur d'état d'authentification
                setupAuthListener();

                // 4. Déterminer et rendre la vue initiale
                // Si l'auth anonyme a réussi, renderApp affichera le marketplace
                renderApp();

            } catch (e) {
                console.error("Échec de l'initialisation de l'application:", e);
                document.getElementById('app').innerHTML = `
                    <div class="p-8 text-center text-red-600 bg-red-100 rounded-xl m-4">
                        <p class="font-bold">Erreur Critique d'Initialisation:</p>
                        <p>${e.message}</p>
                        <p>Veuillez vérifier votre configuration Firebase.</p>
                    </div>
                `;
            }
        }

        document.addEventListener('DOMContentLoaded', initApp);

        // Exposez les fonctions de navigation pour les boutons HTML
        window.navigateTo = navigateTo;
        window.handleLogout = handleLogout;

    </script>
</head>
<body>
    <div id="app">
        <!-- Le contenu sera chargé ici par renderApp() -->
    </div>
</body>
</html>

