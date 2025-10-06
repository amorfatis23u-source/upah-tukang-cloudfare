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
  if (request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ ok: false, error: 'Metode tidak didukung' }, 405);
  }
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const cursor = url.searchParams.get('cursor') || undefined;
  const limitParam = url.searchParams.get('limit');
  let limit = Number.parseInt(limitParam, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 50;
  }
  limit = Math.min(Math.max(limit, 1), 200);

  try {
    if (!env.UPAH_KV || typeof env.UPAH_KV.list !== 'function') {
      throw new Error('Binding UPAH_KV tidak tersedia');
    }

    const listOptions = { limit };
    if (prefix) {
      listOptions.prefix = prefix;
    }
    if (cursor) {
      listOptions.cursor = cursor;
    }

    const listResult = await env.UPAH_KV.list(listOptions);
    const keys = (listResult.keys || []).map((entry) => ({
      name: entry.name,
      expiration: entry.expiration || null,
      metadata: entry.metadata || {}
    }));
    return jsonResponse({
      ok: true,
      keys,
      cursor: listResult.cursor || '',
      list_complete: Boolean(listResult.list_complete)
    });
  } catch (err) {
    console.error('api/list error', err);
    const message = err?.message ? `Gagal mengambil daftar: ${err.message}` : 'Gagal mengambil daftar';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
