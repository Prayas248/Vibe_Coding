import { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, FileText, Loader2, ArrowRight, Zap } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import StarMap from '../components/StarMap';
import '../Landing.css';

export default function AnalyzePage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => document.body.classList.remove('landing-page');
  }, []);

  const isValidPDF = (file) => {
    if (!file) return false;
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (isValidPDF(selected)) {
      setFile(selected);
      setError('');
    } else {
      setError('Please upload a valid PDF file.');
    }
    e.target.value = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (isValidPDF(dropped)) {
      setFile(dropped);
      setError('');
    } else {
      setError('Please upload a valid PDF file.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3000/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      const data = await res.json();
      const sessionId = uuidv4();
      sessionStorage.setItem(`vibe_result_${sessionId}`, JSON.stringify({
        ...data,
        fileName: file.name
      }));
      navigate(`/results/${sessionId}`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container min-h-screen">
      <StarMap />
      
      <nav className="landing-nav scrolled">
        <div className="nav-left">
          <Link to="/" className="logo">Vibe</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">submission terminal</span>
        </div>
        <div className="nav-right">
          <Link to="/" className="nav-link">Home</Link>
          <button className="nav-link">Documentation</button>
        </div>
      </nav>

      <div className="flex flex-col items-center justify-center pt-32 px-4 pb-20 max-w-4xl mx-auto text-center relative z-10">
        <div className="animate-in">
          <span className="mono-label text-primary text-xs tracking-widest uppercase mb-4 block">Stage 01: Data Ingestion</span>
          <h1 className="hero-title text-white">
            Submit your <span className="italic serif-text">manuscript.</span>
          </h1>
          <p className="hero-subtitle mono-label max-w-2xl mx-auto opacity-70">
            Vibe processes your research locally before running a semantic vector search across 200M+ academic records.
          </p>
        </div>

        <div className="w-full max-w-2xl mt-12 animate-in delay-200">
          <div 
            className={`relative group transition-all duration-500 rounded-sm border ${
              file ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-primary/30 hover:bg-white/5 cursor-pointer'
            } p-12`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".pdf"
              className="hidden" 
            />

            {/* Terminal Decorations */}
            <div className="absolute top-2 left-2 w-1 h-1 bg-white/20"></div>
            <div className="absolute top-2 right-2 w-1 h-1 bg-white/20"></div>
            <div className="absolute bottom-2 left-2 w-1 h-1 bg-white/20"></div>
            <div className="absolute bottom-2 right-2 w-1 h-1 bg-white/20"></div>
            
            {file ? (
              <div className="space-y-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <FileText className="text-primary" size={24} />
                </div>
                <div>
                  <p className="font-bold text-white tracking-tight">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 mono-label uppercase">READY FOR COMPILATION</p>
                </div>
                <button 
                  className="text-xs text-primary/60 hover:text-primary transition-colors underline mono-label"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  REPLACE FILE
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <UploadCloud className="text-white/40 group-hover:text-primary/60 transition-colors" size={24} />
                </div>
                <div>
                  <p className="text-white tracking-tight font-medium">Click to select PDF or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-2 mono-label">MAX FILE SIZE: 10.00MB</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3 animate-in fade-in">
              <AlertTriangle size={16} className="shrink-0" />
              <p className="mono-label text-left">{error}</p>
            </div>
          )}

          <div className="mt-12 flex flex-col items-center gap-6">
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className={`btn-primary w-full max-w-sm ${(!file || loading) ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  PROCESSING...
                </>
              ) : (
                <>
                  → INITIALIZE ANALYSIS
                </>
              )}
            </button>
            
            <p className="text-[10px] text-muted-foreground mono-label uppercase tracking-widest">
              By submitting, you agree to our processing of academic metadata.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

