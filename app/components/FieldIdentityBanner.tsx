'use client';
import type { FieldIdentity } from '../lib/field-access';

export default function FieldIdentityBanner({ employee, error, t }: { employee: FieldIdentity | null; error?: string; t: Record<string, string> }) {
  if (!employee && !error) return null;
  return <div className="field-identity-banner">
    {employee ? <><span className="field-avatar">{employee.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}</span><div><small>{t.fieldPersonalMode}</small><b>{employee.full_name} · {employee.employee_code}</b><p>{employee.designation || t.fieldSalesOfficer} · {employee.territory}, {employee.state} · {t.fieldFourRequested}</p></div></> : <span>{error}</span>}
  </div>;
}
