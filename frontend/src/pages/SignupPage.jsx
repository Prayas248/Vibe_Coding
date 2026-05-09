import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StarMap from '../components/StarMap';
import '../Landing.css';

export default function SignupPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => document.body.classList.remove('landing-page');
  }, []);

  useEffect(() => {
    if (user) navigate('/analyze', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { data, error: err } = await signUp(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data?.session) {
      navigate('/analyze', { replace: true });
    } else {
      setSuccess('Check your inbox to confirm your email, then sign in.');
    }
  };

  return (
    <div className="landing-container min-h-screen">
      <StarMap />
      <nav className="landing-nav scrolled">
        <div className="nav-left">
          <Link to="/" className="logo">Orbis</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">create account</span>
        </div>
        <div className="nav-right">
          <Link to="/" className="nav-link">Home</Link>
        </div>
      </nav>

      <div className="flex flex-col items-center justify-center pt-32 px-4 pb-20 max-w-md mx-auto relative z-10">
        <div className="animate-in w-full">
          <span className="mono-label text-primary text-xs tracking-widest uppercase mb-4 block text-center">
            Stage 00: Provisioning
          </span>
          <h1 className="hero-title text-white text-center">
            Create your <span className="italic serif-text">account.</span>
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full mt-12 space-y-6 animate-in delay-200"
        >
          <div>
            <label className="mono-label text-xs uppercase tracking-widest text-white/60 block mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-primary/50 outline-none rounded-sm px-4 py-3 text-white mono-label text-sm"
              placeholder="researcher@example.com"
            />
          </div>

          <div>
            <label className="mono-label text-xs uppercase tracking-widest text-white/60 block mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-primary/50 outline-none rounded-sm px-4 py-3 text-white mono-label text-sm"
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <div className="p-4 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
              <AlertTriangle size={16} className="shrink-0" />
              <p className="mono-label">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-3">
              <CheckCircle size={16} className="shrink-0" />
              <p className="mono-label">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`btn-primary w-full ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} /> CREATING...
              </>
            ) : (
              <>→ CREATE ACCOUNT</>
            )}
          </button>

          <p className="text-center text-xs mono-label text-white/60">
            Already have one?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
