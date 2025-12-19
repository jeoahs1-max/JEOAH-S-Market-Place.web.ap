
// /api/create-payment-intent.js

const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Initialisation de Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
}
const db = admin.firestore();

const plans = {
    monthly: { amount: 1999, currency: 'usd', name: 'Plan Mensuel' },
    quarterly: { amount: 4999, currency: 'usd', name: 'Plan Trimestriel' },
    'semi-annual': { amount: 9999, currency: 'usd', name: 'Plan Semestriel' },
    annual: { amount: 25000, currency: 'usd', name: 'Plan Annuel' }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // IMPORTANT : Sur Vercel, nous n'avons pas `context.auth` comme dans Firebase Functions.
    // L'authentification doit être gérée différemment. Une méthode courante est de passer 
    // un jeton d'identification (ID Token) dans l'en-tête `Authorization`.
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).json({ error: 'unauthenticated', message: 'Vous devez être connecté pour payer.' });
    }

    try {
        // Vérifier le jeton avec Firebase Admin pour obtenir les infos de l'utilisateur
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { planId, referralCode } = req.body;
        const plan = plans[planId];

        if (!plan) {
            return res.status(400).json({ error: 'invalid-argument', message: 'Le plan demandé n\\\'existe pas.' });
        }

        let amount = plan.amount;
        let referrerUid = null;

        if (referralCode) {
            const userQuery = await db.collection('users').where('referralCode', '==', referralCode).limit(1).get();
            if (!userQuery.empty) {
                const referrer = userQuery.docs[0];
                referrerUid = referrer.id;
                if (referrerUid === uid) {
                    referrerUid = null; // Pas d'auto-parrainage
                }
            }
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: plan.currency,
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: uid,
                planId: planId,
                referrerUid: referrerUid || 'none'
            }
        });

        return res.status(200).json({ clientSecret: paymentIntent.client_secret });

    } catch (error) {
        console.error("Erreur: ", error);
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return res.status(401).json({ error: 'unauthenticated', message: 'Jeton d\'authentification invalide ou expiré.' });
        }
        return res.status(500).json({ error: 'internal', message: 'Erreur lors de la création de l\\\'intention de paiement.' });
    }
};
