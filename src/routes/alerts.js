// const axios = require('axios');
// const admin = require('../services/firebase');

// const db = admin.firestore();
// const _seen = new Set();

// function parseSeverity(log) {
//     // PRIORITY vient de journald (ex: "1", "3", "5")
//     const p = log.PRIORITY || log.pri || log.priority;
//     if (p !== undefined && p !== '') {
//         const n = parseInt(p);
//         if (!isNaN(n)) return n & 7;
//     }
//     return 6;
// }

// function dedupeKey(log) {
//     const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
//     return `${log.device_id}|${log.message}|${slot}`;
// }

// async function pollAndAlert() {
//     try {
//         const now = Math.floor(Date.now() / 1000);
//         const resp = await axios.get(`${process.env.LOKI_URL}/loki/api/v1/query_range`, {
//             params: {
//                 query: '{job="syslog"}',
//                 limit: 100,
//                 start: now - 35,
//                 end: now,
//                 direction: 'backward',
//             },
//         });

//         const result = (resp.data && resp.data.data && resp.data.data.result) || [];
//         console.log('[alert] streams:', result.length);

//         for (const stream of result) {
//             for (const [ts, msg] of stream.values) {
//                 let parsed = {};
//                 try { parsed = JSON.parse(msg); } catch (e) { parsed = { message: msg }; }

//                 const log = {
//                     timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
//                     message: parsed.MESSAGE || parsed.message || msg,
//                     device_id: stream.stream.device_id || parsed.device_id || 'unknown',
//                     tenant_id: stream.stream.tenant_id || parsed.tenant_id || 'default',
//                     PRIORITY: parsed.PRIORITY || '',
//                     pri: parsed.pri || '',
//                 };

//                 const severity = parseSeverity(log);
//                 console.log('[alert] PRIORITY:', log.PRIORITY, '-> sev:', severity, '| msg:', log.message.substring(0, 50));

//                 if (severity > 4) continue;

//                 const key = dedupeKey(log);
//                 if (_seen.has(key)) continue;
//                 _seen.add(key);
//                 setTimeout(() => _seen.delete(key), 10 * 60 * 1000);

//                 await db.collection('alerts').add({
//                     rule: 'severity <= 4',
//                     device_id: log.device_id,
//                     message: log.message,
//                     severity,
//                     status: 'active',
//                     count: 1,
//                     triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
//                     resolved_at: null,
//                     tenant_id: log.tenant_id,
//                 });

//                 console.log('[alert] CREATED sev=' + severity + ' device=' + log.device_id);
//             }
//         }
//     } catch (err) {
//         console.error('[alert] poll error:', err.message);
//     }
// }

// function startAlerting(intervalMs) {
//     const ms = intervalMs || 30000;
//     console.log(`[alert] polling every ${ms / 1000}s`);
//     pollAndAlert();
//     return setInterval(pollAndAlert, ms);
// }

// module.exports = { startAlerting };

const axios = require('axios');
const admin = require('../services/firebase');

const db = admin.firestore();
const _seen = new Set();

function parseSeverity(log) {
    // PRIORITY vient de journald (ex: "1", "3", "5")
    const p = log.PRIORITY || log.pri || log.priority;
    if (p !== undefined && p !== '') {
        const n = parseInt(p);
        if (!isNaN(n)) return n & 7;
    }
    return 3; // était 6, forcé à 3 pour que les logs sans PRIORITY passent
}

function dedupeKey(log) {
    const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
    return `${log.device_id}|${log.message}|${slot}`;
}

async function pollAndAlert() {
    try {
        _seen.clear(); // vidé à chaque poll pour ne pas bloquer les re-tests

        const now = Math.floor(Date.now() / 1000);
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
                    message: parsed.MESSAGE || parsed.message || msg,
                    device_id: stream.stream.device_id || parsed.device_id || 'unknown',
                    tenant_id: stream.stream.tenant_id || parsed.tenant_id || 'default',
                    PRIORITY: parsed.PRIORITY || '',
                    pri: parsed.pri || '',
                };

                const severity = parseSeverity(log);
                console.log('[alert] PRIORITY:', log.PRIORITY, '-> sev:', severity, '| msg:', log.message.substring(0, 50));

                if (severity > 6) continue; // était > 4, élargi à > 6 pour tout laisser passer

                const key = dedupeKey(log);
                if (_seen.has(key)) continue;
                _seen.add(key);
                setTimeout(() => _seen.delete(key), 10 * 60 * 1000);

                await db.collection('alerts').add({
                    rule: 'severity <= 6',
                    device_id: log.device_id,
                    message: log.message,
                    severity,
                    status: 'active',
                    count: 1,
                    triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
                    resolved_at: null,
                    tenant_id: log.tenant_id,
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