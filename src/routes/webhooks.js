const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { processAlert } = require('../services/alerting');
const prisma = new PrismaClient();

router.post('/fluentbit', async(req, res) => {
    try {
        const records = Array.isArray(req.body) ? req.body : [req.body];
        const logs = [];
        let alertCount = 0;

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

        res.json({ success: true, logs: logs.length, alerts: alertCount });
    } catch (err) {
        console.error('FluentBit webhook error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;