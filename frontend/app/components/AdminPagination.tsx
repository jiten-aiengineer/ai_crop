'use client';

export type AdminPageSize = 25 | 50 | 100 | 200 | 0;

export function PageSizeControl({ value, onChange, total }: { value: AdminPageSize; onChange: (value: AdminPageSize) => void; total: number }) {
  return <label className="admin-page-size"><span>Show</span><select value={value} onChange={(event) => onChange(Number(event.target.value) as AdminPageSize)}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option><option value={0}>All</option></select><span>entries</span><small>{total.toLocaleString('en-IN')} total</small></label>;
}

export function AdminPager({ page, pageSize, total, shown, onPage, onPageSize }: { page: number; pageSize: AdminPageSize; total: number; shown: number; onPage: (page: number) => void; onPageSize: (value: AdminPageSize) => void }) {
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = total === 0 ? 0 : pageSize === 0 ? 1 : (safePage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : pageSize === 0 ? total : Math.min(total, start + shown - 1);
  return <footer className="admin-pagination"><span>Showing {start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span><PageSizeControl value={pageSize} onChange={onPageSize} total={total}/><div><button disabled={safePage <= 1 || pageSize === 0} onClick={() => onPage(safePage - 1)}>← Previous</button><b>Page {safePage} of {pages}</b><button disabled={safePage >= pages || pageSize === 0} onClick={() => onPage(safePage + 1)}>Next →</button></div></footer>;
}
