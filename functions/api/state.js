import { getKVBinding } from './_kv';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const MAX_VALUE_BYTES = 200 * 1024; // ~200KB default guard
const MAX_META_BYTES = 1024; // Cloudflare KV metadata limit
const encoder = new TextEncoder();

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
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
      if (!result) {
        return json({ ok: false, error: 'Not found' }, { status: 404 });
      }

      const meta = normaliseMeta(result?.metadata);
      return json({ ok: true, key: keyParam, value: result?.value ?? null, meta });
    }

    if (method === 'POST') {
      const payload = await safeJson(request);
      const key = payload?.key || keyParam;
      if (!key) {
        return json({ ok: false, error: 'key required' }, { status: 400 });
      }

      const value = payload?.value ?? null;
      const meta = withMeta(payload?.meta);

      const encodedValue = JSON.stringify(value);
      const valueSize = encoder.encode(encodedValue).byteLength;
      if (valueSize > MAX_VALUE_BYTES) {
        return json({ ok: false, error: 'Value too large' }, { status: 413 });
      }

      const metaSize = encoder.encode(JSON.stringify(meta)).byteLength;
      if (metaSize > MAX_META_BYTES) {
        return json({ ok: false, error: 'Meta too large' }, { status: 413 });
      }

      await kv.put(key, encodedValue, { metadata: meta });

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

async function safeJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return {};
  }
}

function withMeta(meta) {
  const base = normaliseMeta(meta);
  if (!base.updatedAt) {
    base.updatedAt = new Date().toISOString();
  }
  return base;
}

function normaliseMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  return { ...meta };
}
