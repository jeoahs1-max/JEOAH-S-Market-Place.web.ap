
// /api/stripe-webhook.js

const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Il faut aussi une variable d'environnement pour le secret du webhook
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Initialisation de Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
}
const db = admin.firestore();

// Le corps de la requête doit être brut (Buffer) pour la vérification de la signature Stripe
// Vercel fournit une configuration pour cela.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Fonction pour lire le buffer de la requête
const buffer = (req) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const sig = req.headers['stripe-signature'];
    const reqBuffer = await buffer(req);

    let event;

    try {
        event = stripe.webhooks.constructEvent(reqBuffer, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { userId, planId, referrerUid } = paymentIntent.metadata;

        if (!userId || !planId) {
            console.error("Métadonnées manquantes dans le PaymentIntent:", paymentIntent.id);
            return res.status(400).send("Métadonnées manquantes.");
        }

        try {
            const userRef = db.collection('users').doc(userId);
            await userRef.set({
                subscription: {
                    planId: planId,
                    status: 'active',
                    startDate: admin.firestore.FieldValue.serverTimestamp(),
                }
            }, { merge: true });

            if (referrerUid && referrerUid !== 'none') {
                const referrerRef = db.collection('users').doc(referrerUid);
                await referrerRef.update({
                    referralCount: admin.firestore.FieldValue.increment(1)
                });
            }
        } catch (dbError) {
            console.error('Erreur de base de données après le paiement:', dbError);
            // Si une erreur se produit ici, il est crucial de le savoir pour pouvoir 
            // la corriger manuellement. On peut envoyer une alerte.
            return res.status(500).send('Erreur interne du serveur lors de la mise à jour des données.');
        }
    }

    res.status(200).send();
};
