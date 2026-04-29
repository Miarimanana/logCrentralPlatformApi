const router = require('express').Router();
const { Firestore } = require('@google-cloud/firestore');

// Initialize Firestore with the Firebase service account
const firestore = new Firestore({
    projectId: 'logcentral-platform',
    keyFilename: require('path').join(__dirname, '../../../logcentral_app/android/app/google-services.json'),
});

// POST /api/webhooks/fluentbit — reçoit les alertes de Fluent Bit
router.post('/fluentbit', async(req, res) => {
    try {
        const record = req.body;

        // Vérifier si c'est une alerte critique
        if (!record.is_alert) {
            return res.json({ success: true, skipped: true });
        }

        const alertData = {
            rule: record.alert_rule || 'syslog_critical',
            device_id: record.device_id || record.host || 'unknown',
            message: record.message || 'Alerte système',
            severity: record.detected_severity || 2,
            status: 'active',
            count: 1,
            tenant_id: record.tenant_id || 'default',
            triggered_at: Firestore.Timestamp.now(),
        };

        // Écrire dans Firestore
        const docRef = await firestore.collection('alerts').add(alertData);

        console.log(`[ALERT] Created: ${docRef.id} - Severity: ${alertData.severity}`);

        res.json({ success: true, alertId: docRef.id });
    } catch (err) {
        console.error('FluentBit webhook error:', err.message);
        res.status(500).json({ error: 'Erreur traitement alerte' });
    }
});

module.exports = router;