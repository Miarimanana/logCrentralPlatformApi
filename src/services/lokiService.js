// const http = require('http');

// // const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';
// const LOKI_URL = process.env.LOKI_URL || 'http://loki.railway.internal:3100';

// async function queryLoki(query) {
//     return new Promise((resolve) => {
//         const url = `${LOKI_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`;

//         http.get(url, (res) => {
//             let data = '';
//             res.on('data', chunk => data += chunk);
//             res.on('end', () => {
//                 try {
//                     const json = JSON.parse(data);
//                     const result = json && json.data && json.data.result && json.data.result[0];
//                     if (!result) return resolve(0);
//                     const val = result.value && result.value[1];
//                     resolve(parseFloat(val || 0) || 0);
//                 } catch {
//                     resolve(0);
//                 }
//             });
//         }).on('error', (e) => {
//             console.warn('[Loki] queryLoki echouee:', e.message);
//             resolve(0);
//         });
//     });
// }

// async function queryLokiCount(query) {
//     return new Promise((resolve) => {
//         const url = `${LOKI_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`;

//         http.get(url, (res) => {
//             let data = '';
//             res.on('data', chunk => data += chunk);
//             res.on('end', () => {
//                 try {
//                     const json = JSON.parse(data);
//                     const results = (json && json.data && json.data.result) || [];
//                     resolve(results.length);
//                 } catch {
//                     resolve(0);
//                 }
//             });
//         }).on('error', (e) => {
//             console.warn('[Loki] queryLokiCount echouee:', e.message);
//             resolve(0);
//         });
//     });
// }

// module.exports = { queryLoki, queryLokiCount };

const http = require('http');

const LOKI_URL = process.env.LOKI_URL || 'http://loki.railway.internal:3100';

// ─── Helper interne : GET + log tout ─────────────────────────────────────────
function lokiGet(url) {
    return new Promise((resolve) => {
        console.log('[Loki] GET', url);
        http.get(url, (res) => {
            let data = '';
            res.on('data', function(chunk) { data += chunk; });
            res.on('end', function() {
                console.log('[Loki] status:', res.statusCode, '| body:', data.substring(0, 500));
                try {
                    resolve({ ok: true, json: JSON.parse(data) });
                } catch (e) {
                    console.error('[Loki] JSON parse erreur:', e.message);
                    resolve({ ok: false, json: null });
                }
            });
        }).on('error', function(e) {
            console.error('[Loki] HTTP erreur:', e.message);
            resolve({ ok: false, json: null });
        });
    });
}

// ─── queryLoki : retourne une valeur scalaire ─────────────────────────────────
async function queryLoki(query) {
    const url = LOKI_URL + '/loki/api/v1/query?query=' + encodeURIComponent(query);
    const res = await lokiGet(url);
    if (!res.ok || !res.json) return 0;

    const results = (res.json.data && res.json.data.result) || [];
    console.log('[Loki] queryLoki results:', results.length, '| query:', query.substring(0, 120));

    if (results.length === 0) return 0;

    const first = results[0];

    // instant query → value[1]
    if (first.value && first.value[1] !== undefined) {
        const parsed = parseFloat(first.value[1]) || 0;
        console.log('[Loki] queryLoki valeur (instant):', parsed);
        return parsed;
    }

    // range query → dernière entrée de values
    if (first.values && first.values.length > 0) {
        const last = first.values[first.values.length - 1];
        const parsed = parseFloat(last[1]) || 0;
        console.log('[Loki] queryLoki valeur (range):', parsed);
        return parsed;
    }

    return 0;
}

// ─── queryLokiCount : retourne le nombre de streams distincts ─────────────────
async function queryLokiCount(query) {
    const url = LOKI_URL + '/loki/api/v1/query?query=' + encodeURIComponent(query);
    const res = await lokiGet(url);
    if (!res.ok || !res.json) return 0;

    const results = (res.json.data && res.json.data.result) || [];
    console.log('[Loki] queryLokiCount streams:', results.length, '| query:', query.substring(0, 120));
    return results.length;
}

// ─── debugSample : voir le format brut des logs d'un tenant ──────────────────
async function debugSample(tenantName) {
    console.log('\n[Loki DEBUG] ====== SAMPLE pour tenant:', tenantName, '======');

    const since = Date.now() - 3600000; // 1h
    const url = LOKI_URL + '/loki/api/v1/query_range' +
        '?query=' + encodeURIComponent('{tenant_id="' + tenantName + '"}') +
        '&limit=5' +
        '&start=' + since + '000000';

    const lokiRes = await lokiGet(url);
    if (!lokiRes.ok || !lokiRes.json) {
        console.log('[Loki DEBUG] Loki injoignable');
        return;
    }

    const results = (lokiRes.json.data && lokiRes.json.data.result) || [];
    console.log('[Loki DEBUG] Streams trouvés:', results.length);

    if (results.length === 0) {
        // Lister tous les tenants disponibles dans Loki
        const allUrl = LOKI_URL + '/loki/api/v1/query_range' +
            '?query=' + encodeURIComponent('{tenant_id=~".+"}') +
            '&limit=3&start=' + since + '000000';
        const allRes = await lokiGet(allUrl);
        const allResults = (allRes.json && allRes.json.data && allRes.json.data.result) || [];
        const tenants = allResults.map(function(r) {
            return r.stream && r.stream.tenant_id;
        }).filter(Boolean);
        console.log('[Loki DEBUG] Tenants dispo dans Loki:', tenants);
        console.log('[Loki DEBUG] =======================================\n');
        return;
    }

    console.log('[Loki DEBUG] Labels stream[0]:', JSON.stringify(results[0].stream));

    var values = [];
    results.forEach(function(r) {
        if (r.values) values = values.concat(r.values);
    });
    values = values.slice(-5);

    values.forEach(function(entry, i) {
        var line = entry[1];
        console.log('[Loki DEBUG] Log[' + i + '] RAW:', line.substring(0, 400));
        try {
            var parsed = JSON.parse(line);
            console.log('[Loki DEBUG] Log[' + i + '] JSON keys:', Object.keys(parsed).join(', '));
            ['pri', 'level', 'severity', 'PRIORITY', 'priority', 'syslog_severity'].forEach(function(k) {
                if (parsed[k] !== undefined)
                    console.log('[Loki DEBUG] Log[' + i + ']   ' + k + ' =', parsed[k]);
            });
        } catch (e) {
            console.log('[Loki DEBUG] Log[' + i + '] → pas du JSON (syslog brut)');
        }
    });

    console.log('[Loki DEBUG] =======================================\n');
}

module.exports = { queryLoki, queryLokiCount, debugSample };