# Upah Tukang — Cloudflare Pages (Functions + KV)

UI sederhana (HTML/JS + Tailwind CDN) dengan backend **Cloudflare Pages Functions** memakai **KV binding `UPAH_KV`**.

## Fitur utama
- Tiga halaman: `index.html`, `form.html`, `rekap.html` — tampilan seragam, mobile-first.
- API client kecil (`assets/js/config.js`) untuk akses:
  - `GET/POST/DELETE /api/state?key=...`
  - `GET /api/list?prefix=...&cursor=...`
- **Autosave** di form (debounce 800ms) + indikator waktu simpan.
- Export **CSV/XLSX** (SheetJS CDN).
- Rekap: filter sederhana, paginasi (client-side), hapus item, link kembali ke form (deep-link).

## Struktur
```
/
├─ index.html
├─ form.html
├─ rekap.html
├─ assets/
│  ├─ js/config.js
│  └─ css/extra.css
└─ functions/
   └─ api/
      ├─ state.js   # GET/POST/DELETE 1 key
      └─ list.js    # LIST by prefix + cursor
```

## Deploy Cloudflare Pages
1. Buat proyek **Pages** → **Connect to Git** (atau upload).
2. Build command: **(kosong)** · Output dir: **root**.
3. **Settings → Functions → KV bindings**:
   - Name: `UPAH_KV`
   - Namespace: pilih/baru (mis. `upah_tukang_kv`)
4. Deploy. Coba endpoint:
   - `GET {"your-domain"}/api/list?prefix=ut:snap:`
   - `POST {"your-domain"}/api/state` (body: `{"key":"ut:snap:2025-01-01:2025-01-07:BlokA-01:<module 'uuid' from '/usr/local/lib/python3.11/uuid.py'>","value":{"contoh":true}}`)

## Catatan
- Batas ukuran value default dibatasi di fungsi (±200 KB). Ubah sesuai kebutuhan.
- `list` hanya mengembalikan **keys + metadata**. Untuk agregat penuh, klien melakukan `GET` per key (di `rekap.html`).

Lisensi: MIT
