import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import AnalyzePage from './pages/AnalyzePage';
import ResultsPage from './pages/ResultsPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/analyze" element={<AnalyzePage />} />
      <Route path="/results/:id" element={<ResultsPage />} />
    </Routes>
  );
}

export default App;
