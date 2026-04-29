const http = require('http');

const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';

async function queryLoki(query) {
    return new Promise((resolve) => {
        const url = `${LOKI_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`;

        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const result = json && json.data && json.data.result && json.data.result[0];
                    if (!result) return resolve(0);
                    const val = result.value && result.value[1];
                    resolve(parseFloat(val || 0) || 0);
                } catch {
                    resolve(0);
                }
            });
        }).on('error', (e) => {
            console.warn('[Loki] queryLoki echouee:', e.message);
            resolve(0);
        });
    });
}

async function queryLokiCount(query) {
    return new Promise((resolve) => {
        const url = `${LOKI_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`;

        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const results = (json && json.data && json.data.result) || [];
                    resolve(results.length);
                } catch {
                    resolve(0);
                }
            });
        }).on('error', (e) => {
            console.warn('[Loki] queryLokiCount echouee:', e.message);
            resolve(0);
        });
    });
}

module.exports = { queryLoki, queryLokiCount };