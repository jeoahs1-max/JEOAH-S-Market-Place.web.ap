
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialisation SÉCURISÉE de Stripe
// La clé secrète est récupérée depuis la configuration de l'environnement Firebase.
const stripe = require('stripe')(functions.config().stripe.key);

admin.initializeApp();
const db = admin.firestore();

// Définition des plans d'abonnement (en centimes)
const plans = {
    monthly: { amount: 1999, currency: 'usd', name: 'Plan Mensuel' },
    quarterly: { amount: 4999, currency: 'usd', name: 'Plan Trimestriel' },
    'semi-annual': { amount: 9999, currency: 'usd', name: 'Plan Semestriel' },
    annual: { amount: 25000, currency: 'usd', name: 'Plan Annuel' }
};

/*
 * NOTE POUR L'UTILISATEUR :
 * La fonction neyProxy est désactivée car le plan gratuit de Firebase ("Spark")
 * interdit les appels réseau sortants.
 * Pour la réactiver, passez votre projet Firebase au plan payant "Blaze".
 *
exports.neyProxy = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { prompt, uid } = req.body;
    if(!prompt) return res.status(400).send({error:'empty prompt'});

    const system = `Tu es Ney, assistant JEOAH\'S. Réponds en FR, clair et utile.`;

    const apiKey = functions.config().genai?.key || process.env.GENAI_KEY;
    if(!apiKey) return res.status(500).json({error:'GenAI key not set'});

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText?key=' + apiKey;

    const body = {
      prompt: { text: system + "\n\nUtilisateur: " + prompt },
      temperature: 0.2,
      maxOutputTokens: 800
    };

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const j = await r.json();
    const reply = j?.candidates?.[0]?.content || j?.output?.[[0]]?.content || "Désolé, pas de réponse.";

    await admin.firestore().collection('conversations').add({
      uid: uid || 'guest',
      prompt, reply, createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error', details: String(err) });
  }
});
*/

/**
 * Crée une intention de paiement Stripe basée sur le plan choisi par l'utilisateur.
 */
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté pour payer.');
    }

    const { planId, referralCode } = data;
    const plan = plans[planId];
    const uid = context.auth.uid;

    if (!plan) {
        throw new functions.https.HttpsError('invalid-argument', 'Le plan demandé n\'existe pas.');
    }

    let amount = plan.amount;
    let referrerUid = null;

    if (referralCode) {
        const userQuery = await db.collection('users').where('referralCode', '==', referralCode).limit(1).get();
        if (!userQuery.empty) {
            const referrer = userQuery.docs[0];
            referrerUid = referrer.id;
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
                referrerUid: referrerUid || 'none' 
            }
        });

        return {
            clientSecret: paymentIntent.client_secret,
        };
    } catch (error) {
        console.error("Erreur Stripe: ", error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la création de l\'intention de paiement.');
    }
});

/**
 * Gère les événements de Stripe (webhooks).
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    // Clé secrète du webhook, récupérée de manière sécurisée.
    const endpointSecret = functions.config().stripe.webhook_secret;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
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
    }

    res.status(200).send();
});

/**
 * Envoie un e-mail de bienvenue aux nouveaux utilisateurs.
 */
exports.sendWelcomeEmail = functions.auth.user().onCreate(async (user) => {
  const { email, uid } = user;

  if (!email) {
    console.log(`L'utilisateur ${uid} n'a pas d'adresse e-mail.`);
    return;
  }

  try {
    await db.collection('mail').add({
      to: email,
      template: {
        name: 'welcome',
        data: {},
      },
    });
    console.log(`E-mail de bienvenue mis en file d'attente pour ${email}`);
  } catch (error) {
    console.error("Erreur lors de l'ajout de l'e-mail à la collection 'mail':", error);
  }
});
