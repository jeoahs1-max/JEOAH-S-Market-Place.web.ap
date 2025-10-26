// Cloud Functions pour JEOAH'S
// Backend: Tâches planifiées, commissions, sanctions, import de données

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require('node-fetch');
// ATTENTION: cheerio doit être installé (npm install cheerio) dans le dossier 'functions' si vous utilisez un scraper.
// const cheerio = require('cheerio'); 

// Initialisation de l'application Firebase Admin
// Assurez-vous que les variables d'environnement (comme SENDGRID_API_KEY) sont configurées
admin.initializeApp();
const db = admin.firestore();

// --- Fonctions Utilitaires ---

/** Calcule le début du jour UTC pour les requêtes Firestore. */
function getStartOfDay() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return admin.firestore.Timestamp.fromDate(d);
}

/** Envoie un email aux administrateurs (Nécessite SendGrid/Mailgun ou autre setup) */
// NOTE: L'implémentation complète dépend du service de mail que vous utilisez (par ex., SendGrid)
// Ce bloc est un MOCKUP et nécessite le SDK du service d'email réel.
async function sendAdminEmail(subject, text) {
    console.log(`[EMAIL MOCK] Envoi du rapport : ${subject}. Contenu: ${text}`);
    // Si vous utilisez SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // const msg = { to: process.env.ADMIN_EMAILS.split(','), from: 'no-reply@jeoahs.com', subject, text };
    // await sgMail.send(msg);
    return true;
}

// --- 1. Tâches Planifiées (Cron) ---

/** Tâche quotidienne: Génère un rapport Admin + envoi par email */
exports.dailyAdminReport = functions.pubsub.schedule('0 3 * * *').timeZone('UTC').onRun(async (context) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const startOfToday = getStartOfDay();

        // 1) Statistiques des ventes et utilisateurs du jour
        const usersSnap = await db.collection('artifacts/app-id/public/data/users')
                                  .where('createdAt', '>=', startOfToday)
                                  .get();
        
        const ordersSnap = await db.collection('artifacts/app-id/public/data/orders')
                                   .where('createdAt', '>=', startOfToday)
                                   .get();

        // Calcul des totaux
        let totalSalesUsd = 0;
        let totalCommissionsUsd = 0;

        ordersSnap.docs.forEach(doc => {
            const order = doc.data();
            totalSalesUsd += (order.totalAmountUsd || 0);
            totalCommissionsUsd += (order.platformFeeUsd || 0);
        });

        // 2) Retraits en attente
        const pendingWithdrawalsSnap = await db.collection('artifacts/app-id/public/data/withdrawals')
                                               .where('status', '==', 'pending')
                                               .get();

        const reportData = {
            date: today,
            newUsers: usersSnap.size,
            totalSalesUsd: totalSalesUsd,
            commissionsUsd: totalCommissionsUsd,
            pendingWithdrawals: pendingWithdrawalsSnap.size,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        // Sauvegarde du rapport dans Firestore
        await db.collection('artifacts/app-id/public/data/admin_reports').doc(today).set(reportData, { merge: true });

        // Envoi du rapport par email
        const emailText = `
            Rapport Quotidien JEOAH'S - ${today}
            - Nouveaux utilisateurs: ${reportData.newUsers}
            - Ventes totales (brutes): ${reportData.totalSalesUsd.toFixed(2)} USD
            - Commissions JEOAH'S (3%): ${reportData.commissionsUsd.toFixed(2)} USD
            - Retraits en attente d'approbation: ${reportData.pendingWithdrawals}
        `;
        await sendAdminEmail(`Rapport JEOAH'S ${today}`, emailText);

        console.log('Rapport quotidien généré et envoyé.');
        return null;
    } catch (error) {
        console.error("Erreur lors de la génération du rapport quotidien:", error);
        return null;
    }
});


/** Tâche quotidienne: Vérifie les commandes en retard (> 7 jours) et suspend les vendeurs avec >= 3 retards. */
exports.checkOrderDelays = functions.pubsub.schedule('0 4 * * *').timeZone('UTC').onRun(async () => {
    try {
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 3600 * 1000));
        
        // Trouver les commandes "placed" créées il y a plus de 7 jours (retard de livraison/expédition)
        const delayedOrders = await db.collection('artifacts/app-id/public/data/orders')
            .where('status', '==', 'placed')
            .where('createdAt', '<=', sevenDaysAgo)
            .get();

        const sellerDelayCount = {};
        const suspendPromises = [];

        delayedOrders.forEach(doc => {
            const order = doc.data();
            const sellerId = order.sellerId;
            if (sellerId) {
                if (!sellerDelayCount[sellerId]) sellerDelayCount[sellerId] = 0;
                sellerDelayCount[sellerId]++;
            }
        });

        // Identifier les vendeurs à suspendre
        for (const sellerId in sellerDelayCount) {
            if (sellerDelayCount[sellerId] >= 3) {
                console.log(`Suspension du vendeur ${sellerId} (3+ retards).`);
                
                // Mettre à jour le statut du vendeur
                const userRef = db.collection('artifacts/app-id/public/data/users').doc(sellerId);
                suspendPromises.push(userRef.update({ suspended: true, suspendedAt: admin.firestore.FieldValue.serverTimestamp() }));
                
                // Notifier l'admin et le vendeur (à implémenter)
            }
        }
        
        await Promise.all(suspendPromises);
        console.log(`Vérification des retards terminée. ${suspendPromises.length} vendeurs suspendus.`);
        return null;
    } catch (error) {
        console.error("Erreur lors de la vérification des retards:", error);
        return null;
    }
});

