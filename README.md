# Python Code Builder Quiz

Web game quiz realtime untuk belajar pemrograman Python. Cocok digunakan di kelas dengan GitHub Pages sebagai hosting frontend dan Firebase Realtime Database sebagai penyimpanan realtime.

## Alur game

1. Semua pemain login memakai nama dan kode room.
2. Bagian atas menampilkan soal Python.
3. Bagian tengah menampilkan source code yang tersusun dari jawaban benar.
4. Bagian bawah berisi potongan kata/karakter.
5. Bagian samping menampilkan pemain online.
6. Giliran pemain dipilih otomatis secara acak.
7. Pemain yang sedang mendapat giliran memilih potongan kode.
8. Jika benar, potongan pindah ke source code bagian tengah.
9. Jika salah, potongan tidak pindah dan giliran berpindah.
10. Game selesai setelah semua level Python tersusun.

## Struktur file

```text
python-quiz-game/
├── index.html
├── style.css
├── app.js
├── firebase-config.js
├── database.rules.json
└── README.md
```

## Setup Firebase

1. Buka Firebase Console.
2. Buat project baru.
3. Tambahkan Web App.
4. Aktifkan Realtime Database.
5. Salin konfigurasi Web App.
6. Tempel konfigurasi ke file `firebase-config.js`.
7. Untuk uji coba kelas, isi Rules Realtime Database dengan isi file `database.rules.json`.

Contoh isi `firebase-config.js` setelah diganti:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "nama-project.firebaseapp.com",
  databaseURL: "https://nama-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nama-project",
  storageBucket: "nama-project.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

> Catatan keamanan: rules public hanya cocok untuk prototipe/uji kelas. Untuk produksi, gunakan Firebase Authentication dan rules yang lebih ketat.

## Upload ke GitHub Pages

1. Buat repository baru, misalnya `python-quiz-game`.
2. Upload semua file ke repository.
3. Buka **Settings** → **Pages**.
4. Pada bagian **Build and deployment**, pilih branch `main`, folder `/root`.
5. Buka alamat GitHub Pages yang muncul.

Contoh URL game:

```text
https://username.github.io/python-quiz-game/?room=kelas-python
```

Ganti `kelas-python` untuk membuat room berbeda.

## Mengubah soal

Buka `app.js`, cari bagian `const QUESTIONS = [...]`, lalu ubah atau tambah level. Format potongan:

```js
makeQuestion({
  id: 'q6',
  title: 'Judul soal',
  prompt: 'Instruksi soal',
  parts: [
    ['print', 'print'],
    ['(', '('],
    ['"Halo"', '"Halo"'],
    [')', ')']
  ]
})
```

Setiap item `parts` terdiri dari:

```js
['teks_asli_yang_masuk_ke_source_code', 'label_yang_ditampilkan_di_tombol']
```

Contoh khusus:

```js
[' ', 'spasi']
['\n', '↵ Enter']
['    ', '⇥ indentasi']
```

## Fitur MVP

- Login nama pemain.
- Room berbasis URL.
- Daftar pemain online realtime.
- Pemilihan giliran otomatis/random.
- Potongan kode hanya bisa diklik oleh pemain yang sedang mendapat giliran.
- Jawaban benar masuk ke source code.
- Jawaban salah tidak masuk dan giliran berpindah.
- Skor pemain realtime.
- 5 level materi Python dasar.
