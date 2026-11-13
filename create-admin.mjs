/**
 * Buat akun admin PERTAMA di database produksi. Jangan pakai `prisma db seed` di produksi:
 * seed MENGHAPUS semua data dan membuat akun demo ber-password publik.
 *
 * Dijalankan di dalam image api (memakai @prisma/client + bcryptjs di sana), skrip ini di-mount:
 *   read -rsp "Password admin: " ADMIN_PASSWORD; echo
 *   docker compose run --rm -e ADMIN_EMAIL=admin@contoh.com -e ADMIN_NAME="Administrator" \
 *     -e ADMIN_PASSWORD="$ADMIN_PASSWORD" -v "$PWD/create-admin.mjs:/app/create-admin.mjs:ro" api node create-admin.mjs
 */
import bcrypt from "bcryptjs";
import pkg from "@prisma/client";

const { PrismaClient } = pkg;
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.ADMIN_NAME ?? "Administrator").trim();
const password = process.env.ADMIN_PASSWORD ?? "";

const die = (m) => { console.error(`GAGAL: ${m}`); process.exit(1); };
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die("ADMIN_EMAIL tidak valid");
if (name.length < 2) die("ADMIN_NAME minimal 2 karakter");
// Aturan yang sama dengan backend (utils/password.ts): 8-72 karakter, ada huruf dan angka. Disarankan >= 12.
if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) die("ADMIN_PASSWORD harus 8-72 karakter, mengandung huruf dan angka");

const prisma = new PrismaClient();
try {
  if (await prisma.user.findUnique({ where: { email } })) die(`pengguna ${email} sudah ada (tidak diubah)`);
  const u = await prisma.user.create({ data: { name, email, password_hash: await bcrypt.hash(password, 12), role: "admin" } });
  console.log(`Admin dibuat: ${u.email} (${u.user_id}). Login lewat aplikasi, lalu buat pengguna lain dari menu Pengguna.`);
} finally {
  await prisma.$disconnect();
}
