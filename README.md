# Upah Tukang — Cloudflare Pages (Functions + KV)

UI responsif (HTML/JS + Tailwind CDN) dengan backend default **Cloudflare Pages Functions** memakai **KV binding `UPAH_KV`** (fallback in-memory otomatis saat binding tidak tersedia untuk pengembangan lokal). Alternatifnya dapat dihubungkan ke **Google Sheets** melalui **Apps Script Web App** tanpa mengubah UI.

## Fitur utama
- Tiga halaman: `index.html`, `form.html`, `rekap.html` — tampilan seragam, mobile-first.
- API client kecil (`assets/js/config.js`) untuk akses:
  - `GET/POST/DELETE /api/state?key=...`
  - `GET /api/list?prefix=...&cursor=...`
- Mode **Apps Script**: endpoint otomatis diarahkan ke Web App Google Sheets dengan format aksi `action=list|get|set|delete`.
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
├─ apps-script/
│  └─ Code.gs       # Apps Script Web App (opsional, Google Sheets)
└─ functions/
   └─ api/
      ├─ state.js   # GET/POST/DELETE 1 key (Cloudflare KV)
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

## Integrasi Google Sheets + Apps Script
1. Buka Google Sheets → buat spreadsheet baru (atau gunakan yang ada). Script ini memakai nama sheet `Snapshots` (lihat konstanta `SHEET_NAME` di `apps-script/Code.gs`).
2. Pilih **Extensions → Apps Script**, hapus kode awal, lalu salin isi `apps-script/Code.gs` ke editor.
3. Simpan projek, kemudian **Deploy → New deployment → Web app**. Pilih akses **Anyone** atau **Anyone with the link** agar bisa dipanggil dari browser.
4. Salin URL Web App yang dihasilkan (format `https://script.google.com/macros/s/.../exec`).
5. Masukkan URL tersebut ke meta tag `<meta name="upah-apps-script-url" ...>` yang sudah tersedia di `index.html`, `form.html`, dan `rekap.html` (atau set melalui `window.UPAH_APPS_SCRIPT_URL` sebelum memanggil `api()`).
6. Setelah halaman dimuat ulang, semua operasi `get/set/list/delete` akan diarahkan ke Google Sheets. Data tersimpan di kolom `Key`, `Value` (JSON), `Meta` (JSON), `CreatedAt`, dan `UpdatedAt`.
7. Jika meta tag dikosongkan, aplikasi otomatis kembali memakai backend Cloudflare/KV.

## Catatan
- Batas ukuran value default dibatasi di fungsi (±200 KB). Ubah sesuai kebutuhan.
- `list` hanya mengembalikan **keys + metadata**. Untuk data lama tanpa metadata lengkap, halaman rekap otomatis mengambil detail.
- Semua fetch menggunakan `/api/state` & `/api/list` (tidak ada jalur Netlify).

Lisensi: MIT
