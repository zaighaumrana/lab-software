import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as settingsApi from '../api/settings';
import type { Branding, PrintLayout, DiscountMode, SmsProviderConfig } from '../api/settings';

interface SettingsContextValue {
  branding: Branding;
  discountMode: DiscountMode;
  smsProvider: SmsProviderConfig;
  printLayout: PrintLayout;
  loading: boolean;
  refresh: () => Promise<void>;
}

const defaultBranding: Branding = {
  labName: 'LabCare Diagnostic Laboratory',
  primaryColor: '#2563eb',
  secondaryColor: '#0f172a',
  logoDataUrl: null,
};

const defaultPrint: PrintLayout = {
  labName: 'LabCare Diagnostic Laboratory',
  labNumber: '',
  address: '',
  phone: '',
  email: '',
  footerText: 'This document is computer generated.',
  printMode: 'PLAIN',
  marginTopMm: 14,
  marginBottomMm: 14,
  reportPagination: 'CONTINUOUS',
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyCssVars(branding: Branding) {
  const root = document.documentElement;
  if (branding.primaryColor) {
    root.style.setProperty('--brand-primary', branding.primaryColor);
  }
  if (branding.secondaryColor) {
    root.style.setProperty('--brand-secondary', branding.secondaryColor);
  }
  document.title = branding.labName || 'LMS';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding);
  const [printLayout, setPrintLayout] = useState<PrintLayout>(defaultPrint);
  const [discountMode,setDiscountMode]=useState<DiscountMode>('PER_LINE');
  const [smsProvider,setSmsProvider]=useState<SmsProviderConfig>({enabled:false,provider:'SENDPK'});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await settingsApi.getSettings();
      setBranding({ ...defaultBranding, ...data.branding });
      setPrintLayout({ ...defaultPrint, ...data.printLayout });
      setDiscountMode(data.discountMode ?? 'PER_LINE');
      setSmsProvider(data.smsProvider ?? {enabled:true,provider:'SENDPK'});
      applyCssVars({ ...defaultBranding, ...data.branding });
    } catch {
      applyCssVars(defaultBranding);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const onFocus=()=>{void refresh();};
    window.addEventListener('focus',onFocus);
    return ()=>window.removeEventListener('focus',onFocus);
  }, []);

  return (
    <SettingsContext.Provider value={{ branding, printLayout, discountMode, smsProvider, loading, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
