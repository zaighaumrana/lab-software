import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/rates', label: 'Test Rates' },
  { href: '/booking', label: 'Book Test' },
  { href: '/report', label: 'Report Lookup' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="text-xl font-bold text-brand-700">
          LabCare
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm font-medium text-slate-600">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 hover:bg-slate-50 hover:text-brand-700"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
