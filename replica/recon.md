# Recon map: Endless runner kereta, referensi Subway Surfers versi web (Poki) (web, desktop + ponsel)

Scope: loop inti endless runner (lari, hindari, koin, power-up, hoverboard) + progresi (karakter, toko, misi, award). Bukan semua fitur app mobile.
For: DIASUMSIKAN proyek pribadi / game orisinal sendiri. (Belum dikonfirmasi user.)
Date: 2026-11-14

> Catatan metode: satu-satunya sumber sejauh ini adalah halaman publik Poki (teks + keterangan galeri). Game-nya berjalan di iframe dan belum dimainkan/direkam, jadi detail UI dan nilai angka in-game ditandai confidence.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | halaman game di Poki (deskripsi, kontrol, item, FAQ, galeri) | https://poki.com/id/g/subway-surfers | sumber utama; sudah dibaca penuh |
| 2 | listing App Store | https://apps.apple.com/us/app/subway-surfers/id512939461 | BELUM dibaca; untuk screenshot layar utama/menu |
| 3 | listing Google Play | https://play.google.com/store/apps/details?id=com.kiloo.subwaysurf | BELUM dibaca |
| 4 | situs developer (SYBO) | https://sybogames.com/ | BELUM dibaca; positioning |
| 5 | akun/permainan milik user sendiri | n/a | disarankan: user main dan catat state tiap layar |

## Core loop

Lari otomatis tanpa henti di atas jalur; geser jalur, lompat, dan guling untuk menghindari rintangan sambil mengumpulkan koin; tabrakan mengakhiri lari; koin dipakai membuka karakter/hoverboard/upgrade sehingga lari berikutnya bisa lebih jauh.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Menu utama | buka game | mulai lari, akses toko/karakter/misi | tombol Play, saldo koin+kunci, nav | guess (tidak ada tangkapan layar) |
| S02 | Layar lari (gameplay) | Play dari S01 | inti permainan | HUD skor, koin, pengganda, indikator power-up, hoverboard | berjalan, power-up aktif, hoverboard aktif |
| S03 | Layar skor / game over | tabrak rintangan | tampil poin, koin, papan peringkat, tombol restart | skor, koin, leaderboard "Top Run" | terlihat di galeri (keterangan gambar) |
| S04 | Toko | dari S01 | beli hoverboard, Mystery Box, Score Booster, upgrade power-up | kartu item, harga koin/kunci | terlihat di galeri |
| S05 | Pilih karakter | dari S01 | pilih/buka karakter dengan koin | daftar karakter, harga, tombol beli | terlihat di galeri |
| S06 | Pilih hoverboard + kekuatan spesial | dari S01/S04 | pilih hoverboard, buka kekuatan dengan kunci | kartu hoverboard, ikon kekuatan | guess dari teks |
| S07 | Award (Spraycan Award) | dari S01 | 12 award, 4 tingkat, hadiah kunci | daftar award, progres, tingkat | terlihat di galeri |
| S08 | Misi | dari S01 | tantangan -> pengganda skor permanen | daftar misi, progres | guess dari teks |
| S09 | Word Hunt (harian) | dari S01 | kumpulkan huruf S-U-R-F-E-R, streak 5 hari | 6 slot huruf, penanda hari | guess dari teks |
| S10 | Buka Mystery Box | dari toko / saat lari / hadiah Word Hunt | animasi hadiah acak | modal hadiah | guess |
| S11 | Pause / lanjut | saat lari | jeda | tombol lanjut, keluar | guess |

## Flows

