import { createRoot } from 'react-dom/client';
import ComparisonDashboard from '../app/components/ComparisonDashboard';

createRoot(document.getElementById('root')!).render(<ComparisonDashboard localMode initialLab />);
