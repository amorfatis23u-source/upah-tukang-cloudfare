import { getKVBinding } from './_kv';

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const keyParam = url.searchParams.get('key');

  if (method === 'OPTIONS') {
    return json({}, { status: 204 });
  }

  const { kv } = getKVBinding(env);
  if (!kv) {
    return json({ ok: false, error: 'KV binding UPAH_KV not found' }, { status: 500 });
  }

  try {
    if (method === 'GET') {
      if (!keyParam) {
        return json({ ok: false, error: 'key required' }, { status: 400 });
      }
      const result = await kv.getWithMetadata(keyParam, { type: 'json' });
      const value = result?.value ?? null;
      const meta = result?.metadata ?? null;
      return json({ ok: true, key: keyParam, value, meta });
    }

    if (method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch (err) {
        payload = {};
      }

      const key = payload?.key || keyParam;
      if (!key) {
        return json({ ok: false, error: 'key required' }, { status: 400 });
      }

      const value = payload?.value ?? null;
      const meta = payload && typeof payload.meta === 'object' && payload.meta !== null
        ? payload.meta
        : null;

      const options = meta ? { metadata: meta } : undefined;
      await kv.put(key, JSON.stringify(value), options);

      return json({ ok: true, key, meta });
    }

    if (method === 'DELETE') {
      if (!keyParam) {
        return json({ ok: false, error: 'key required' }, { status: 400 });
      }
      await kv.delete(keyParam);
      return json({ ok: true, key: keyParam });
    }

    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  } catch (err) {
    console.error('api/state error', err);
    return json({ ok: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
