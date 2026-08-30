# Qures Riverside — MySQL Online v3

Versi ini diperbaiki khusus karena:
1. Menu sekarang punya GAMBAR demo, bukan hanya tulisan.
2. Ada 3 Minuman + 3 Snack + 3 Makanan.
3. Login admin/kasir menggunakan bcrypt dan database MySQL.
4. Password tidak disimpan sebagai password biasa.
5. Order pelanggan masuk ke MySQL.
6. Stok berkurang otomatis.
7. Dashboard kasir menerima order secara otomatis setiap 5 detik.
8. Ada kelola menu, stok, harga, gambar, dan laporan.

## A. Jalankan dulu di PC dengan MySQL

### 1. Pastikan MySQL Server berjalan
MySQL Workbench saja tidak cukup. Yang harus aktif adalah **MySQL Server**.

### 2. Buat database
Buka MySQL Workbench, buka file `database.sql`, lalu Run.

### 3. Buat file .env
Copy `.env.example` menjadi `.env`.

Isi contoh:
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password_mysql_kamu
DB_NAME=quresriverside
SESSION_SECRET=buat-string-rahasia-panjang
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

### 4. Install dependency
Di CMD pada folder project:
npm install

### 5. Jalankan
npm start

Buka:
http://localhost:3000

Kasir:
http://localhost:3000/kasir

Login default:
admin
admin123

Jika kamu mengganti ADMIN_USERNAME/ADMIN_PASSWORD setelah admin sudah terbuat, password database lama tidak otomatis berubah. Untuk demo paling gampang, kosongkan tabel `admins` lalu restart server.

## B. Kenapa ini bisa benar-benar online?

Website internet tidak cukup hanya dengan MySQL yang terinstall di laptop.
Arsitekturnya:

HP pelanggan
    ↓ HTTPS
Hosting Node.js / Express
    ↓
MySQL online/cloud
    ↓
Dashboard kasir

Untuk online publik, upload project ini ke hosting yang mendukung Node.js dan gunakan MySQL cloud/managed database. Jangan membuka port 3306 MySQL laptop langsung ke internet.

## C. Deploy

Pilihan paling sederhana adalah memakai platform cloud yang menyediakan Node.js + MySQL/managed MySQL.
Saat deploy:
- set semua variabel `.env` di Environment Variables hosting;
- jalankan `npm install` sebagai build/install;
- jalankan `npm start` sebagai start command;
- gunakan database MySQL milik cloud, bukan `localhost`;
- pastikan `NODE_ENV=production`;
- gunakan `SESSION_SECRET` yang panjang dan rahasia.

## D. Menu demo

Minuman:
- Kopi Susu Riverside
- Americano
- Cappuccino

Snack:
- Kentang Goreng
- Pisang Goreng
- Roti Bakar Cokelat

Makanan:
- Nasi Goreng Riverside
- Mie Goreng
- Rice Bowl Ayam

Gambar demo memakai URL gambar online. Dari Dashboard Kasir, URL gambar bisa diganti dengan URL foto menu milik toko.

## E. Penting

Untuk toko sungguhan, ganti:
- password admin,
- SESSION_SECRET,
- kredensial database,
- dan gunakan HTTPS.

Jangan mengirim file `.env` ke orang lain atau memasukkannya ke GitHub.

## Catatan kode
Semua HTML, CSS, dan JavaScript sudah diformat multiline agar mudah dipelajari di VS Code. Folder `public/images` berisi gambar demo lokal.
