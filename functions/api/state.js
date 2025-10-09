const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...headers
    }
  });
}

function sanitizeMetadata(input) {
  const result = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'object') {
      try {
        result[key] = JSON.stringify(value);
      } catch (err) {
        result[key] = String(value);
      }
      return;
    }
    result[key] = value;
  });
  return result;
}

function buildSnapshotKey(source = {}) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '');
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10));

  const periodeStart = source.periodeStart || source.start || '';
  const periodeEnd = source.periodeEnd || source.end || '';
  const rumah = source.rumah || source.rumahLabel || '';

  if (periodeStart && periodeEnd && rumah) {
    return { key: `ut:snap:${periodeStart}:${periodeEnd}:${rumah}:${timestamp}-${uuid}`, now };
  }

  return { key: `ut:snap:${timestamp}-${uuid}`, now };
}

function getKVBinding(env) {
  const kv = env?.UPAH_KV;
  if (!kv) {
    return {
      kv: null,
      errorResponse: jsonResponse(
        { ok: false, error: 'KV binding UPAH_KV not found' },
        { status: 500 }
      )
    };
  }

  return { kv };
}

export function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { kv, errorResponse } = getKVBinding(env);
  if (!kv) {
    return errorResponse;
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Body kosong/invalid' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ ok: false, error: 'Body kosong/invalid' }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const keyParam = url.searchParams.get('key');
    const candidateData = body.data ?? body.value ?? body;
    const data = typeof candidateData === 'object' && candidateData !== null
      ? candidateData
      : body;

    let key = body.key || keyParam;
    let createdAt = new Date();
    if (!key) {
      const generated = buildSnapshotKey(data);
      key = generated.key;
      createdAt = generated.now;
    }

    const savedAt = createdAt.toISOString();
    const metaPayload = (body.meta && typeof body.meta === 'object') ? body.meta : undefined;
    const kvMeta = sanitizeMetadata({
      form_id: data.form_id || body.form_id || metaPayload?.form_id || 'unknown',
      start: metaPayload?.start ?? data.periodeStart ?? data.start ?? null,
      end: metaPayload?.end ?? data.periodeEnd ?? data.end ?? null,
      rumah: metaPayload?.rumah ?? data.rumah ?? data.rumahLabel ?? null,
      saved_at: savedAt
    });

    const snapshot = {
      snapshot_id: key,
      saved_at: savedAt,
      schema_version: '1.0.0',
      data
    };

    if (metaPayload) {
      snapshot.meta = metaPayload;
    }

    await kv.put(key, JSON.stringify(snapshot), { metadata: kvMeta });

    return jsonResponse({ ok: true, key, saved_at: savedAt });
  } catch (err) {
    console.error('api/state POST error', err);
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { kv, errorResponse } = getKVBinding(env);
  if (!kv) {
    return errorResponse;
  }

  try {
    const url = new URL(request.url);
    const keyParam = url.searchParams.get('key');

    if (!keyParam) {
      return jsonResponse({ ok: false, error: 'key wajib' }, { status: 400 });
    }

    const raw = await kv.get(keyParam);
    if (!raw) {
      return jsonResponse({ ok: false, error: 'not found' }, { status: 404 });
    }

    return new Response(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (err) {
    console.error('api/state GET error', err);
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { kv, errorResponse } = getKVBinding(env);
  if (!kv) {
    return errorResponse;
  }

  try {
    const url = new URL(request.url);
    const keyParam = url.searchParams.get('key');

    if (!keyParam) {
      return jsonResponse({ ok: false, error: 'key wajib' }, { status: 400 });
    }

    await kv.delete(keyParam);
    return jsonResponse({ ok: true, deleted: keyParam });
  } catch (err) {
    console.error('api/state DELETE error', err);
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
}