```
F01 Pemain mulai dan menyelesaikan satu lari
    S01 -> S02 -> S03 -> (restart) S02
    happy path clicks: 1 untuk mulai, 1 untuk restart
    edge: tabrak saat hoverboard aktif (hoverboard hancur, lari lanjut); lari di tab yang kehilangan fokus; skor jadi rekor baru

F02 Buka karakter baru
    S01 -> S05 -> beli dengan koin
    edge: koin kurang, karakter sudah dimiliki

F03 Pakai hoverboard
    S06/S04 (pilih/beli) -> S02 (Spasi / ketuk dua kali)
    edge: hoverboard habis, kekuatan spesial masih terkunci (butuh kunci)

F04 Kumpulkan huruf Word Hunt
    S02 (ambil huruf) -> S09 (progres) -> hadiah harian -> 5 hari berturut-turut -> Super Mystery Box
    edge: hari terlewat (streak putus)

F05 Klaim award
    S07 -> naik tingkat (perunggu/perak/emas/berlian) -> dapat kunci

F06 Buka Mystery Box
    S04 / pickup di S02 / hadiah S09 -> S10 -> hadiah (spesial / langka / jackpot)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary (Play), secondary, ikon | default, hover, pressed, disabled | semua |
| Penghitung mata uang | koin, kunci | normal, bertambah (animasi), kurang | S01, S04, S05, S06 |
| Kartu item | karakter, hoverboard, booster, power-up | terkunci, bisa dibeli, dimiliki, dipilih | S04, S05, S06 |
| Tag harga | koin, kunci | cukup, kurang | S04, S05, S06 |
| HUD lari | skor, koin, pengganda, huruf Word Hunt | normal, power-up aktif | S02 |
| Bar timer power-up | per jenis power-up | aktif, hampir habis | S02 |
| Progress bar | misi, award, streak | kosong, sebagian, selesai | S07, S08, S09 |
| Modal hadiah | Mystery Box, award, misi | muncul, klaim | S10, S07, S08 |
| Daftar papan peringkat | "Top Run" | terisi, kosong | S03 |
| Kontrol sentuh | geser 4 arah, ketuk dua kali | n/a | S02 (ponsel) |

## Inferred data model

```
Player       id, coins, keys, best_score, multiplier_permanent, selected_character, selected_hoverboard
             evidence: S01 saldo, deskripsi misi (pengganda permanen), S03 skor tertinggi
             confidence: medium
Character    id, name, price_coins, unlocked
             evidence: tabel harga di halaman Poki, S05
             confidence: high (struktur), nilai harga = milik original, tentukan sendiri
Hoverboard   id, name, price_coins, abilities[] (double_jump, stay_low, super_jump, smooth_drift, speed_up, zap_sideways), abilities_unlocked_with_keys
             evidence: tabel hoverboard
             confidence: high
Run          id, player_id, score, coins_collected, distance, powerups_used, ended_at
             evidence: S03
             confidence: medium
PowerUp      type (jetpack | super_sneakers | coin_magnet | score_x2), level, duration
             evidence: bagian Power Up (bisa di-upgrade)
             confidence: high (jenis), guess (durasi per level)
Booster      type (hoverboard | score_booster | headstart), qty
             evidence: bagian Booster
             confidence: high
MysteryBox   tiers (spesial | langka | jackpot), reward_table (8 hadiah)
             evidence: bagian Mystery Box
             confidence: medium
Mission      id, goal (mis. guling 30x), progress, reward = pengganda permanen
             evidence: bagian Misi
             confidence: medium
Award        id (12), tier (perunggu/perak/emas/berlian), key_reward 3/5/8/10
             evidence: bagian Award
             confidence: high
WordHuntDay  date, letters_collected[S,U,R,F,E,R], claimed, streak
             evidence: bagian Word Hunt
             confidence: medium
```

Relationships: Player 1-n Run, Player n-n Character, Player n-n Hoverboard, Player 1-n Mission, Player 1-n Award, Player 1-n WordHuntDay, Hoverboard n-n kekuatan.

Aturan permainan yang disebut halaman: kecepatan naik setelah sekitar setengah menit; hoverboard menyerap satu tabrakan; Speed Up +12,5%; Score Booster +5 ke pengganda; skor tampil di papan "Top Run".
Tidak disebut tapi umum (guess): jumlah jalur (kemungkinan 3), generator rintangan prosedural, jenis rintangan (kereta, palang, rintangan rendah/tinggi).

## Feature matrix

See `features.csv`. Lihat file untuk jumlah must/should/could/skip.

## Out of scope (cannot or should not be cloned)

- Nama, karakter, aset visual, musik, dan dunia/tema milik SYBO (Jake, Tricky, dunia Bali, logo, dll). Gunakan tokoh, tema, dan seni orisinal; tahap `/replica-brand` akan memeriksanya.
- Kode game asli dan bundle JS-nya (tidak dibaca, tidak disalin).
- Leaderboard global dan basis pemain milik Poki/SYBO.
- Integrasi iklan, SDK, dan akun Poki.
- Angka ekonomi persis (harga, tabel hadiah): struktur boleh ditiru, tentukan angka sendiri.
- Build native iOS/Android (di luar scope web).

## Size

Screens 11, flows 6, entities 10. Hard parts: generator trek tanpa akhir yang adil + performa render, input geser/ketuk yang responsif di ponsel, penyeimbangan ekonomi dan kesulitan, pembuatan aset orisinal (karakter, trek, suara). Size: prototipe loop inti = S (akhir pekan), seluruh fitur progresi = M (beberapa minggu).
