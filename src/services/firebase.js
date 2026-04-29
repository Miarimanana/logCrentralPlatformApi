const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require('../../service-account.json')),
    });
}

module.exports = admin;