export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'ut:snap:';
  const list = [];
  let cursor;
  do {
    const { keys, list_complete, cursor: next } = await env.UPAH_KV.list({ prefix, cursor });
    for (const k of keys) {
      list.push({ name: k.name });
    }
    cursor = list_complete ? undefined : next;
  } while (cursor);

  return new Response(
    JSON.stringify({ ok: true, count: list.length, keys: list }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}
