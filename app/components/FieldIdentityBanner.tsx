'use client';
import { useEffect, useState } from 'react';
export default function FieldIdentityBanner() {
  const [data, setData] = useState<{ employee?: { full_name: string; employee_code: string } | null; error?: string }>({});
  useEffect(() => { fetch('/api/field/session', { cache: 'no-store' }).then((r) => r.json()).then((result) => setData(result as typeof data)).catch(() => {}); }, []);
  if (!data.employee && !data.error) return null;
  return <div className="field-identity-banner"><span>{data.employee ? `Field officer: ${data.employee.full_name} · ${data.employee.employee_code}. Photos submitted here count towards your field report.` : data.error}</span><button type="button" onClick={() => void fetch('/api/field/session', { method: 'POST' }).then(() => window.location.reload())}>End field session</button></div>;
}
