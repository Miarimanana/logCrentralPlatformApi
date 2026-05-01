const axios = require('axios');
const admin = require('./firebase');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const db = admin.firestore();
const _seen = new Set();

function parseSeverity(parsed) {
    const p = parsed.PRIORITY || parsed.pri || parsed.priority;
    if (p !== undefined && p !== '') {
        const n = parseInt(p);
        if (!isNaN(n)) return n & 7;
    }
    return 6;
}

function dedupeKey(log) {
    const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
    return log.device_id + '|' + log.message + '|' + slot;
}

async function sendPushToTenant(tenantId, alert) {
    try {
        if (!admin.apps.length) return;

        const users = await prisma.user.findMany({
            where: { tenantId: tenantId },
            select: { fcmToken: true },
        });

        const tokens = [];
        for (const user of users) {
            if (user.fcmToken) tokens.push(user.fcmToken);
        }
        if (tokens.length === 0) return;

        const severity = alert.severity;
        const labels = ['EMERG', 'ALERT', 'CRIT', 'ERROR', 'WARN', 'NOTICE', 'INFO', 'DEBUG'];
        const label = labels[Math.min(severity, 7)];

        await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: '[' + label + '] ' + alert.device_id,
                body: alert.message || 'Alerte système',
            },
            data: {
                severity: String(severity),
                deviceId: alert.device_id,
                tenantId: alert.tenant_id,
                alertId: alert.id || '',
            },
            android: { priority: severity <= 3 ? 'high' : 'normal' },
        });

        console.log('[alert] FCM envoyé → ' + tokens.length + ' device(s) tenant=' + tenantId);
    } catch (err) {
        console.error('[alert] FCM error:', err.message);
    }
}

async function pollAndAlert() {
    try {
        _seen.clear();
        const now = Math.floor(Date.now() / 1000);

        const resp = await axios.get(process.env.LOKI_URL + '/loki/api/v1/query_range', {
            params: {
                query: '{job="syslog"}',
                limit: 100,
                start: now - 35,
                end: now,
                direction: 'backward',
            },
        });

        const data = resp.data;
        const result = (data && data.data && data.data.result) ? data.data.result : [];
        console.log('[alert] streams:', result.length);

        for (var i = 0; i < result.length; i++) {
            var stream = result[i];
            for (var j = 0; j < stream.values.length; j++) {
                var ts = stream.values[j][0];
                var msg = stream.values[j][1];

                var parsed = {};
                try { parsed = JSON.parse(msg); } catch (e) { parsed = { message: msg }; }

                var severity = parseSeverity(parsed);
                var log = {
                    timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
                    message: parsed.MESSAGE || parsed.message || msg,
                    device_id: (stream.stream && stream.stream.device_id) ? stream.stream.device_id : (parsed.device_id || 'unknown'),
                    tenant_id: (stream.stream && stream.stream.tenant_id) ? stream.stream.tenant_id : (parsed.tenant_id || 'default'),
                };

                console.log('[alert] sev:', severity, '| msg:', log.message.substring(0, 60));

                if (severity > 4) continue;

                var key = dedupeKey(log);
                if (_seen.has(key)) continue;
                _seen.add(key);
                setTimeout(function(k) {
                    return function() { _seen.delete(k); };
                }(key), 10 * 60 * 1000);

                var doc = await db.collection('alerts').add({
                    rule: 'severity <= 4',
                    device_id: log.device_id,
                    message: log.message,
                    severity: severity,
                    status: 'active',
                    count: 1,
                    triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
                    resolved_at: null,
                    tenant_id: log.tenant_id,
                });

                console.log('[alert] CREATED sev=' + severity + ' device=' + log.device_id + ' id=' + doc.id);

                if (severity <= 3) {
                    await sendPushToTenant(log.tenant_id, { id: doc.id, severity: severity, message: log.message, device_id: log.device_id, tenant_id: log.tenant_id });
                }
            }
        }
    } catch (err) {
        console.error('[alert] poll error:', err.message);
    }
}

// Appelé depuis webhook Fluent Bit si tu gardes aussi ce flux
async function processAlert(alertData) {
    const alert = await prisma.alert.create({ data: alertData });
    console.log('[alert] créé id=' + alert.id + ' sev=' + alert.severity + ' device=' + alert.deviceId);
    if (alert.severity <= 3) {
        await sendPushToTenant(alert.tenantId, alert);
    }
    return alert;
}

function startAlerting(intervalMs) {
    var ms = intervalMs || 30000;
    console.log('[alert] polling every ' + (ms / 1000) + 's');
    pollAndAlert();
    return setInterval(pollAndAlert, ms);
}

module.exports = { startAlerting, processAlert };