import ComparisonDashboard from '../../components/ComparisonDashboard';
export const metadata = {title:'AI Comparison | Crop Life AI',robots:{index:false,follow:false}};

export const dynamic = 'force-dynamic';
export default function Page() {
  const configured = (process.env.COMPARISON_ADMIN_TOKEN || '').length >= 32 && Boolean(process.env.COMPARISON_SERVICE_URL) && (process.env.COMPARISON_SERVICE_TOKEN || '').length >= 32;
  return <ComparisonDashboard configured={configured} />;
}
