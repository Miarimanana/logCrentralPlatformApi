const admin = require('firebase-admin');
if (!admin.apps.length) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
            serviceAccount = require('../../service-account.json');
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialisé avec succès.");
    } catch (error) {
        console.error("Erreur d'initialisation Firebase :", error.message);
    }
}
module.exports = admin;

