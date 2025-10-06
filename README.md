# Upah Tukang — Cloudflare Pages (tanpa Wrangler)

Repo ini adalah paket siap-deploy untuk Cloudflare Pages **tanpa Wrangler**, memindahkan artefak Netlify ke arsitektur *Pages Functions* + **Cloudflare KV**.

## Struktur
```
.
├─ index.html
├─ form.html
├─ rekap.html
├─ assets/
│  └─ js/
│     └─ config.js          # klien API browser -> /api/state (Cloudflare)
├─ styles/
│  ├─ system.css            # placeholder (boleh ganti dengan style Anda)
│  └─ pages.css             # placeholder
└─ functions/
   └─ api/
      └─ state.js           # Pages Function: GET/POST /api/state
```

## Cara Deploy di Cloudflare Pages
1. **Buat proyek Pages** → *Connect to Git* → pilih repo ini (setelah di-push ke GitHub).
2. **Build settings**: *Framework preset* = **None** (Static). Build command kosong, output dir = root (atau `/`).
3. **Tambahkan KV Binding**:
   - Buka *Settings → Functions → KV namespaces*.
   - Buat / pilih namespace, lalu **Binding name** = `UPAH_KV` (harus sama dengan di `functions/api/state.js`).

> Tidak perlu `wrangler.toml`. Semua fungsi otomatis dipetakan:
> - `functions/api/state.js` → **/api/state**

## API Frontend
`assets/js/config.js` menyediakan:
- `getRaw(key)` → ambil JSON dari KV
- `setRaw(key, data)` → simpan JSON ke KV
- `saveSnapshot(data)` → simpan snapshot dan mengembalikan `{ key }`

## Catatan Migrasi
- Semua rujukan `/.netlify/functions/state` telah diganti ke **`/api/state`**.
- Teks "Netlify" diganti menjadi "Cloudflare".
- Jika ada skrip lain yang mengarah ke endpoint lama, arahkan ke `/api/state` atau gunakan `createApiClient()`.

## Lokasi Data
- Data disimpan di **Cloudflare KV** (namespace `UPAH_KV`) dalam format JSON per-key.
- Key contoh: `snapshot:<uuid>` atau `yourCustomKey`.

Selamat mencoba 🚀

## Binding Cloudflare KV (Namespace & Binding)
> **Ringkas**: Buat/tautkan **Namespace KV** lalu beri **Binding name** persis `UPAH_KV`.

### Jika belum punya namespace
1. Cloudflare Dashboard → **KV** → **Create a namespace** (mis. `upah-tukang-kv`).
2. Catat **Namespace ID** (otomatis).

### Tautkan di Pages (tanpa wrangler)
- Project Pages → **Settings → Functions → KV bindings → Add binding**
  - **Binding name**: `UPAH_KV`  ← *harus sama* dengan yang dipakai di kode
  - **Namespace**: pilih `upah-tukang-kv` (atau nama kamu)

> Kamu bisa membuat **dua binding** (preview & production) menunjuk namespace berbeda agar data terpisah:
- **Preview** → `upah-tukang-kv-preview`
- **Production** → `upah-tukang-kv-prodn`

## Skema Key Snapshot (kamu bisa ubah sesuai kebutuhan)
Default key untuk snapshot dibuat seperti ini:

```
ut:snap:{periodeStart}:{periodeEnd}:{rumah}:{uuid}
```

Contoh:
```
ut:snap:2025-10-01:2025-10-07:BlokA-01:7f3e...c9
```

- `periodeStart` dan `periodeEnd` diformat `YYYY-MM-DD` (opsional).
- `rumah` adalah identifier kavling/rumah (opsional).
- Jika `rumah` tidak diisi, bagian itu dikosongkan.
- Jika periode tidak diisi, akan memakai `snap:{uuid}` generik seperti sebelumnya.

## Endpoint Tambahan
- `GET /api/list?prefix=ut:snap:2025-10-01` → daftar key yang berawalan prefix (termasuk beberapa value ringkas).
- `DELETE /api/state?key=...` → hapus 1 key di KV.

Lihat **assets/js/config.js** untuk fungsi `listSnapshots`, `deleteKey`, dan `saveSnapshot(options, data)`.