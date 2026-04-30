const admin = require('./firebase');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Envoi notification FCM au tenant
async function sendPushToTenant(tenantId, alert) {
  try {
    if (!admin.apps.length) return;

    // Récupère les tokens FCM des users du tenant
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { fcmToken: true },
    });

    const tokens = users.map(u => u.fcmToken).filter(Boolean);
    if (tokens.length === 0) return;

    const severity = alert.severity;
    const labels   = ['EMERG','ALERT','CRIT','ERROR','WARN','NOTICE','INFO','DEBUG'];
    const label    = labels[Math.min(severity, 7)];

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `[${label}] ${alert.deviceId}`,
        body:  alert.message || 'Alerte système',
      },
      data: {
        severity:  String(severity),
        deviceId:  alert.deviceId,
        tenantId:  alert.tenantId,
        alertId:   alert.id || '',
      },
      android: { priority: severity <= 3 ? 'high' : 'normal' },
    });

    console.log(`[alert] FCM envoyé → ${tokens.length} device(s) tenant=${tenantId}`);
  } catch (err) {
    console.error('[alert] FCM error:', err.message);
  }
}

// Appelé depuis le webhook quand is_alert = true
async function processAlert(alertData) {
  try {
    const alert = await prisma.alert.create({ data: alertData });
    console.log(`[alert] créé id=${alert.id} sev=${alert.severity} device=${alert.deviceId}`);

    // Notifier seulement si critique (sev <= 3)
    if (alert.severity <= 3) {
      await sendPushToTenant(alert.tenantId, alert);
    }

    return alert;
  } catch (err) {
    console.error('[alert] processAlert error:', err.message);
  }
}

function startAlerting() {
  console.log('[alert] prêt — alertes via webhook Fluent Bit');
}

module.exports = { startAlerting, processAlert };