// --- 2. Triggers de Base de Données (Actions en temps réel) ---

/** Calcule et enregistre la commission de 3% lors de la création d'une commande. */
exports.onOrderCreated = functions.firestore.document('artifacts/app-id/public/data/orders/{orderId}').onCreate(async (snap) => {
    const order = snap.data();
    
    // Commission JEOAH'S = 3% sur les ventes directes (par défaut)
    const COMMISSION_RATE = 0.03;
    const commission = (order.totalAmountUsd || 0) * COMMISSION_RATE;
    
    try {
        // Mise à jour de la commande avec la commission
        await snap.ref.update({ platformFeeUsd: commission });

        // Mise à jour du "wallet" du vendeur/affilié (sellerId)
        const sellerId = order.sellerId;
        const netAmount = (order.totalAmountUsd || 0) - commission;
        
        const userRef = db.collection('artifacts/app-id/public/data/users').doc(sellerId);
        
        // Utiliser une transaction pour une mise à jour atomique du portefeuille
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("Vendeur non trouvé.");
            }
            const currentBalance = userDoc.data().wallet?.balanceUsd || 0;
            const newBalance = currentBalance + netAmount;
            
            transaction.update(userRef, {
                'wallet.balanceUsd': newBalance
            });
        });

        console.log(`Commission de ${commission.toFixed(2)}$ traitée pour la commande ${snap.id}.`);
    } catch (error) {
        console.error(`Erreur lors du traitement de la commande ${snap.id}:`, error);
    }
    return null;
});

// --- 3. Fonction Callable pour les opérations Front-end (Import Affilié) ---

/** Simule un extracteur de métadonnées pour créer un produit à partir d'un lien. */
exports.importProductFromAffiliate = functions.https.onCall(async (data, context) => {
    // Vérification de l'authentification
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentification requise pour cette action.');
    }
    
    const { url } = data;
    const userId = context.auth.uid;
    
    if (!url) {
        throw new functions.https.HttpsError('invalid-argument', 'L\'URL est requise.');
    }
    
    // NOTE: L'implémentation d'un scraper complet (cheerio + fetch) est complexe
    // et risquée (TOS). Ici, nous SIMULONS un import basé sur le plan.
    
    // --- Début de la simulation d'import (à remplacer par API/Scraper réel) ---
    const placeholderTitle = `Produit Affilié Importé: ${url.substring(0, 40)}...`;
    const randomPrice = (Math.random() * 100 + 10).toFixed(2);
    const placeholderImage = "https://placehold.co/400x400/3056D3/ffffff?text=Lien+Affilié";

    const productDoc = {
        title: placeholderTitle, 
        description: "Description importée automatiquement (à modifier).",
        images: [placeholderImage], 
        priceUsd: parseFloat(randomPrice),
        ownerId: userId, 
        source: 'affiliate', 
        affiliateLinks: [{ url, network: 'auto' }], // Enregistrer le lien source
        categories: ['Non classifié'],
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'published',
        importMeta: { fetchedAt: admin.firestore.FieldValue.serverTimestamp(), sourceUrl: url }
    };
    // --- Fin de la simulation d'import ---

    try {
        const pRef = await db.collection('artifacts/app-id/public/data/products').add(productDoc);
        
        // Mettre à jour le compteur de produits de l'utilisateur (pour le trigger de promo)
        const userMetaRef = db.collection('artifacts/app-id/public/data/users').doc(userId);
        
        await userMetaRef.update({
            productCount: admin.firestore.FieldValue.increment(1)
        });

        return { 
            id: pRef.id, 
            title: productDoc.title, 
            image: productDoc.images[0], 
            price: productDoc.priceUsd 
        };
    } catch (error) {
        console.error("Erreur lors de l'importation du produit:", error);
        throw new functions.https.HttpsError('internal', 'Échec de l\'importation du produit.', error.message);
    }
});
