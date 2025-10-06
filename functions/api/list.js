import { getKVBinding } from './_kv';

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers
    }
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return json({}, { status: 204 });
  }

  if (request.method.toUpperCase() !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const { kv } = getKVBinding(env);
  if (!kv) {
    return json({ ok: false, error: 'KV binding UPAH_KV not found' }, { status: 500 });
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'ut:snap:';
  const limitParam = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor') || undefined;
  const withValues = url.searchParams.get('values') === '1';

  let limit = Number.parseInt(limitParam || '100', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 100;
  }
  limit = Math.min(Math.max(limit, 1), 500);

  try {
    const options = { prefix, limit };
    if (cursor) {
      options.cursor = cursor;
    }

    const iter = await kv.list(options);
    const items = [];
    const keys = [];

    for (const entry of iter.keys || []) {
      const baseMeta = entry.metadata || {};
      let value;
      let metadata = baseMeta;

      if (withValues) {
        const detail = await kv.getWithMetadata(entry.name, { type: 'json' });
        value = detail?.value ?? null;
        metadata = detail?.metadata ?? baseMeta ?? {};
      }

      items.push({
        key: entry.name,
        metadata,
        ...(withValues ? { value } : {})
      });
      keys.push({ name: entry.name, metadata: metadata || {} });
    }

    return json({
      ok: true,
      prefix,
      count: items.length,
      cursor: iter.cursor || '',
      list_complete: Boolean(iter.list_complete),
      items,
      keys
    });
  } catch (err) {
    console.error('api/list error', err);
    return json({ ok: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
