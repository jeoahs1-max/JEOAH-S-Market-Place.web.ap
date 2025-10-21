// Importations nécessaires pour Firebase (vérifiez que les CDN sont inclus dans tous les HTML)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Votre configuration Firebase (Remplacer les placeholders)
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY", 
  authDomain: "VOTRE_PROJECT_ID.firebaseapp.com",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_PROJECT_ID.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// Exporter les services pour être utilisés dans app.js
export const auth = getAuth(app);
export const db = getFirestore(app);
