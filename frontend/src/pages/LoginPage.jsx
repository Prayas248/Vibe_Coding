import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StarMap from '../components/StarMap';
import '../Landing.css';

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/analyze';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => document.body.classList.remove('landing-page');
  }, []);

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [user, navigate, redirectTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="landing-container min-h-screen">
      <StarMap />
      <nav className="landing-nav scrolled">
        <div className="nav-left">
          <Link to="/" className="logo">Orbis</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">authentication</span>
        </div>
        <div className="nav-right">
          <Link to="/" className="nav-link">Home</Link>
        </div>
      </nav>

      <div className="flex flex-col items-center justify-center pt-32 px-4 pb-20 max-w-md mx-auto relative z-10">
        <div className="animate-in w-full">
          <span className="mono-label text-primary text-xs tracking-widest uppercase mb-4 block text-center">
            Stage 00: Authentication
          </span>
          <h1 className="hero-title text-white text-center">
            Sign in to <span className="italic serif-text">Orbis.</span>
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
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-4 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
              <AlertTriangle size={16} className="shrink-0" />
              <p className="mono-label">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`btn-primary w-full ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} /> SIGNING IN...
              </>
            ) : (
              <>→ SIGN IN</>
            )}
          </button>

          <p className="text-center text-xs mono-label text-white/60">
            No account?{' '}
            <Link to="/signup" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
