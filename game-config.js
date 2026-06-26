// Konfigurasi game. File ini boleh diedit langsung di GitHub.
// Catatan: kode admin di GitHub Pages bersifat praktis untuk kelas, bukan keamanan tingkat produksi.
export const gameConfig = {
  adminCode: 'guru123',
  turnSeconds: 30,
  questionSource: {
    // Pilihan type: 'json' atau 'spreadsheet'
    // JSON lokal: url: './questions.json'
    // Spreadsheet/CSV publik: url: 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv'
    type: 'json',
    url: './questions.json'
  }
};
