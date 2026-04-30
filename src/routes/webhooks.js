const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/fluentbit', async (req, res) => {
  try {
    const records = Array.isArray(req.body) ? req.body : [req.body];
    const logs = [];
    const alerts = [];

    for (const record of records) {
      const base = {
        deviceId:  record.device_id || record.host || 'unknown',
        tenantId:  record.tenant_id || 'default',
        message:   record.MESSAGE || record.message || record.log  || '',
        severity:  parseInt(record.detected_severity) || 0,
        raw:       record,
      };

      if (record.is_alert) {
        alerts.push({ ...base, rule: record.alert_rule || null, triggeredAt: new Date() });
      } else {
        logs.push(base);
      }
    }

    if (logs.length   > 0) await prisma.log.createMany({ data: logs });
    if (alerts.length > 0) await prisma.alert.createMany({ data: alerts });

    console.log(`[WEBHOOK] ${logs.length} logs, ${alerts.length} alertes`);
    res.json({ success: true, logs: logs.length, alerts: alerts.length });

  } catch (err) {
    console.error('FluentBit webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
