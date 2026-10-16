import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Kebijakan Privasi' }

const APP_NAME = 'Social Copilot'
const CONTACT_EMAIL = 'creative.karsindo@gmail.com'
const EFFECTIVE_DATE = '16 Oktober 2026'

const DELETE_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Hapus data')}`

/**
 * Public through the tunnel (PUBLIC_PATHS) for the Meta app's Privacy Policy, Terms of Service and data deletion
 * URLs. The proxy also blocks /_next/ there, so the page must read well as plain HTML without its stylesheet.
 */
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
          {APP_NAME} adalah aplikasi pribadi yang dipakai pengelolanya untuk menjadwalkan konten dan membalas pesan
          langsung (DM) di akun Instagram miliknya sendiri, melalui API resmi Meta. Aplikasi ini tidak dijual dan tidak
          disediakan untuk umum. Pengelola data adalah {APP_NAME}, yang bisa dihubungi di{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
        </p>

        <h3 className="font-semibold text-zinc-900">Data yang diproses</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Akun Instagram dan Facebook pengelola:</strong> ID akun, username, jenis akun, dan token akses.
            Token disimpan terenkripsi (AES-256-GCM).
          </li>
          <li>
            <strong>Konten pengelola:</strong> foto, caption, dan jadwal post, serta ID dan tautan post yang sudah
            terbit.
          </li>
          <li>
            <strong>Pesan langsung:</strong> kalau Anda mengirim DM ke akun Instagram pengelola, Meta meneruskan ke
            aplikasi ini ID Instagram Anda yang khusus untuk aplikasi ini, username dan nama profil Anda, isi pesan
            teks, dan waktunya. Lampiran seperti foto dan video tidak disimpan. Balasan pengelola juga disimpan agar
            percakapan bisa dibaca utuh.
          </li>
          <li>
            <strong>Referensi brand:</strong> isi website brand pengelola, serta gambar post publik akun bisnis atau
            kreator Instagram lain yang dipilih pengelola sebagai referensi desain, beserta nama akun dan tautannya.
          </li>
        </ul>

        <h3 className="font-semibold text-zinc-900">Untuk apa data dipakai</h3>
        <p>
          Data hanya dipakai untuk menjalankan fitur aplikasi bagi pengelola: menerbitkan post terjadwal, menampilkan
          dan membalas DM, serta membuat draf caption. Setiap DM dikirim oleh pengelola sendiri sebagai balasan. Aplikasi
          ini tidak mengirim pesan massal atau pesan yang tidak diminta.
        </p>

        <h3 className="font-semibold text-zinc-900">Dengan siapa data dibagikan</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Meta (Instagram dan Facebook):</strong> untuk menerbitkan post, mengambil profil, dan mengirim
            balasan DM.
          </li>
          <li>
            <strong>Penyedia AI melalui 9Router:</strong> topik, caption, informasi brand, dan gambar referensi yang
            dimasukkan pengelola dikirim untuk membuat draf. Isi DM tidak pernah dikirim ke layanan AI.
          </li>
        </ul>
        <p>Data tidak dijual dan tidak dipakai untuk iklan.</p>

        <h3 className="font-semibold text-zinc-900">Penyimpanan dan keamanan</h3>
        <p>
          Data disimpan di database dan penyimpanan file Supabase yang di-host sendiri oleh pengelola. Dashboard
          aplikasi hanya bisa dibuka dari komputer pengelola, dan database tidak bisa diakses publik.
        </p>

        <h3 className="font-semibold text-zinc-900">Berapa lama data disimpan</h3>
        <p>
          Token akses dihapus saat pengelola memutus koneksi Instagram atau Facebook. Data lain disimpan selama
          diperlukan untuk fitur di atas, atau sampai dihapus atas permintaan (lihat{' '}
          <a href="#hapus-data" className="underline">Penghapusan Data</a>).
        </p>
      </Section>

      <Section id="ketentuan" title="Ketentuan Layanan">
        <ul className="list-disc space-y-2 pl-5">
          <li>{APP_NAME} hanya dipakai pengelolanya untuk akun miliknya sendiri. Tidak ada layanan untuk pihak lain.</li>
          <li>
            Pemakaian mengikuti Ketentuan Platform Meta, Ketentuan Penggunaan Instagram, dan Pedoman Komunitas
            Instagram.
          </li>
          <li>Aplikasi disediakan apa adanya, tanpa jaminan apa pun.</li>
          <li>Perubahan kebijakan dan ketentuan diumumkan dengan memperbarui halaman ini dan tanggal berlakunya.</li>
        </ul>
      </Section>

      <Section id="hapus-data" title="Penghapusan Data">
        <p>Kalau Anda pernah mengirim DM ke akun yang dikelola dengan aplikasi ini dan ingin datanya dihapus:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Kirim email ke <a href={DELETE_MAIL} className="underline">{CONTACT_EMAIL}</a> dengan subjek
            &ldquo;Hapus data&rdquo;, dan sertakan username Instagram Anda.
          </li>
          <li>
            Percakapan dan pesan Anda dihapus dari database paling lambat 30 hari setelah email diterima, lalu Anda
            mendapat balasan konfirmasi.
          </li>
        </ol>
        <p>
          Anda juga bisa meminta salinan data Anda lewat email yang sama. Pengelola yang ingin mencabut akses aplikasi
          bisa memutus koneksi di Pengaturan aplikasi, lalu menghapus {APP_NAME} di Instagram (Pengaturan dan aktivitas
          → Izin situs web → Aplikasi dan situs web) dan di Facebook (Pengaturan dan privasi → Pengaturan → Aplikasi
          dan situs web).
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
