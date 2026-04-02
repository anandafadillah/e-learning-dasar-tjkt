/**
 * ==========================================
 * BACKEND - GOOGLE APPS SCRIPT (kode.gs)
 * Dibuat oleh: Aplikasi AI | FADILLAH
 * Versi: 4.0 (Update: Integrasi Kelas & Jurusan)
 * ==========================================
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('E-Library Sekolah')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fungsi inisialisasi database (Jalankan ini sekali di editor Apps Script)
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Setup Sheet Users
  if (!ss.getSheetByName('Users')) {
    const userSheet = ss.insertSheet('Users');
    userSheet.appendRow([
      'user_id', // Col 1
      'username', // Col 2
      'password', // Col 3
      'role', // Col 4
      'nama_lengkap', // Col 5
      'kelas', // Col 6 (Baru)
      'jurusan', // Col 7 (Baru)
      'session_token', // Col 8
    ]);
    userSheet.appendRow([
      'U001',
      'admin',
      'admin123',
      'admin',
      'Pustakawan Utama',
      '-',
      '-',
      '',
    ]);
    userSheet.appendRow([
      'U002',
      'siswa',
      'siswa123',
      'siswa',
      'Budi Santoso',
      'XI',
      'RPL',
      '',
    ]);
  } else {
    // Migrasi otomatis jika kolom baru belum ada
    const userSheet = ss.getSheetByName('Users');
    const headers = userSheet
      .getRange(1, 1, 1, userSheet.getLastColumn())
      .getValues()[0];

    if (!headers.includes('kelas')) {
      userSheet.insertColumnAfter(5);
      userSheet.getRange(1, 6).setValue('kelas');
    }
    if (!headers.includes('jurusan')) {
      userSheet.insertColumnAfter(6);
      userSheet.getRange(1, 7).setValue('jurusan');
    }
  }

  // 2. Setup Sheet Books
  if (!ss.getSheetByName('Books')) {
    const bookSheet = ss.insertSheet('Books');
    bookSheet.appendRow([
      'id_buku',
      'judul',
      'penulis',
      'kategori',
      'stok',
      'gambar_url',
    ]);
    bookSheet.appendRow([
      'B001',
      'Tutorial JS',
      'Fadillah',
      'Teknologi',
      5,
      '',
    ]);
  }

  // 3. Setup Sheet Loans
  if (!ss.getSheetByName('Loans')) {
    const loanSheet = ss.insertSheet('Loans');
    loanSheet.appendRow([
      'id_pinjam',
      'user_id',
      'id_buku',
      'tgl_pinjam',
      'status',
      'tgl_kembali',
    ]);
  }
}

/**
 * Prosedur Login
 */
function loginUser(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    // Index: 1=username, 2=password
    if (data[i][1] === username && data[i][2] === password) {
      const token = Utilities.getUuid();
      // Simpan token di kolom ke-8 (session_token)
      sheet.getRange(i + 1, 8).setValue(token);

      return {
        user_id: data[i][0],
        username: data[i][1],
        role: data[i][3],
        nama: data[i][4],
        kelas: data[i][5] || '-',
        jurusan: data[i][6] || '-',
        token: token,
      };
    }
  }
  throw new Error('Username atau Password salah!');
}

/**
 * Mengambil data Dashboard terintegrasi
 */
function getDashboardData(userId, role) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Ambil Data Buku
  const bookSheet = ss.getSheetByName('Books');
  const bookData = bookSheet.getDataRange().getValues();
  const books = bookData.slice(1).map((row) => ({
    id_buku: row[0],
    judul: row[1],
    penulis: row[2],
    kategori: row[3],
    stok: row[4],
    gambar_url: row[5],
  }));

  // Ambil Data Kategori Unik
  const categories = [...new Set(books.map((b) => b.kategori))].filter(
    (c) => c,
  );

  // Ambil Riwayat Pinjam
  const loanSheet = ss.getSheetByName('Loans');
  const loanData = loanSheet.getDataRange().getValues();
  const userSheet = ss.getSheetByName('Users');
  const userData = userSheet.getDataRange().getValues();

  // Mapping nama user & judul buku untuk riwayat
  let history = loanData.slice(1).map((row) => {
    const u = userData.find((x) => x[0] === row[1]);
    const b = bookData.find((x) => x[0] === row[2]);

    // Format tanggal
    const tglP =
      row[3] instanceof Date
        ? Utilities.formatDate(row[3], 'GMT+7', 'yyyy-MM-dd')
        : row[3];
    const tglK =
      row[5] instanceof Date
        ? Utilities.formatDate(row[5], 'GMT+7', 'yyyy-MM-dd')
        : row[5];

    return {
      id_pinjam: row[0],
      user_id: row[1],
      nama_user: u ? u[4] : 'Unknown',
      id_buku: row[2],
      judul_buku: b ? b[1] : 'Buku Dihapus',
      tgl_pinjam: tglP,
      status: row[4],
      tgl_kembali: tglK || '-',
    };
  });

  // Filter jika bukan admin
  if (role !== 'admin') {
    history = history.filter((h) => h.user_id === userId);
  }

  // Data Anggota (Hanya untuk Admin)
  let members = [];
  if (role === 'admin') {
    members = userData.slice(1).map((row) => ({
      user_id: row[0],
      username: row[1],
      role: row[3],
      nama_lengkap: row[4],
      kelas: row[5] || '-',
      jurusan: row[6] || '-',
    }));
  }

  return {
    books: books,
    history: history.reverse(),
    categories: categories,
    members: members,
  };
}

