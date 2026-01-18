const http = require('http');
const https = require('https');

const API_KEY = process.env.WITHOUTBG_API_KEY || 'sk-005e55b6a048a9b303054d238b8d805f951431f70ffd56850d92aa91bfd70e3e';
const ENDPOINT = 'https://api.withoutbg.com/v1.0/alpha-channel-base64';

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(payload));
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
                'X-API-Key': API_KEY
            }
        }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    res.end(body);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        });
        return res.end();
    }
    if (req.method !== 'POST' || req.url !== '/remove-bg') {
        return sendJson(res, 404, { error: 'Not found' });
    }
    try {
        const raw = await readBody(req);
        const data = JSON.parse(raw || '{}');
        let imageBase64 = data.image_base64;
        if (!imageBase64 && data.image_url) {
            const buffer = await fetchBuffer(data.image_url);
            imageBase64 = buffer.toString('base64');
        }
        if (!imageBase64) return sendJson(res, 400, { error: 'image_base64 required' });
        const response = await postJson(ENDPOINT, { image_base64: imageBase64 });
        if (response.status !== 200) {
            return sendJson(res, response.status, { error: response.body });
        }
        const parsed = JSON.parse(response.body);
        return sendJson(res, 200, parsed);
    } catch (err) {
        return sendJson(res, 500, { error: err.message });
    }
});

server.listen(8787, () => {
    console.log('withoutbg proxy listening on http://localhost:8787/remove-bg');
});
