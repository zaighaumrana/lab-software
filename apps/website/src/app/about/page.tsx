export default function AboutPage() {
  return (
    <div className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold text-slate-900">About Us</h1>
      <p className="mt-4 text-slate-600">
        LabCare is a diagnostic laboratory committed to accurate, timely results and
        patient-friendly service. We operate fully even when the internet is down — your
        care does not depend on connectivity.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Our commitment</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
        <li>Quality-controlled testing</li>
        <li>Clear pricing before you test</li>
        <li>SMS updates when reports are ready</li>
        <li>Secure online report access for paid results</li>
      </ul>
    </div>
  );
}
