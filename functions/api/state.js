export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    if (method === 'POST') {
      const body = await request.json();
      if (!body || typeof body !== 'object') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Body kosong/invalid' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
        );
      }
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '');
      const uuid = crypto.randomUUID().slice(0, 8);
      const periodeStart = body.periodeStart || '';
      const periodeEnd = body.periodeEnd || '';
      const rumah = body.rumah || '';
      const key = periodeStart && periodeEnd && rumah
        ? `ut:snap:${periodeStart}:${periodeEnd}:${rumah}:${ts}-${uuid}`
        : `ut:snap:${ts}-${uuid}`;

      const snapshot = {
        snapshot_id: key,
        saved_at: now.toISOString(),
        schema_version: '1.0.0',
        data: body
      };

      await env.UPAH_KV.put(key, JSON.stringify(snapshot), {
        metadata: { form_id: body.form_id || 'unknown' }
      });
      return new Response(
        JSON.stringify({ ok: true, key }),
        { headers: { 'Content-Type': 'application/json', ...cors } }
      );
    }

    if (method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response(
          JSON.stringify({ ok: false, error: 'key wajib' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
        );
      }
      const raw = await env.UPAH_KV.get(key);
      if (!raw) {
        return new Response(
          JSON.stringify({ ok: false, error: 'not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...cors } }
        );
      }
      return new Response(raw, { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    if (method === 'DELETE') {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response(
          JSON.stringify({ ok: false, error: 'key wajib' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
        );
      }
      await env.UPAH_KV.delete(key);
      return new Response(
        JSON.stringify({ ok: true, deleted: key }),
        { headers: { 'Content-Type': 'application/json', ...cors } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }
}
