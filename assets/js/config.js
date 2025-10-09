export function apiBase() { return '/api'; }

export async function saveSnapshot(data) {
  const r = await fetch(`${apiBase()}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return r.json();
}

export async function getSnapshot(key) {
  const r = await fetch(`${apiBase()}/state?key=${encodeURIComponent(key)}`);
  return r.json();
}

export async function deleteSnapshot(key) {
  const r = await fetch(`${apiBase()}/state?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  return r.json();
}

export async function listSnapshots(prefix = 'ut:snap:') {
  const r = await fetch(`${apiBase()}/list?prefix=${encodeURIComponent(prefix)}`);
  return r.json();
}
