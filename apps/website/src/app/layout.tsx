import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'LabCare — Diagnostic Laboratory',
  description: 'Accurate lab testing. Book online. View reports securely.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 print:max-w-none print:p-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
