const MAX_VALUE_SIZE = 200 * 1024; // 200KB
const ALLOWED_META_KEYS = ['updatedAt', 'start', 'end', 'rumah', 'total', 'totalDays'];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) {
        return jsonResponse({ ok: false, error: 'Parameter key wajib' }, 400);
      }
      const result = await env.UPAH_KV.getWithMetadata(key, { type: 'json' });
      if (!result || result.value === null || result.value === undefined) {
        return jsonResponse({ ok: false, error: 'Data tidak ditemukan' }, 404);
      }
      return jsonResponse({ ok: true, key, value: result.value, meta: result.metadata || {} });
    }

    if (method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch (err) {
        return jsonResponse({ ok: false, error: 'Body harus JSON' }, 400);
      }
      const { key, value, meta = {} } = payload || {};
      if (typeof key !== 'string' || !key.trim()) {
        return jsonResponse({ ok: false, error: 'Key tidak valid' }, 400);
      }
      if (value === undefined) {
        return jsonResponse({ ok: false, error: 'Value tidak boleh kosong' }, 400);
      }

      const stringified = JSON.stringify(value);
      if (stringified.length > MAX_VALUE_SIZE) {
        return jsonResponse({ ok: false, error: `Payload terlalu besar (maks ${MAX_VALUE_SIZE} byte)` }, 413);
      }

      const safeMeta = {};
      if (meta && typeof meta === 'object') {
        for (const keyName of ALLOWED_META_KEYS) {
          if (meta[keyName] !== undefined) {
            safeMeta[keyName] = meta[keyName];
          }
        }
      }
      safeMeta.valueSize = stringified.length;

      await env.UPAH_KV.put(key, stringified, { metadata: safeMeta });
      return jsonResponse({ ok: true, key, meta: safeMeta });
    }

    if (method === 'DELETE') {
      const key = url.searchParams.get('key');
      if (!key) {
        return jsonResponse({ ok: false, error: 'Parameter key wajib' }, 400);
      }
      await env.UPAH_KV.delete(key);
      return jsonResponse({ ok: true, key });
    }

    return jsonResponse({ ok: false, error: 'Metode tidak didukung' }, 405);
  } catch (err) {
    console.error('api/state error', err);
    return jsonResponse({ ok: false, error: 'Terjadi kesalahan internal' }, 500);
  }
}
