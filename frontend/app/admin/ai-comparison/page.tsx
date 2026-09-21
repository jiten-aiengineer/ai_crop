import { redirect } from 'next/navigation';

export const metadata = { title: 'AI Diagnostic Lab | Crop Life AI', robots: { index: false, follow: false } };
export default function Page() { redirect('/admin/portal'); }
