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
        const isFetchImage = url.pathname === '/fetch-image';
        if (request.method !== 'POST' && !(request.method === 'GET' && isFetchImage)) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        const corsHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        };
        try {
            if (url.pathname === '/fetch-image') {
                const imageUrl = request.method === 'GET'
                    ? (url.searchParams.get('url') || '').trim()
                    : (await request.json())?.url || '';
                const cleanUrl = String(imageUrl || '').trim();
                if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
                    return new Response(JSON.stringify({ error: 'url required' }), {
                        status: 400,
                        headers: corsHeaders
                    });
                }
                const imageResponse = await fetch(cleanUrl);
                if (!imageResponse.ok) {
                    return new Response(JSON.stringify({ error: 'image_fetch_failed' }), {
                        status: 502,
                        headers: corsHeaders
                    });
                }
                if (request.method === 'GET') {
                    const contentType = imageResponse.headers.get('content-type') || 'image/png';
                    return new Response(imageResponse.body, {
                        status: 200,
                        headers: {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
                const buffer = await imageResponse.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                }
                const base64 = btoa(binary);
                return new Response(JSON.stringify({ result_base64: base64 }), {
                    status: 200,
                    headers: corsHeaders
                });
            }
            const body = await request.json();
            const imageBase64 = body?.image_base64 || '';
            if (!imageBase64) {
                return new Response(JSON.stringify({ error: 'image_base64 required' }), {
                    status: 400,
                    headers: corsHeaders
                });
            }
            const apiKey = env.WITHOUTBG_API_KEY;
            if (!apiKey) {
                return new Response(JSON.stringify({ error: 'Missing WITHOUTBG_API_KEY' }), {
                    status: 500,
                    headers: corsHeaders
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
                headers: corsHeaders
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
                status: 500,
                headers: corsHeaders
            });
        }
    }
};
