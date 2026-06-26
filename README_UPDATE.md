# Update Python Quiz Game: Admin, Timer, Sound, Bank Soal

## File yang perlu diupload ke GitHub

Upload dan replace file lama:

- `index.html`
- `app.js`
- `style.css`

Upload file baru:

- `game-config.js`
- `questions.json`
- `questions-template.csv`

Jangan timpa `firebase-config.js` yang sudah berhasil dipakai.

## Kode guru/admin

Kode guru/admin ada di file `game-config.js`:

```js
export const gameConfig = {
  adminCode: 'guru123',
  turnSeconds: 30,
  questionSource: {
    type: 'json',
    url: './questions.json'
  }
};
```

Guru masuk dengan mengisi kode tersebut pada halaman login. Pemain biasa mengosongkan kolom kode guru/admin.

Tombol `Mulai/Ulang` dan `Acak Giliran` hanya aktif untuk akun guru/admin.

Catatan: karena GitHub Pages adalah web statis, kode admin di file ini bersifat praktis untuk kelas. Untuk keamanan produksi, gunakan Firebase Authentication.

## Timer giliran

Durasi timer diatur di file `game-config.js`:

```js
turnSeconds: 30
```

Jika waktu habis, giliran otomatis berpindah ke pemain lain. Timeout tidak mengurangi poin.

## Efek suara

Jawaban benar dan salah memiliki suara berbeda. Browser biasanya mengizinkan suara setelah user melakukan klik pertama.

## Bank soal dari JSON

Default menggunakan file `questions.json`:

```js
questionSource: {
  type: 'json',
  url: './questions.json'
}
```

Format JSON bisa memakai `parts` manual:

```json
{
  "id": "q1",
  "title": "Output sederhana",
  "prompt": "Susun program Python untuk menampilkan teks Hello.",
  "parts": [
    ["print", "print"],
    ["(", "("],
    ["\"Hello\"", "\"Hello\""],
    [")", ")"]
  ]
}
```

Atau cukup memakai `code`, nanti potongan dibuat otomatis:

```json
{
  "id": "q2",
  "title": "Luas persegi panjang",
  "prompt": "Susun kode menghitung luas.",
  "code": "panjang = 10\nlebar = 5\nluas = panjang * lebar\nprint(luas)"
}
```

## Bank soal dari Google Spreadsheet

Buat Google Spreadsheet dengan header:

```text
id,title,prompt,code
```

Contoh isi:

```text
q1,Output sederhana,Susun program Python untuk menampilkan Hello,"print(""Hello"")"
```

Untuk kode multi-baris, isi kolom `code` dengan teks multi-baris.

Lalu publish spreadsheet sebagai CSV:

1. Buka Google Spreadsheet.
2. Klik `File`.
3. Pilih `Share` atau `Publish to the web`.
4. Pilih sheet bank soal.
5. Pilih format `Comma-separated values (.csv)`.
6. Salin link yang berakhiran `pub?output=csv`.

Ubah `game-config.js` menjadi:

```js
export const gameConfig = {
  adminCode: 'guru123',
  turnSeconds: 30,
  questionSource: {
    type: 'spreadsheet',
    url: 'LINK_CSV_GOOGLE_SPREADSHEET_DI_SINI'
  }
};
```

## Reset setelah update

Setelah upload file ke GitHub, buka web lalu tekan:

```text
Ctrl + F5
```

Jika room masih membawa data lama, gunakan kode room baru, misalnya:

```text
?room=kelas-python-v2
```
