import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { formatRupiah, type Plan } from '@/lib/billing-options'

export const metadata: Metadata = { title: 'Kebijakan Privasi' }

const APP_NAME = 'Carousely'
const CONTACT_EMAIL = 'creative.karsindo@gmail.com'
const EFFECTIVE_DATE = '19 Oktober 2026'

const DELETE_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Hapus data')}`

/** Public (PUBLIC_PATHS in proxy.ts) for the Meta app's Privacy Policy, Terms of Service and data deletion URLs. */
export default function PrivasiPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-10 text-zinc-800">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Kebijakan Privasi {APP_NAME}</h1>
        <p className="text-sm text-zinc-500">Berlaku sejak {EFFECTIVE_DATE}.</p>
        <nav aria-label="Isi halaman" className="text-sm">
          <a href="#privasi" className="underline">Kebijakan Privasi</a> ·{' '}
          <a href="#ketentuan" className="underline">Ketentuan Layanan</a> ·{' '}
          <a href="#hapus-data" className="underline">Penghapusan Data</a>
        </nav>
      </header>

      <Section id="privasi" title="Kebijakan Privasi">
        <p>
          {APP_NAME} adalah layanan bagi pemilik akun Instagram Business atau Creator untuk menjadwalkan konten,
          membalas pesan langsung (DM) dan komentar, serta membuat draf konten dengan bantuan AI, melalui API resmi Meta. Setiap
          pengguna mendaftar dengan email dan password, lalu menghubungkan satu akun Instagram miliknya. Pengelola
          layanan adalah {APP_NAME}, yang bisa dihubungi di{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
        </p>

        <h3 className="font-semibold text-zinc-900">Data yang diproses</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Akun pengguna:</strong> alamat email dan password. Password disimpan dalam bentuk hash oleh sistem
            login, tidak pernah dalam bentuk aslinya.
          </li>
          <li>
            <strong>Akun Instagram dan Facebook pengguna:</strong> ID akun, username, jenis akun, ID dan nama Facebook
            Page, izin yang disetujui, masa berlaku token, dan token akses. Token disimpan terenkripsi (AES-256-GCM).
          </li>
          <li>
            <strong>Profil Instagram saat pertama terhubung:</strong> untuk mengisi brand kit, {APP_NAME} membaca nama,
            bio, foto profil, dan caption hingga 12 post terbaru akun yang terhubung. Foto profil disimpan sebagai logo
            brand dan gambar 3 post terbaru disalin sebagai referensi desain. Semuanya bisa diubah atau dihapus di
            halaman Brand.
          </li>
          <li>
            <strong>Konten pengguna:</strong> foto, caption, dan jadwal post, ide konten, serta ID dan tautan post yang
            sudah terbit, beserta catatan kegagalan penerbitan.
          </li>
          <li>
            <strong>Statistik post:</strong> untuk halaman Analitik, {APP_NAME} membaca post akun yang terhubung dari 90
            hari terakhir (ID, jenis, caption, tautan, gambar mini, waktu terbit) beserta insights-nya: views, reach,
            suka, komentar, share, simpan, dan total interaksi. Hanya angka terbaru yang disimpan; post yang dihapus
            dari Instagram ikut dihapus pada sinkronisasi berikutnya.
          </li>
          <li>
            <strong>Pesan langsung:</strong> kalau Anda mengirim DM ke akun Instagram yang terhubung dengan {APP_NAME},
            Meta meneruskan ke layanan ini ID Instagram Anda yang khusus untuk akun tersebut, username, nama, dan
            tautan foto profil Anda, ID pesan, isi pesan teks, dan waktunya. Tautan foto profil dibaca ulang paling
            sering tiap 3 hari dan hanya dipakai untuk menampilkan avatar di kotak masuk. Lampiran seperti foto dan video tidak disimpan. Pesan pemilik
            akun dalam percakapan itu, baik yang dikirim lewat {APP_NAME} maupun langsung dari aplikasi Instagram, juga
            disimpan agar percakapan bisa dibaca utuh, beserta kapan pemilik terakhir membukanya. DM tidak disimpan
            selama langganan pemilik akun tidak aktif.
          </li>
          <li>
            <strong>Komentar post:</strong> kalau Anda berkomentar di post akun yang terhubung dengan {APP_NAME}, layanan
            ini menyimpan ID komentar, ID post, ID dan username Instagram Anda, isi komentar, waktunya, komentar yang
            dibalasnya, dan apakah komentar disembunyikan. Komentar diterima dari Meta saat ditulis dan ditarik ulang dari
            post 30 hari terakhir saat pemilik membuka halaman Balasan, agar pemilik bisa membaca, membalas (di kolom
            komentar atau sekali lewat DM), menyembunyikan, atau menghapusnya. Komentar yang dihapus dari Instagram ikut
            dihapus pada penarikan berikutnya.
          </li>
          <li>
            <strong>Referensi brand dan Aset website:</strong> isi hingga 11 halaman website brand, gambar yang pengguna
            pilih untuk diimpor ke Aset, serta post publik akun bisnis atau kreator Instagram lain yang dipilih sebagai
            referensi desain, beserta nama akun dan tautannya. Nama, bio, dan jumlah pengikut akun lain itu hanya
            ditampilkan saat dicari dan tidak disimpan.
          </li>
          <li>
            <strong>Riwayat permintaan AI:</strong> isi yang dikirim ke AI dan hasilnya, model, status, durasi, dan
            kredit yang terpakai. Disimpan untuk menghitung kuota dan menelusuri masalah.
          </li>
          <li>
            <strong>Pembayaran:</strong> nominal, status, tautan pembayaran Mayar, dan periode langganan.
          </li>
          <li>
            <strong>Cookie:</strong> hanya cookie sesi login agar Anda tetap masuk. {APP_NAME} tidak memakai cookie
            iklan, pelacak, atau analitik pihak ketiga.
          </li>
        </ul>

        <h3 className="font-semibold text-zinc-900">Untuk apa data dipakai</h3>
        <p>
          Data hanya dipakai untuk menjalankan fitur bagi pengguna pemiliknya: menerbitkan post terjadwal, menampilkan
          dan membalas DM dan komentar, memberi tahu pemilik ada pesan atau komentar baru, menampilkan performa post, serta membuat draf caption dan gambar. Data satu pengguna tidak bisa dilihat pengguna lain.
          Setiap DM dan balasan komentar dikirim oleh pemilik akun sendiri. {APP_NAME} tidak mengirim pesan massal atau
          pesan yang tidak diminta.
        </p>

        <h3 className="font-semibold text-zinc-900">Dengan siapa data dibagikan</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Meta (Instagram dan Facebook):</strong> untuk menerbitkan post, mengambil profil dan statistik
            post, membaca komentar, mengirim balasan DM dan komentar, serta menyembunyikan atau menghapus komentar atas
            perintah pemilik akun.
          </li>
          <li>
            <strong>Mayar:</strong> email dan nominal tagihan, untuk memproses pembayaran langganan. Data kartu atau
            rekening Anda diproses Mayar dan tidak pernah sampai ke {APP_NAME}.
          </li>
          <li>
            <strong>Penyedia AI melalui 9Router:</strong> topik, caption, informasi brand, isi website brand, username,
            nama, bio, dan caption Instagram pengguna, gambar referensi, serta gambar produk atau website yang dipilih
            untuk katalog atau konten dikirim untuk membuat draf. Isi DM dan komentar (hingga 10 pesan terakhir, beserta
            caption post untuk komentar) dikirim hanya saat pemilik akun menekan tombol AI untuk membuat draf balasan,
            tanpa ID atau foto profil pengirim.
          </li>
        </ul>
        <p>Data tidak dijual dan tidak dipakai untuk iklan.</p>

        <h3 className="font-semibold text-zinc-900">Penyimpanan dan keamanan</h3>
        <p>
          Data disimpan di database dan penyimpanan file Supabase yang dikelola {APP_NAME}. Dashboard hanya bisa
          dibuka setelah login, setiap permintaan hanya membaca data milik pengguna yang login, database tidak bisa
          diakses publik, dan file hanya dibuka lewat tautan bertanda tangan yang kedaluwarsa dalam 1 jam.
        </p>
        <p>
          Admin {APP_NAME} bisa melihat email pengguna, tanggal daftar dan login terakhir, username Instagram yang
          terhubung, status langganan, riwayat pembayaran, serta jumlah dan status permintaan AI (tanpa isinya), untuk
          dukungan pelanggan dan penagihan. Admin bisa mengatur ulang password, menangguhkan, atau menghapus akun, dan
          setiap tindakan itu dicatat.
        </p>

        <h3 className="font-semibold text-zinc-900">Berapa lama data disimpan</h3>
        <p>
          Token akses dihapus saat pengguna memutus koneksi. Memutus Instagram juga menghapus koneksi Facebook-nya.
            Koneksi tetap bisa diputus saat langganan tidak aktif, dari halaman Pengaturan. Data lain disimpan selama akun
          pengguna ada, atau sampai dihapus atas permintaan (lihat{' '}
          <a href="#hapus-data" className="underline">Penghapusan Data</a>). Catatan tindakan admin, termasuk email
          akun yang terkena tindakan itu, tetap disimpan setelah akun dihapus sebagai jejak audit.
        </p>
      </Section>

      <Section id="ketentuan" title="Ketentuan Layanan">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Pengguna hanya menghubungkan akun Instagram miliknya sendiri atau akun yang berhak ia kelola, dan
            bertanggung jawab atas konten serta balasan yang diterbitkan.
          </li>
          <li>
            Pemakaian mengikuti Ketentuan Platform Meta, Ketentuan Penggunaan Instagram, dan Pedoman Komunitas
            Instagram. Spam, pesan massal, dan pesan yang tidak diminta dilarang.
          </li>
          <Suspense fallback={<li>Harga, masa aktif, dan kuota mengikuti paket yang dipilih pada ringkasan pembayaran.</li>}>
            <PlanTerms />
          </Suspense>
          <li>
            Pembayaran yang sudah diterima tidak dapat dikembalikan, kecuali layanan tidak bisa dipakai karena kesalahan
            dari pihak {APP_NAME}.
          </li>
          <li>Layanan disediakan apa adanya, tanpa jaminan apa pun.</li>
          <li>Perubahan kebijakan dan ketentuan diumumkan dengan memperbarui halaman ini dan tanggal berlakunya.</li>
        </ul>
      </Section>

      <Section id="hapus-data" title="Penghapusan Data">
        <p>
          <strong>Pengguna {APP_NAME}</strong> yang ingin menghapus akun beserta seluruh datanya (koneksi, post, foto,
          DM, komentar, brand kit, riwayat AI, dan riwayat pembayaran):
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Kirim email ke <a href={DELETE_MAIL} className="underline">{CONTACT_EMAIL}</a> dengan subjek
            &ldquo;Hapus data&rdquo; dari alamat email akun Anda.
          </li>
          <li>Akun dan datanya dihapus paling lambat 30 hari setelah email diterima, lalu Anda mendapat konfirmasi.</li>
        </ol>
        <p>
          Akses aplikasi juga bisa dicabut kapan saja: putuskan koneksi di Pengaturan (atau di Langganan saat
          langganan tidak aktif), lalu hapus {APP_NAME} di
          Instagram (Pengaturan dan aktivitas → Izin situs web → Aplikasi dan situs web) dan di Facebook (Pengaturan dan
          privasi → Pengaturan → Aplikasi dan situs web).
        </p>
        <p>
          <strong>Pengirim DM dan komentar:</strong> kalau Anda pernah mengirim DM atau berkomentar di akun yang dikelola
          dengan {APP_NAME} dan ingin
          datanya dihapus, kirim email ke alamat yang sama dengan subjek &ldquo;Hapus data&rdquo; dan sertakan username
          Instagram Anda. Percakapan, pesan, dan komentar Anda dihapus paling lambat 30 hari setelah email diterima. Anda juga bisa
          meminta salinan data Anda lewat email yang sama.
        </p>
      </Section>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 leading-relaxed">
      <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

/** The plan as the admin set it (/admin/pengaturan). */
async function PlanTerms() {
  await connection()
  const billing = await getBillingCatalog().catch(() => ({ catalog: DEFAULT_CATALOG }))
  return <>{billing.catalog.plans.filter((plan) => plan.active).map((plan) => <PlanTermsText key={plan.id} plan={plan} />)}</>
}

function PlanTermsText({ plan }: { plan: Plan }) {
  return (
    <>
      <li>
        Paket {plan.name}: {formatRupiah(plan.priceIdr)} per bulan sebelum diskon durasi, dibayar di muka melalui Mayar. Tidak ada
        perpanjangan otomatis: akses berhenti di akhir periode sampai diperpanjang, dan post terjadwal tidak diterbitkan
        selama langganan tidak aktif.
      </li>
      <li>
        Paket {plan.name} memberi kuota AI {plan.credits.toLocaleString('id-ID')} kredit per bulan, termasuk untuk pembelian beberapa bulan. Sisa kuota tidak terbawa ke bulan berikutnya. Ketentuan pembelian disimpan saat checkout.
      </li>
    </>
  )
}
