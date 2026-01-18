export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
        const url = new URL(request.url);
        if (request.method !== 'POST' || url.pathname !== '/remove-bg') {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        try {
            const body = await request.json();
            const imageBase64 = body?.image_base64 || '';
            if (!imageBase64) {
                return new Response(JSON.stringify({ error: 'image_base64 required' }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            const apiKey = env.WITHOUTBG_API_KEY;
            if (!apiKey) {
                return new Response(JSON.stringify({ error: 'Missing WITHOUTBG_API_KEY' }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            const apiResponse = await fetch('https://api.withoutbg.com/v1.0/alpha-channel-base64', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({ image_base64: imageBase64 })
            });
            const text = await apiResponse.text();
            return new Response(text, {
                status: apiResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }
};
