'use client';
import { useEffect, useState } from 'react';
type Photo = { inspection_id: string; image_order: number; byte_size: number; created_at: string; farmer_crop_text?: string; location_text?: string; employee_name?: string };
export default function InspectionGallery() {
  const [page, setPage] = useState(0); const [data, setData] = useState<{ items: Photo[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  useEffect(() => { const controller = new AbortController(); setBusy(true); setError('');
    fetch(`/api/admin/portal/images?offset=${page * 48}&limit=48`, { cache: 'no-store', signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error('Unable to load the image archive.'); return r.json(); }).then((result) => setData(result as typeof data)).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [page]);
  return <div className="admin-content"><div className="admin-list-toolbar"><div><p className="admin-overline">Private image archive</p><h2>{data.total} retained crop photos</h2><p>Browse every retained inspection photo. Each page contains up to 48 images.</p></div><span className="admin-badge green">Private S3</span></div>
    {error && <p role="alert" className="admin-message error">{error}</p>}{busy && <p>Loading photos…</p>}
    <div className="admin-photo-grid">{data.items.map((photo) => <figure key={`${photo.inspection_id}-${photo.image_order}`}><a href={`/api/admin/inspection-images/${photo.inspection_id}/${photo.image_order}`} target="_blank" rel="noreferrer"><img loading="lazy" src={`/api/admin/inspection-images/${photo.inspection_id}/${photo.image_order}`} alt={`Crop evidence ${photo.image_order}`} /></a><figcaption><b>{photo.farmer_crop_text || 'Crop not supplied'}</b><br />{new Date(photo.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br />{photo.employee_name || 'Anonymous submission'} · {photo.location_text || 'No location'}<br />{Math.round(photo.byte_size / 1024)} KB · {photo.inspection_id.slice(0, 8)}</figcaption></figure>)}</div>
    {!busy && !data.items.length && <p className="admin-empty">No retained photos on this page.</p>}
    <div className="admin-list-toolbar"><button className="admin-secondary" disabled={!page || busy} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(data.total / 48))}</span><button className="admin-secondary" disabled={(page + 1) * 48 >= data.total || busy} onClick={() => setPage(page + 1)}>Next →</button></div>
  </div>;
}
