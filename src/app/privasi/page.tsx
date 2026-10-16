import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { formatRupiah, PLAN } from '@/lib/billing-options'

export const metadata: Metadata = { title: 'Kebijakan Privasi' }

const APP_NAME = 'Social Copilot'
const CONTACT_EMAIL = 'creative.karsindo@gmail.com'
const EFFECTIVE_DATE = '16 Oktober 2026'

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
          membalas pesan langsung (DM), dan membuat draf konten dengan bantuan AI, melalui API resmi Meta. Setiap
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
            <strong>Akun Instagram dan Facebook pengguna:</strong> ID akun, username, jenis akun, nama Facebook Page,
            dan token akses. Token disimpan terenkripsi (AES-256-GCM).
          </li>
          <li>
            <strong>Konten pengguna:</strong> foto, caption, dan jadwal post, serta ID dan tautan post yang sudah
            terbit.
          </li>
          <li>
            <strong>Pesan langsung:</strong> kalau Anda mengirim DM ke akun Instagram yang terhubung dengan {APP_NAME},
            Meta meneruskan ke layanan ini ID Instagram Anda yang khusus untuk akun tersebut, username dan nama profil
            Anda, isi pesan teks, dan waktunya. Lampiran seperti foto dan video tidak disimpan. Balasan pemilik akun
            juga disimpan agar percakapan bisa dibaca utuh.
          </li>
          <li>
            <strong>Referensi brand:</strong> isi website brand pengguna, serta gambar post publik akun bisnis atau
            kreator Instagram lain yang dipilih pengguna sebagai referensi desain, beserta nama akun dan tautannya.
          </li>
        </ul>

        <h3 className="font-semibold text-zinc-900">Untuk apa data dipakai</h3>
        <p>
          Data hanya dipakai untuk menjalankan fitur bagi pengguna pemiliknya: menerbitkan post terjadwal, menampilkan
          dan membalas DM, serta membuat draf caption dan gambar. Data satu pengguna tidak bisa dilihat pengguna lain.
          Setiap DM dikirim oleh pemilik akun sendiri sebagai balasan. {APP_NAME} tidak mengirim pesan massal atau
          pesan yang tidak diminta.
        </p>

        <h3 className="font-semibold text-zinc-900">Dengan siapa data dibagikan</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Meta (Instagram dan Facebook):</strong> untuk menerbitkan post, mengambil profil, dan mengirim
            balasan DM.
          </li>
          <li>
            <strong>Mayar:</strong> email dan nominal tagihan, untuk memproses pembayaran langganan. Data kartu atau
            rekening Anda diproses Mayar dan tidak pernah sampai ke {APP_NAME}.
          </li>
          <li>
            <strong>Penyedia AI melalui 9Router:</strong> topik, caption, informasi brand, dan gambar referensi yang
            dimasukkan pengguna dikirim untuk membuat draf. Isi DM tidak pernah dikirim ke layanan AI.
          </li>
        </ul>
        <p>Data tidak dijual dan tidak dipakai untuk iklan.</p>

        <h3 className="font-semibold text-zinc-900">Penyimpanan dan keamanan</h3>
        <p>
          Data disimpan di database dan penyimpanan file Supabase yang dikelola {APP_NAME}. Dashboard hanya bisa
          dibuka setelah login, setiap permintaan hanya membaca data milik pengguna yang login, dan database tidak bisa
          diakses publik.
        </p>

        <h3 className="font-semibold text-zinc-900">Berapa lama data disimpan</h3>
        <p>
          Token akses dihapus saat pengguna memutus koneksi Instagram atau Facebook. Data lain disimpan selama akun
          pengguna aktif, atau sampai dihapus atas permintaan (lihat{' '}
          <a href="#hapus-data" className="underline">Penghapusan Data</a>).
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
          <li>
            Langganan {formatRupiah(PLAN.priceIdr)} per {PLAN.days} hari, dibayar di muka melalui Mayar. Tidak ada
            perpanjangan otomatis: akses berhenti di akhir periode sampai diperpanjang, dan post terjadwal tidak
            diterbitkan selama langganan tidak aktif.
          </li>
          <li>
            Setiap periode memberi kuota AI {PLAN.credits.toLocaleString('id-ID')} kredit. Sisa kuota tidak terbawa ke
            periode berikutnya.
          </li>
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
          DM, dan brand kit):
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Kirim email ke <a href={DELETE_MAIL} className="underline">{CONTACT_EMAIL}</a> dengan subjek
            &ldquo;Hapus data&rdquo; dari alamat email akun Anda.
          </li>
          <li>Akun dan datanya dihapus paling lambat 30 hari setelah email diterima, lalu Anda mendapat konfirmasi.</li>
        </ol>
        <p>
          Akses aplikasi juga bisa dicabut kapan saja: putuskan koneksi di Pengaturan, lalu hapus {APP_NAME} di
          Instagram (Pengaturan dan aktivitas → Izin situs web → Aplikasi dan situs web) dan di Facebook (Pengaturan dan
          privasi → Pengaturan → Aplikasi dan situs web).
        </p>
        <p>
          <strong>Pengirim DM:</strong> kalau Anda pernah mengirim DM ke akun yang dikelola dengan {APP_NAME} dan ingin
          datanya dihapus, kirim email ke alamat yang sama dengan subjek &ldquo;Hapus data&rdquo; dan sertakan username
          Instagram Anda. Percakapan dan pesan Anda dihapus paling lambat 30 hari setelah email diterima. Anda juga bisa
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
