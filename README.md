# Upah Tukang — Cloudflare Pages (Functions + KV)

UI responsif (HTML/JS + Tailwind CDN) dengan backend **Cloudflare Pages Functions** memakai **KV binding `UPAH_KV`** (fallback in-memory otomatis saat binding tidak tersedia untuk pengembangan lokal).

## Fitur utama
- Tiga halaman: `index.html`, `form.html`, `rekap.html` — tampilan seragam, mobile-first.
- API client kecil (`assets/js/config.js`) untuk akses:
  - `GET/POST/DELETE /api/state?key=...`
  - `GET /api/list?prefix=...&cursor=...`
- **Autosave** di form (debounce 800ms) + indikator waktu simpan.
- Export **CSV/XLSX** (SheetJS CDN).
- Rekap: filter periode/rumah/pencarian, paginasi (20/baris), ekspor gabungan + hapus tanpa reload, link kembali ke form (deep-link).

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
3. **Settings → Functions → KV bindings** (atur untuk **Production** dan **Preview**):
   - Name: `UPAH_KV`
   - Namespace: pilih yang sudah ada atau buat baru (mis. `upah_tukang_kv`).
4. Deploy. Uji endpoint dasar:
   - `GET https://<domain-pages>/api/list?prefix=ut:snap:`
   - `POST https://<domain-pages>/api/state` dengan body:
     ```json
     {
       "key": "ut:snap:2025-01-01:2025-01-07:BlokA-01:uuid-random",
       "value": { "contoh": true },
       "meta": { "updatedAt": "2025-01-01T00:00:00.000Z" }
     }
     ```

## Catatan
- Batas ukuran value default dibatasi di fungsi (±200 KB). Ubah sesuai kebutuhan.
- `list` hanya mengembalikan **keys + metadata**. Untuk data lama tanpa metadata lengkap, halaman rekap otomatis mengambil detail.
- Semua fetch menggunakan `/api/state` & `/api/list` (tidak ada jalur Netlify).

Lisensi: MIT
