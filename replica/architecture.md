# Architecture: endless runner kereta orisinal (rebuild fitur inti game endless-runner Subway Surfers versi web)

Dibaca dari: `replica/recon.md` dan `replica/features.csv` (2026-11-14).
Prinsip: ini game browser, bukan SaaS. Tidak perlu auth, pembayaran, email, atau server untuk versi pertama.
Stack mengikuti yang sudah dipakai di server (Vite + TypeScript + Three.js, jalan di Node + pm2), jadi tidak ada hal baru yang harus dipelajari.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Vite + TypeScript | build cepat, sama dengan proyek 3D lain di server |
| render | Three.js (kamera belakang, 3 jalur) | 3D sederhana lewat geometri low-poly; tanpa engine berat |
| input | Pointer Events + Keyboard | satu jalur kode untuk mouse/sentuh; swipe dihitung sendiri |
| audio | WebAudio (Howler.js opsional) | harus di-unlock lewat gestur pertama |
| UI (menu/toko) | HTML + CSS overlay di atas canvas | lebih mudah dari menggambar UI di WebGL |
| state | satu objek `GameState` + event bus kecil | tanpa framework state; mudah dites |
| database | tidak ada (v1): `localStorage` bersyarat try/catch | progres hanya perlu hidup di perangkat |
| auth | tidak ada | tidak ada akun di v1 |
| payments | tidak ada | semua mata uang in-game, tidak ada uang asli |
| email | tidak ada | |
| jobs | tidak ada (reset Word Hunt dihitung dari tanggal lokal di klien) | |
| tes | Vitest untuk logika murni (generator, skor, ekonomi) | generator harus bisa dites tanpa render |
| hosting | `vite build` -> folder statis, dilayani Node/pm2 (atau host statis) | nanti lewat `/replica-deploy` |

Fase 3 (opsional, bukan v1): Node + SQLite kecil untuk leaderboard global/cloud save. Skema-nya ada di `replica/schema.sql`.

## Struktur kode

```
src/
  main.ts                 bootstrap, loop, resize
  core/   loop.ts (fixed timestep 60 Hz), events.ts, rng.ts (seeded), save.ts
  input/  keyboard.ts, swipe.ts
  world/  chunks.ts (generator), pool.ts (object pooling), track.ts, obstacles.ts
  player/ runner.ts (state machine: run, jump, roll, switch-lane, crash)
  items/  coins.ts, powerups.ts, hoverboard.ts, mysterybox.ts
  meta/   economy.ts, shop.ts, characters.ts, missions.ts, awards.ts, wordhunt.ts
  ui/     menu.ts, hud.ts, gameover.ts, shop.ts, awards.ts ... (overlay HTML)
  audio/  sfx.ts, music.ts
  data/   balance.json (harga, durasi, tabel hadiah: angka SENDIRI)
```

## Schema (data tersimpan)

Access rules: tidak ada (data lokal milik pemain sendiri). Tabel server hanya di fase 3.

Save di klien (kunci `runner.save.v1`, JSON, selalu pakai `version` untuk migrasi):

```ts
type Save = {
  version: 1;
  coins: number; keys: number;
  bestScore: number; permanentMultiplier: number;      // naik dari misi
  selectedCharacter: string; selectedHoverboard: string;
  characters: Record<string, { unlocked: boolean }>;
  hoverboards: Record<string, { unlocked: boolean; abilitiesUnlocked: string[] }>;
  powerupLevels: Record<'jetpack'|'sneakers'|'magnet'|'score2x', number>;
  boosters: { hoverboard: number; scoreBooster: number; headstart: number };
  missions: { id: string; progress: number; done: boolean }[];
  awards: Record<string, { tier: 0|1|2|3|4; progress: number }>;
  wordHunt: { day: string /* YYYY-MM-DD lokal */; letters: string[]; claimed: boolean; streak: number };
  settings: { sfx: number; music: number };
};
```

Aturan penyimpanan: baca/tulis dibungkus try/catch (mode privat bisa menolak storage); jika kosong atau rusak, pakai default; simpan hanya di akhir lari dan saat beli (bukan tiap frame).

## API

Tidak ada route server di v1. "API" internal antar-modul:

