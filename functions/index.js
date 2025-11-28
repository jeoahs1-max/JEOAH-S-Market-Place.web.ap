
// functions/index.js
const functions = require(\'firebase-functions\');
const admin = require(\'firebase-admin\');
const fetch = require(\'node-fetch\');

// Initialisation de Stripe avec votre clé secrète
const stripe = require(\'stripe\')(\'sk_test_51SYNGF1alLKcRmX5V3MXvLWRnj7gpt2WNXEHHleOCmRFsRswx0d23TvuEeoEpwa23NAd20SkfNaOllqODR8vdeVD002a3BUmMB\');

admin.initializeApp();
const db = admin.firestore();

// Définition des plans d\'abonnement (en centimes)
const plans = {
    monthly: { amount: 1999, currency: \'usd\', name: \'Plan Mensuel\' },
    quarterly: { amount: 4999, currency: \'usd\', name: \'Plan Trimestriel\' },
    \'semi-annual\': { amount: 9999, currency: \'usd\', name: \'Plan Semestriel\' },
    annual: { amount: 25000, currency: \'usd\', name: \'Plan Annuel\' }
};

// Fonction existante (inchangée)
exports.neyProxy = functions.https.onRequest(async (req, res) => {
    // ... (votre code existant pour neyProxy)
});

/**
 * Crée une intention de paiement Stripe basée sur le plan choisi par l\'utilisateur.
 * Prend en compte un éventuel code de parrainage.
 */
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(\'unauthenticated\', \'Vous devez être connecté pour payer.\');
    }

    const { planId, referralCode } = data;
    const plan = plans[planId];
    const uid = context.auth.uid;

    if (!plan) {
        throw new functions.https.HttpsError(\'invalid-argument\', \'Le plan demandé n\\\'existe pas.\');
    }

    let amount = plan.amount;
    let referrerUid = null;

    // TODO: Appliquer les réductions basées sur le parrainage si nécessaire
    // Pour l\'instant, nous enregistrons simplement qui est le parrain

    if (referralCode) {
        const userQuery = await db.collection(\'users\').where(\'referralCode\', \'==\', referralCode).limit(1).get();
        if (!userQuery.empty) {
            const referrer = userQuery.docs[0];
            referrerUid = referrer.id;
            // Ne pas permettre l'auto-parrainage
            if (referrerUid === uid) {
                referrerUid = null;
            }
        }
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: plan.currency,
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: uid,
                planId: planId,
                // On ajoute l\'ID du parrain aux métadonnées pour le retrouver après le paiement
                referrerUid: referrerUid || \'none\' 
            }
        });

        return {
            clientSecret: paymentIntent.client_secret,
        };
    } catch (error) {
        console.error("Erreur Stripe: ", error);
        throw new functions.https.HttpsError(\'internal\', \'Erreur lors de la création de l\\\'intention de paiement.\');
    }
});

/**
 * Gère les événements de Stripe, notamment la réussite d'un paiement.
 * C\'est ici que l\'on met à jour les droits de l\'utilisateur et le compteur du parrain.
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers[\'stripe-signature\'];
    // Clé secrète du webhook Stripe - À CONFIGURER DANS VOTRE DASHBOARD STRIPE
    const endpointSecret = \'whsec_VOTRE_SECRET_WEBHOOK_STRIPE\';

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
        console.error(\`Webhook signature verification failed.\`, err.message);
        return res.status(400).send(\`Webhook Error: \${err.message}\`);
    }

    // Gérer l'événement de paiement réussi
    if (event.type === \'payment_intent.succeeded\') {
        const paymentIntent = event.data.object;
        const { userId, planId, referrerUid } = paymentIntent.metadata;

        if (!userId || !planId) {
            console.error("Métadonnées manquantes dans le PaymentIntent:", paymentIntent.id);
            return res.status(400).send("Métadonnées manquantes.");
        }

        // 1. Mettre à jour le statut de l\'abonnement de l\'utilisateur payeur
        const userRef = db.collection(\'users\').doc(userId);
        await userRef.set({
            subscription: {
                planId: planId,
                status: \'active\',
                startDate: admin.firestore.FieldValue.serverTimestamp(),
                // TODO: Calculer la date de fin en fonction du plan
            }
        }, { merge: true });

        // 2. Mettre à jour le compteur du parrain, s\'il y en a un
        if (referrerUid && referrerUid !== \'none\') {
            const referrerRef = db.collection(\'users\').doc(referrerUid);
            await referrerRef.update({
                referralCount: admin.firestore.FieldValue.increment(1)
            });
            
            // TODO: Ajouter une logique pour notifier le parrain (par ex. avec Ney)
        }
    }

    res.status(200).send();
});

https://us-central1-jeoahs1-max-03326376-49b27.cloudfunctions.net/stripeWebhook
