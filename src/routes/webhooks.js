// const router = require('express').Router();
// const { PrismaClient } = require('@prisma/client');
// const { processAlert } = require('../services/alerting');
// const prisma = new PrismaClient();

// router.post('/fluentbit', async(req, res) => {
//     try {
//         const records = Array.isArray(req.body) ? req.body : [req.body];
//         const logs = [];
//         let alertCount = 0;

//         for (const record of records) {
//             const severity = parseInt(record.PRIORITY || record.detected_severity) || 6;
//             const base = {
//                 deviceId: record.device_id || record.host || 'unknown',
//                 tenantId: record.tenant_id || 'default',
//                 message: record.MESSAGE || record.message || record.log || '',
//                 severity,
//             };

//             if (record.is_alert || severity <= 3) {
//                 // Alerte critique → PostgreSQL + FCM push
//                 await processAlert({
//                     ...base,
//                     rule: record.alert_rule || `severity_${severity}`,
//                     status: 'active',
//                     triggeredAt: new Date(),
//                 });
//                 alertCount++;
//             } else {
//                 logs.push(base);
//             }
//         }

//         if (logs.length > 0) await prisma.log.createMany({ data: logs });

//         res.json({ success: true, logs: logs.length, alerts: alertCount });
//     } catch (err) {
//         console.error('FluentBit webhook error:', err.message);
//         res.status(500).json({ error: err.message });
//     }
// });

// module.exports = router;

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { processAlert } = require('../services/alerting');
const prisma = new PrismaClient();

// ── Helper : mettre à jour lastSeenAt sans bloquer la réponse ─────────────────
async function touchDevice(token) {
    if (!token) return;
    try {
        await prisma.device.update({
            where: { token },
            data: { online: true, lastSeenAt: new Date() },
        });
    } catch (_) {
        // Token inconnu → on ignore silencieusement
    }
}

// ── POST /api/webhooks/fluentbit ──────────────────────────────────────────────
router.post('/fluentbit', async(req, res) => {
    try {
        const records = Array.isArray(req.body) ? req.body : [req.body];
        const logs = [];
        let alertCount = 0;

        // Token dans le header (envoyé par Fluent-Bit)
        const token = req.headers['x-device-token'] || (req.body && req.body.token);

        for (const record of records) {
            const severity = parseInt(record.PRIORITY || record.detected_severity) || 6;
            const base = {
                deviceId: record.device_id || record.host || 'unknown',
                tenantId: record.tenant_id || 'default',
                message: record.MESSAGE || record.message || record.log || '',
                severity,
            };

            if (record.is_alert || severity <= 3) {
                // Alerte critique → PostgreSQL + FCM push
                await processAlert({
                    ...base,
                    rule: record.alert_rule || `severity_${severity}`,
                    status: 'active',
                    triggeredAt: new Date(),
                });
                alertCount++;
            } else {
                logs.push(base);
            }
        }

        if (logs.length > 0) await prisma.log.createMany({ data: logs });

        // Mise à jour statut après traitement des logs
        if (token) {
            touchDevice(token);
        } else if (records[0]) {
            const deviceId = records[0].device_id || records[0].host;
            if (deviceId) {
                prisma.device.updateMany({
                    where: { deviceId },
                    data: { online: true, lastSeenAt: new Date() },
                }).catch(function() {});
            }
        }

        res.json({ success: true, logs: logs.length, alerts: alertCount });
    } catch (err) {
        console.error('FluentBit webhook error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;