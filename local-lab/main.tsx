import { createRoot } from 'react-dom/client';
import ComparisonDashboard from '../frontend/app/components/ComparisonDashboard';

createRoot(document.getElementById('root')!).render(<ComparisonDashboard localMode initialLab />);
