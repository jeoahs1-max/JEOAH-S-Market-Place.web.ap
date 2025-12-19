
// /api/send-welcome-email.js

const admin = require('firebase-admin');

// Initialisation de Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
}
const db = admin.firestore();

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // On pourrait aussi sécuriser cet endpoint avec un ID token comme pour les paiements
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'missing_email', message: 'L\'adresse e-mail est requise.' });
    }

    try {
        // La logique est la même : ajouter un document à la collection 'mail'
        // que l'extension "Trigger Email" va traiter.
        await db.collection('mail').add({
            to: email,
            template: {
                name: 'welcome', // Nom du template
                data: {},
            },
        });
        console.log(`E-mail de bienvenue mis en file d'attente pour ${email}`);
        return res.status(200).json({ success: true, message: 'Email queued.' });
    } catch (error) {
        console.error("Erreur lors de l'ajout de l'e-mail à la collection 'mail':", error);
        return res.status(500).json({ error: 'internal', message: 'Erreur lors de la mise en file d\'attente de l\'e-mail.' });
    }
};
