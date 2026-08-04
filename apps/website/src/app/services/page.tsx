const SERVICES = [
  {
    title: 'Routine Blood Tests',
    desc: 'CBC, glucose, lipid profile, liver and kidney function, and more.',
  },
  {
    title: 'Hormone Panels',
    desc: 'Thyroid (TSH), and other hormone assays as listed in our rate card.',
  },
  {
    title: 'Urine Analysis',
    desc: 'Routine urine examination for infection and metabolic screening.',
  },
  {
    title: 'Health Packages',
    desc: 'Bundled tests (e.g. Diabetes package) at package pricing.',
  },
  {
    title: 'Home Collection',
    desc: 'Available in our service area — book and confirm with the lab.',
  },
  {
    title: 'Online Reports',
    desc: 'View and download reports with tracking ID after full payment.',
  },
];

export default function ServicesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Services</h1>
        <p className="mt-2 text-slate-600">What we offer at the laboratory.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SERVICES.map((s) => (
          <div
            key={s.title}
            className="rounded-xl border border-slate-200 p-5 shadow-sm"
          >
            <h2 className="font-semibold text-slate-900">{s.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
