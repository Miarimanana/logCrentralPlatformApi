const axios = require('axios');
const admin = require('../services/firebase');

const db = admin.firestore();
const _seen = new Set();

const SEVERITY_MAP = {
    emerg: 0,
    panic: 0,
    alert: 1,
    crit: 2,
    err: 3,
    error: 3,
    warn: 4,
    warning: 4,
};

function parseSeverity(log) {
    if (log.pri) {
        const n = parseInt(log.pri);
        if (!isNaN(n)) return n & 7;
    }
    if (log.level) {
        const s = SEVERITY_MAP[log.level.toLowerCase()];
        if (s !== undefined) return s;
    }
    return 6;
}

function dedupeKey(log) {
    const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
    return `${log.device_id}|${log.message}|${slot}`;
}

async function pollAndAlert() {
    try {
        const now = Math.floor(Date.now() / 1000);
        console.log('[alert] poll at', now, 'start:', now - 35);

        const resp = await axios.get(`${process.env.LOKI_URL}/loki/api/v1/query_range`, {
            params: {
                query: '{job="syslog"}',
                limit: 100,
                start: now - 35,
                end: now,
                direction: 'backward',
            },
        });

        const result = (resp.data && resp.data.data && resp.data.data.result) || [];
        console.log('[alert] streams:', result.length);

        for (const stream of result) {
            for (const [ts, msg] of stream.values) {
                let parsed = {};
                try { parsed = JSON.parse(msg); } catch (e) { parsed = { message: msg }; }

                const log = {
                    timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
                    message: parsed.message || msg,
                    device_id: stream.stream.device_id || parsed.device_id || 'unknown',
                    tenant_id: stream.stream.tenant_id || parsed.tenant_id || 'default',
                    level: stream.stream.level || parsed.level || '',
                    ident: parsed.ident || '',
                    pri: parsed.pri || '',
                };

                const severity = parseSeverity(log);
                console.log('[alert] pri:', log.pri, '-> sev:', severity, '| msg:', log.message);

                if (severity > 4) continue;

                const key = dedupeKey(log);
                if (_seen.has(key)) { console.log('[alert] dedupe skip'); continue; }
                _seen.add(key);
                setTimeout(() => _seen.delete(key), 10 * 60 * 1000);

                await db.collection('alerts').add({
                    rule: 'severity <= 4',
                    device_id: log.device_id,
                    message: log.message,
                    severity,
                    status: 'active',
                    count: 1,
                    triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
                    resolved_at: null,
                    tenant_id: log.tenant_id,
                    ident: log.ident,
                });

                console.log('[alert] CREATED sev=' + severity + ' device=' + log.device_id);
            }
        }
    } catch (err) {
        console.error('[alert] poll error:', err.message);
    }
}

function startAlerting(intervalMs) {
    const ms = intervalMs || 30000;
    console.log(`[alert] polling every ${ms / 1000}s`);
    pollAndAlert();
    return setInterval(pollAndAlert, ms);
}

module.exports = { startAlerting };