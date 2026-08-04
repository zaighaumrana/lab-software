export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50 print:hidden">
      <div className="mx-auto max-w-5xl px-4 py-8 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">LabCare Diagnostic Laboratory</p>
        <p className="mt-1">Phone: 0300-1234567 · Open Sat–Thu 8am–8pm</p>
        <p className="mt-4 text-xs">© {new Date().getFullYear()} LabCare. All rights reserved.</p>
      </div>
    </footer>
  );
}
