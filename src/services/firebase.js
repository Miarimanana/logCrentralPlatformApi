// const admin = require('firebase-admin');

// if (!admin.apps.length) {
//     admin.initializeApp({
//         credential: admin.credential.cert(require('../../service-account.json')),
//     });
// }

// module.exports = admin;const admin = require('firebase-admin');

const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialisé avec succès.");
    } catch (error) {
        console.error("Erreur d'initialisation Firebase :", error.message);
    }
}

module.exports = admin;