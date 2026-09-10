'use client';
import type { FieldIdentity } from '../lib/field-access';

export default function FieldIdentityBanner({ employee, error }: { employee: FieldIdentity | null; error?: string }) {
  if (!employee && !error) return null;
  return <div className="field-identity-banner">
    {employee ? <><span className="field-avatar">{employee.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}</span><div><small>PERSONAL SALES OFFICER MODE</small><b>{employee.full_name} · {employee.employee_code}</b><p>{employee.designation || 'Sales Officer'} · {employee.territory}, {employee.state} · Four guided photos required</p></div></> : <span>{error}</span>}
    <button type="button" onClick={() => void fetch('/api/field/session', { method: 'POST' }).then(() => window.location.reload())}>End field session</button>
  </div>;
}
