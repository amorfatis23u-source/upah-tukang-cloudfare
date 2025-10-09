const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestGet({ request, env }) {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method.toUpperCase() !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const kv = env?.UPAH_KV;
  if (!kv) {
    return new Response(JSON.stringify({ ok: false, error: 'KV binding UPAH_KV not found' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'ut:snap:';
  const cursor = url.searchParams.get('cursor') || undefined;
  const limitParam = url.searchParams.get('limit');

  let limit = Number.parseInt(limitParam || '100', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 100;
  }
  limit = Math.min(Math.max(limit, 1), 500);

  try {
    const { keys: batch = [], list_complete: complete, cursor: nextCursor = '' } = await kv.list({ prefix, cursor, limit });
    const keys = batch.map((entry) => ({ name: entry.name }));

    return new Response(JSON.stringify({
      ok: true,
      prefix,
      count: keys.length,
      cursor: nextCursor || '',
      list_complete: Boolean(complete),
      keys
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    console.error('api/list error', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

export const onRequest = onRequestGet;
