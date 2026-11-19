# Steam Sekolah · Yadika 13

Web pemesanan steam motor sekolah dengan dua tampilan utama: **Siswa** dan **Petugas**, ditambah **Administrator** untuk mengatur tarif dan tautan QRIS.

## Isi paket

- `index.html` — halaman aplikasi.
- `style.css` — seluruh desain responsif untuk HP dan komputer.
- `app.js` — login, pemesanan, antrean, status layanan, pembayaran, dan mode demo.
- `config.js` — pengaturan koneksi Supabase.
- `supabase-schema.sql` — tabel, trigger, dan Row Level Security (RLS).

## Cara mencoba sekarang

1. Ekstrak folder proyek.
2. Buka `index.html` lewat server lokal atau hosting statis.
3. Karena `config.js` masih memakai nilai contoh, halaman akan masuk **Mode Demo Lokal**.
4. Pilih **Masuk sebagai Siswa** untuk membuat pesanan, **Petugas** untuk mengelola status, atau **Admin** untuk mengisi tarif dan URL QRIS.
5. Buat pesanan dari akun demo siswa. Keluar, lalu masuk sebagai petugas untuk melihat antrean yang sama pada browser tersebut.

> Mode demo hanya menyimpan data di `localStorage` browser/perangkat yang sama. Demo bukan sistem operasional sekolah dan data tidak tersinkron ke HP lain.

## Menghubungkan ke Supabase untuk penggunaan sungguhan

### 1. Siapkan database

1. Buka proyek Supabase yang akan digunakan.
2. Masuk ke **SQL Editor**.
3. Buka file `supabase-schema.sql`, salin seluruh isinya, lalu jalankan.
4. Pastikan tabel `profiles`, `orders`, dan `app_settings` berhasil dibuat.

Jika database sudah berisi tabel dengan nama/struktur yang sama dari versi aplikasi lain, jangan langsung menjalankan SQL ini tanpa memeriksa struktur yang ada. SQL ini adalah skema dasar untuk paket ini.

### 2. Isi koneksi aplikasi

1. Di Supabase buka **Project Settings → API**.
2. Salin **Project URL** dan **anon/public key**.
3. Buka `config.js`.
4. Ganti `https://YOUR-PROJECT.supabase.co` dengan Project URL.
5. Ganti `PASTE_YOUR_SUPABASE_ANON_KEY` dengan anon/public key.
6. Simpan lalu unggah seluruh folder ke hosting.

**Penting:** hanya gunakan anon/public key di `config.js`. Jangan pernah memasukkan `service_role` key ke HTML, JavaScript, GitHub, atau hosting publik. Keamanan data diatur oleh RLS di database.

### 3. Buat akun sekolah

