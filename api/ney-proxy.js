
// /api/ney-proxy.js

const admin = require('firebase-admin');
const fetch = require('node-fetch');

// IMPORTANT: Les identifiants de compte de service doivent être stockés comme variable d'environnement.
// Sur Vercel, ce serait un "secret".
// La variable doit contenir le JSON de la clé de compte de service encodé en base64.
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));

    // Initialiser le SDK Admin Firebase une seule fois
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
}
const db = admin.firestore();

// C'est le gestionnaire de la fonction serverless
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }
    
    // Vercel analyse le corps de la requête pour nous.
    const { prompt, uid } = req.body;
    
    if (!prompt) {
      return res.status(400).send({ error: 'empty prompt' });
    }

    const system = `Tu es Ney, assistant JEOAH\'S. Réponds en FR, clair et utile.`;

    // Accéder à la clé API depuis les variables d'environnement
    const apiKey = process.env.GENAI_KEY;
    if (!apiKey) {
      console.error('GENAI_KEY not set');
      return res.status(500).json({ error: 'GenAI key not set' });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText?key=${apiKey}`;

    const requestBody = {
      prompt: { text: system + "\n\nUtilisateur: " + prompt },
      temperature: 0.2,
      maxOutputTokens: 800
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content || data?.output?.[[0]]?.content || "Désolé, pas de réponse.";

    // Logger la conversation dans Firestore
    if (db) {
        await db.collection('conversations').add({
          uid: uid || 'guest',
          prompt,
          reply,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Error in ney-proxy:', err);
    return res.status(500).json({ error: 'server error', details: String(err) });
  }
};
