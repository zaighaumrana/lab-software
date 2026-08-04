export default function ContactPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Contact</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold">Main Branch</h2>
          <p className="mt-2 text-sm text-slate-600">
            Lab Address
            <br />
            Phone: 0300-1234567
            <br />
            Hours: Sat–Thu 8:00 AM – 8:00 PM
            <br />
            Friday: Closed
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold">Notes</h2>
          <p className="mt-2 text-sm text-slate-600">
            For fasting tests (e.g. FBS, lipid), please arrive fasting as advised.
            Bring a valid ID. Online booking reserves a slot; payment is at the lab.
          </p>
        </div>
      </div>
    </div>
  );
}