- Siswa membuat akun lewat tombol **Daftar**. Role akun baru otomatis `student`.
- Buat satu akun admin melalui halaman Daftar.
- Setelah admin berhasil terdaftar, buka Supabase → SQL Editor dan jalankan perintah berikut, ganti email dengan email admin yang baru dibuat:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'email-admin@sekolah.sch.id');
```

- Untuk petugas lain, daftarkan akun mereka, lalu jalankan:

```sql
update public.profiles
set role = 'staff'
where id = (select id from auth.users where email = 'email-petugas@sekolah.sch.id');
```

Role hanya dapat diubah lewat admin/database, bukan dari akun siswa. Petugas dapat melihat seluruh antrean dan mengubah status/pembayaran. Admin memiliki akses tambahan untuk mengubah tarif dan QRIS.

### 4. Atur tarif dan QRIS

1. Masuk dengan akun admin.
2. Buka tab **Pengaturan**.
3. Masukkan tarif steam dalam Rupiah. Kosongkan jika harga belum diputuskan.
4. Unggah gambar QRIS resmi sekolah ke layanan penyimpanan yang dapat diakses publik (misalnya Supabase Storage bucket khusus QRIS), lalu tempel URL publik gambarnya.
5. Simpan.

Tarif baru otomatis disalin ke setiap pesanan baru. Pesanan lama menyimpan tarif saat pesanan dibuat. Pastikan QRIS yang digunakan memang milik/pengelola resmi sekolah dan sudah disetujui.

### 5. Atur konfirmasi email (opsional)

Jika Supabase Auth mewajibkan konfirmasi email, siswa harus membuka email konfirmasi sebelum masuk. Untuk uji coba internal, atur kebijakan konfirmasi email sesuai keputusan administrator sekolah.

## Cara kerja aplikasi

### Alur siswa

1. Siswa masuk atau membuat akun.
2. Siswa mengisi nama lengkap, kelas, nomor HP, plat motor, jenis motor, dan lokasi parkir.
3. Siswa memilih metode pembayaran: **Cash** atau **QRIS**.
4. Siswa memilih waktu pembayaran:
   - **Saat kunci diambil:** petugas datang ke kelas, mengambil kunci, menerima pembayaran, lalu mengonfirmasi pembayaran di aplikasi.
   - **Saat motor diambil:** siswa membayar setelah motor selesai di-steam dan siap diserahkan.
5. Pesanan muncul di riwayat siswa dan antrean petugas.
6. Siswa memantau status hingga motor diserahkan.

### Alur petugas

1. Pesanan baru berstatus **Menunggu pengambilan kunci**.
2. Setelah petugas mengambil kunci, petugas menekan **Konfirmasi kunci diambil**.
3. Jika siswa memilih bayar saat kunci diambil, petugas mengonfirmasi Cash/QRIS pada tahap ini. Proses steam baru dapat dimulai setelah pembayaran dikonfirmasi.
4. Petugas menekan **Mulai proses steam**.
5. Setelah selesai, petugas menekan **Tandai selesai dicuci**.
6. Jika siswa memilih bayar saat mengambil motor, petugas menerima Cash atau menampilkan QRIS, lalu menekan **Pembayaran diterima**.
7. Setelah pembayaran lunas, petugas menekan **Serahkan motor**.

Status layanan: Menunggu → Kunci diambil → Sedang dicuci → Siap diambil → Selesai. Pesanan yang belum diproses dapat dibatalkan petugas.

## Lokasi parkir yang tersedia

- **Lokasi A:** dekat kantin SMK / dekat lapangan futsal Yadika 13.
- **Lokasi B:** parkiran luas dekat bengkel TKR.
- **Lokasi C:** parkiran atas dekat lapangan basket Yadika 13.

## Pembayaran dan batasan operasional

- Aplikasi mencatat metode pembayaran dan waktu yang dipilih siswa.
- Aplikasi tidak memproses transfer uang secara otomatis. QRIS ditampilkan sebagai gambar resmi dan petugas tetap memeriksa pembayaran masuk sebelum menekan **Pembayaran diterima**.
- Tombol konfirmasi pembayaran hanya aktif di tahap pembayaran yang dipilih siswa.
- Jangan konfirmasi pembayaran sebelum uang tunai diterima atau transaksi QRIS diverifikasi.
- Harga tidak diisi secara otomatis sampai admin menetapkan tarif.

## Hosting

Aplikasi ini berbentuk web statis sehingga dapat di-host di Vercel, Netlify, atau GitHub Pages. Untuk penggunaan bersama, pastikan `config.js` telah diisi dengan koneksi Supabase sebelum dipublikasikan. Setelah mengubah file, unggah ulang seluruh file proyek.

## Catatan keamanan dan operasional

- Aktifkan HTTPS pada hosting.
- Jangan membagikan password akun petugas/admin.
- Beri role `staff` hanya kepada petugas yang berwenang.
- Simpan QRIS resmi pada lokasi yang terkendali dan pastikan URL gambarnya benar.
- Buat kebijakan sekolah mengenai penyimpanan nomor HP dan data kendaraan.
- Sebelum digunakan seluruh warga sekolah, uji pendaftaran, login, pemesanan dari dua akun berbeda, pembaruan status, konfirmasi pembayaran, dan tampilan di beberapa HP.
