import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-16 text-white">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Accurate diagnostics.
          <br />
          Trusted results.
        </h1>
        <p className="mt-4 max-w-xl text-brand-100">
          Book your lab tests online, visit us at your convenience, and access reports
          securely with your tracking ID.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/booking"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 hover:bg-brand-50"
          >
            Book a Test
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            View Report
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Wide Test Menu',
            body: 'Chemistry, haematology, hormones, and more — with clear pricing.',
            href: '/rates',
          },
          {
            title: 'Online Booking',
            body: 'Reserve a slot. Pay at the lab. No account required.',
            href: '/booking',
          },
          {
            title: 'Secure Reports',
            body: 'Tracking ID + phone verification. Download when fully paid.',
            href: '/report',
          },
        ].map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-xl border border-slate-200 p-6 shadow-sm transition hover:border-brand-300 hover:shadow"
          >
            <h2 className="font-semibold text-slate-900">{c.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{c.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