/**
 * Management Anggota (Tambah/Edit)
 */
function simpanAnggota(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  const allData = sheet.getDataRange().getValues();

  if (data.mode === 'tambah') {
    const newId = 'U' + Utilities.formatDate(new Date(), 'GMT+7', 'mssSS');
    sheet.appendRow([
      newId,
      data.username,
      data.password || '12345',
      data.role,
      data.nama_lengkap,
      data.kelas || '-',
      data.jurusan || '-',
      '', // session_token kosong
    ]);
    return 'Anggota baru berhasil ditambahkan!';
  } else {
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === data.user_id) {
        const row = i + 1;
        sheet.getRange(row, 2).setValue(data.username);
        if (data.password) sheet.getRange(row, 3).setValue(data.password);
        sheet.getRange(row, 4).setValue(data.role);
        sheet.getRange(row, 5).setValue(data.nama_lengkap);
        sheet.getRange(row, 6).setValue(data.kelas);
        sheet.getRange(row, 7).setValue(data.jurusan);
        return 'Data anggota berhasil diperbarui!';
      }
    }
  }
}

/**
 * Operasi Peminjaman & Pengembalian
 */
function pinjamBuku(userId, idBuku) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bookSheet = ss.getSheetByName('Books');
  const loanSheet = ss.getSheetByName('Loans');

  const books = bookSheet.getDataRange().getValues();
  for (let i = 1; i < books.length; i++) {
    if (books[i][0] === idBuku) {
      if (books[i][4] <= 0) throw new Error('Maaf, stok buku sedang habis!');

      // Kurangi stok
      bookSheet.getRange(i + 1, 5).setValue(books[i][4] - 1);

      // Tambah riwayat pinjam
      const idPinjam =
        'P' + Utilities.formatDate(new Date(), 'GMT+7', 'MMddHHmm');
      const tglNow = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
      loanSheet.appendRow([idPinjam, userId, idBuku, tglNow, 'Dipinjam', '']);

      return 'Buku berhasil dipinjam! Silahkan ambil di perpustakaan.';
    }
  }
}

function kembalikanBuku(idPinjam) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('Loans');
  const bookSheet = ss.getSheetByName('Books');

  const loans = loanSheet.getDataRange().getValues();
  for (let i = 1; i < loans.length; i++) {
    if (loans[i][0] === idPinjam) {
      if (loans[i][4] === 'Dikembalikan')
        throw new Error('Buku sudah dikembalikan!');

      // Update status pinjam
      const tglNow = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
      loanSheet.getRange(i + 1, 5).setValue('Dikembalikan');
      loanSheet.getRange(i + 1, 6).setValue(tglNow);

      // Kembalikan stok buku
      const books = bookSheet.getDataRange().getValues();
      const idBuku = loans[i][2];
      for (let j = 1; j < books.length; j++) {
        if (books[j][0] === idBuku) {
          bookSheet.getRange(j + 1, 5).setValue(books[j][4] + 1);
          break;
        }
      }
      return 'Buku berhasil dikembalikan. Terima kasih!';
    }
  }
}

/**
 * Kelola Buku & Kategori
 */
function simpanBuku(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Books');

  if (data.mode === 'tambah') {
    const newId = 'B' + Utilities.formatDate(new Date(), 'GMT+7', 'mmss');
    sheet.appendRow([
      newId,
      data.judul,
      data.penulis,
      data.kategori,
      data.stok,
      data.gambar_url,
    ]);
    return 'Buku berhasil ditambahkan!';
  } else {
    const books = sheet.getDataRange().getValues();
    for (let i = 1; i < books.length; i++) {
      if (books[i][0] === data.id_buku) {
        const row = i + 1;
        sheet
          .getRange(row, 2, 1, 5)
          .setValues([
            [
              data.judul,
              data.penulis,
              data.kategori,
              data.stok,
              data.gambar_url,
            ],
          ]);
        return 'Buku berhasil diperbarui!';
      }
    }
  }
}

function simpanKategori(nama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Books');
  // Kategori bersifat virtual (berdasarkan kolom kategori di Books),
  // jadi kita hanya perlu memastikan ada buku dengan kategori tersebut
  // atau Frontend menanganinya.
  return 'Kategori ' + nama + ' siap digunakan!';
}

function hapusKategori(nama) {
  // Fungsi opsional jika ingin menghapus masal buku dengan kategori tertentu
  return 'Kategori ' + nama + ' dihapus (Visual Only)';
}