| fungsi | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `game.start(seed)` | mulai lari | UI menu | seed? | sesi baru | F01 |
| `runner.handle(cmd)` | left/right/jump/roll/hoverboard | input | cmd | perubahan state | F01, F03 |
| `world.nextChunk(rng, difficulty)` | hasilkan potongan trek | loop | seed, tingkat | chunk valid | F01 |
| `economy.addCoins(n)` / `spend(n)` | ubah saldo | item, toko | n | saldo baru / gagal | F02 |
| `shop.buy(itemId)` | beli karakter/hoverboard/upgrade | UI toko | id | ok / error koin kurang | F02, F03 |
| `mysterybox.open(kind)` | undi hadiah | toko/pickup | jenis | hadiah | F06 |
| `missions.report(event)` | catat progres | runner | event | misi selesai? | F04 |
| `awards.report(event)` | naikkan tingkat | runner | event | key reward | F05 |
| `wordhunt.collect(letter)` | simpan huruf harian | runner | huruf | progres/streak | F04 |
| `save.load()` / `save.write()` | persistensi | seluruh game | n/a | Save | semua |

Webhooks: tidak ada. Jobs: tidak ada (pengecekan hari baru dilakukan saat game dibuka).

Rute fase 3 (opsional): `POST /api/scores` (kirim skor + seed + durasi), `GET /api/leaderboard?period=weekly`, `PUT /api/save` (cloud save, butuh identitas).

## Hard constraints

- Generator trek harus selalu menghasilkan jalur yang BISA dilewati (ada jalur/aksi yang selamat di tiap potongan). Dites otomatis dengan simulasi.
- Satu pemain tidak boleh membelanjakan koin dua kali: `spend()` harus atomik terhadap state sebelum `save.write()`.

## The parts that bite

- Fixed timestep: logika di 60 Hz, render mengikuti; tanpa ini kecepatan beda di layar 144 Hz dan hasil simulasi tidak bisa dites.
- Generator adil: kombinasi rintangan antar-chunk (sambungan) paling sering menghasilkan jalan buntu. Pakai aturan "selalu ada satu jalur bebas" + jarak reaksi minimum yang mengecil bertahap.
- Performa: object pooling (jangan `new` mesh per rintangan), geser/daur ulang chunk, batasi `devicePixelRatio` (maks 2), `InstancedMesh` untuk koin.
- Input ponsel: ambang geser (mis. 30 px) dan arah dominan; cegah scroll/zoom bawaan browser (`touch-action: none`); buffer input 100-150 ms agar lompat tidak terasa terlambat.
- Tab kehilangan fokus: jeda otomatis lewat `visibilitychange` supaya tidak mati karena tab di latar.
- Audio: butuh gestur pengguna pertama; sediakan tombol mute.
- Waktu/zona: reset Word Hunt memakai tanggal lokal perangkat; pemain bisa mengubah jam (diterima untuk v1 yang offline).
- Save: versi + migrasi, jangan menyimpan tiap frame, tangani storage penuh/diblokir.
- Ekonomi: semua angka di `data/balance.json`, bukan tersebar di kode; tes sederhana bahwa karakter pertama bisa dibeli dalam beberapa lari.
- Lisensi aset: semua model, tekstur, suara, dan font harus orisinal atau berlisensi bebas (catat sumber di `ASSETS.md`).

## Build order

1. **Vertical slice** (target S, akhir pekan): `main.ts` + loop + 1 karakter placeholder + 3 jalur + generator minimal (kereta/penghalang) + lompat/guling/pindah jalur + koin + skor + game over + restart. Layar: S02, S03. Fitur: 8 baris "must" gameplay di `features.csv`. Tabel: tidak ada. Route: tidak ada.
2. **Must-haves lain:** kecepatan naik, kontrol sentuh, hoverboard (absorb 1 tabrakan), save lokal + skor tertinggi. Layar: S01, S11.
3. **Should-haves:** power-up (jetpack, sneakers, magnet, x2) + upgrade, toko (S04), pilih karakter (S05), audio.
4. **Could-haves:** hoverboard dengan kekuatan (S06), kunci, Mystery Box (S10), misi (S08), award (S07), Word Hunt (S09), tema dunia.
5. **Fase 3 (opsional):** server leaderboard/cloud save dengan skema `schema.sql`.
6. **Fixes dari replica-entrepreneur:** setelah tahap itu dijalankan.
