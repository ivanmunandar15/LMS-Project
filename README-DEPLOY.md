# Deploy: 4 container (postgres, api, web, caddy)

Dua aplikasi **tidak** digabung: `api` (Express + Prisma, port 3000) dan `web` (Next.js, port 3001) adalah container
terpisah. Hanya Caddy (80/443) yang terbuka ke luar; database dan api hanya bisa dijangkau lewat jaringan Docker.

```
Browser ──HTTPS──▶ Caddy ──▶ web (Next.js, BFF) ──http://api:3000──▶ api ──▶ postgres
```

## 0. Prasyarat yang HARUS dipenuhi dulu: migrasi Prisma
Backend tidak punya folder `prisma/migrations` (dan entrypoint api menolak start tanpa itu). Buat sekali di komputer
dengan Node + Docker, lalu simpan (commit) folder hasilnya:
```bash
cd lab-equipment-api
npm install
npm run db:up                         # Postgres lokal dari docker-compose backend
cp .env.example .env
npm run db:migrate -- --name init     # menghasilkan prisma/migrations/
```

## 1. Konfigurasi
```bash
cd lab-deploy
cp .env.example .env
# isi: PUBLIC_URL, SITE_ADDRESS, POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, AUTH_SECRET
# tiap secret:  openssl rand -hex 32   (JWT_* dan AUTH_SECRET harus berbeda-beda)
```
DNS `SITE_ADDRESS` harus mengarah ke server dan port 80/443 terbuka (HTTPS otomatis). HTTPS wajib: kamera pemindai QR
tidak jalan di HTTP biasa.

## 2. Jalankan
```bash
docker compose up -d --build
docker compose ps                     # tunggu semua healthy
docker compose logs -f api web
```

## 3. Admin pertama
**Jangan** jalankan `db:seed` di produksi (menghapus semua data + akun demo ber-password publik).
```bash
read -rsp "Password admin: " ADMIN_PASSWORD; echo
docker compose run --rm -e ADMIN_EMAIL=admin@contoh.com -e ADMIN_NAME="Administrator" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" -v "$PWD/create-admin.mjs:/app/create-admin.mjs:ro" api node create-admin.mjs
```
Pengguna lain dibuat admin lewat menu Pengguna.

## 4. Impor inventaris.csv (sekali)
Api tidak dipublikasikan, jadi jalankan skrip di jaringan Docker yang sama:
```bash
docker run --rm --network lab_default -v "$PWD/../lab-management:/work" -w /work \
  -e API_URL=http://api:3000/api/v1 -e MIGRATE_EMAIL=admin@contoh.com -e MIGRATE_PASSWORD="$ADMIN_PASSWORD" \
  node:20-slim node scripts/migrate-inventory.mjs            # dry run
# jika sesuai, tambahkan --commit di akhir perintah
```

## Operasional
- **Update**: `git pull && docker compose up -d --build` (migrasi database otomatis saat api start).
- **Ubah PUBLIC_URL**: wajib `docker compose up -d --build web` (nilai QR tertanam saat build).
- **Backup**: `docker compose exec postgres pg_dump -U lab lab_equipment > backup.sql` **dan** volume `lab_uploads`
  (dokumen/sertifikat). Uji restore sebelum dibutuhkan.
- **IoT**: perangkat sensor mengirim ke `/api/v1/monitoring/readings` dengan `X-Sensor-Key`; aktifkan blok `handle`
  di `Caddyfile` jika dipakai (hanya jalur itu yang dibuka).

## Batasan yang perlu diketahui
- Satu replika `web` dan satu replika `api`. `api` menjalankan job terjadwal (ganda jika di-scale) dan `web` menyatukan
  refresh token hanya di dalam satu proses; memakai ulang refresh token lama >10 detik mencabut semua sesi pengguna.
  Untuk beberapa replika `web` perlu store bersama (mis. Redis) lebih dulu.
- Rate limit login backend (10 gagal / 15 menit) dihitung per IP klien: `web` meneruskan IP dari `X-Forwarded-For` yang
  diisi Caddy. Jika memakai proxy lain di depan Caddy (mis. Cloudflare), IP yang diteruskan adalah IP proxy itu sampai
  `trusted_proxies` Caddy dikonfigurasi.
- Impor massal dari UI dibatasi 1 MB JSON oleh backend (sekitar 2.000 baris).
