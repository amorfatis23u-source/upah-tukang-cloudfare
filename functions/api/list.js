import { getKVBinding } from './_kv';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
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
  const prefix = url.searchParams.get('prefix') ?? 'ut:snap:';
  const cursor = url.searchParams.get('cursor') || undefined;
  const withValues = url.searchParams.get('values') === '1';

  let limit = Number.parseInt(url.searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = DEFAULT_LIMIT;
  }
  limit = Math.min(Math.max(limit, 1), MAX_LIMIT);

  try {
    const listOptions = { prefix, limit };
    if (cursor) {
      listOptions.cursor = cursor;
    }

    const iter = await kv.list(listOptions);
    const keys = [];
    const items = [];

    for (const entry of iter.keys || []) {
      const fallbackMeta = normaliseMeta(entry.metadata);
      let resolvedMeta = fallbackMeta;
      let value;

      if (withValues) {
        const detail = await kv.getWithMetadata(entry.name, { type: 'json' });
        value = detail?.value ?? null;
        const metaFromDetail = normaliseMeta(detail?.metadata);
        if (Object.keys(metaFromDetail).length > 0) {
          resolvedMeta = metaFromDetail;
        }
      }

      const keyInfo = { name: entry.name, metadata: resolvedMeta, meta: resolvedMeta };
      keys.push(keyInfo);

      const item = { key: entry.name, name: entry.name, metadata: resolvedMeta, meta: resolvedMeta };
      if (withValues) {
        item.value = value;
      }
      items.push(item);
    }

    const nextCursor = iter.list_complete ? null : (iter.cursor || null);

    return json({
      ok: true,
      prefix,
      count: items.length,
      cursor: nextCursor,
      list_complete: Boolean(iter.list_complete),
      items,
      keys
    });
  } catch (err) {
    console.error('api/list error', err);
    return json({ ok: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

function normaliseMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  return { ...meta };
}
