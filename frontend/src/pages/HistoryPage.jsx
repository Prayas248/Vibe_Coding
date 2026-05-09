import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Trash2,
  Loader2,
  AlertTriangle,
  Search,
  ChevronRight,
} from 'lucide-react';
import StarMap from '../components/StarMap';
import UserMenu from '../components/UserMenu';
import { api } from '../lib/api';
import '../Landing.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => document.body.classList.remove('landing-page');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listHistory()
      .then((data) => {
        if (!cancelled) setItems(data?.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (it) =>
        (it.file_name || '').toLowerCase().includes(q) ||
        (it.domain || '').toLowerCase().includes(q) ||
        (it.top_journal_name || '').toLowerCase().includes(q) ||
        (it.abstract_preview || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this analysis from your history?')) return;
    setDeleting(id);
    try {
      await api.deleteHistoryItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="landing-container min-h-screen">
      <StarMap />
      <nav className="landing-nav scrolled">
        <div className="nav-left">
          <Link to="/" className="logo">Orbis</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">history</span>
        </div>
        <div className="nav-right">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/analyze" className="nav-link">Analyze</Link>
          <UserMenu />
        </div>
      </nav>

      <div className="pt-28 pb-20 px-4 max-w-5xl mx-auto relative z-10">
        <div className="animate-in mb-8">
          <span className="mono-label text-primary text-xs tracking-widest uppercase mb-3 block">
            Archive
          </span>
          <h1 className="hero-title text-white">
            Your <span className="italic serif-text">submission archive.</span>
          </h1>
        </div>

        <div className="relative mb-6">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by filename, domain, or journal..."
            className="w-full bg-white/5 border border-white/10 focus:border-primary/40 outline-none rounded-sm pl-10 pr-4 py-3 text-white mono-label text-sm"
          />
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-white/60 mono-label text-xs uppercase tracking-widest py-12">
            <Loader2 className="animate-spin" size={16} /> Loading archive...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
            <AlertTriangle size={16} className="shrink-0" />
            <p className="mono-label">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="glass-card p-12 text-center">
            <FileText size={36} className="text-primary/60 mx-auto mb-4" />
            <h2 className="text-xl text-white serif-text">
              {items.length === 0 ? 'Archive is empty.' : 'No matches.'}
            </h2>
            <p className="text-white/50 mono-label text-xs mt-2 uppercase tracking-wider">
              {items.length === 0
                ? 'Your analyses will appear here once submitted.'
                : 'Try a different filter.'}
            </p>
            {items.length === 0 && (
              <Link to="/analyze" className="btn-primary mt-6 inline-flex">
                → Analyze a paper
              </Link>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="glass-card p-5 cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all"
                onClick={() => navigate(`/results/${item.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-white">
                      <FileText size={14} className="shrink-0 text-primary/60" />
                      <span className="truncate font-medium">
                        {item.file_name || 'untitled.pdf'}
                      </span>
                    </div>
                    <div className="mono-label text-[10px] uppercase tracking-wider text-white/40 mt-2">
                      {formatDate(item.created_at)}
                      {item.domain && <> · domain: {item.domain}</>}
                    </div>
                    {item.top_journal_name && (
                      <div className="text-sm text-white/70 mt-2">
                        Top match:{' '}
                        <span className="text-primary">{item.top_journal_name}</span>
                      </div>
                    )}
                    {item.abstract_preview && (
                      <p className="text-xs text-white/50 mt-2 line-clamp-2">
                        {item.abstract_preview}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {typeof item.readiness_overall === 'number' && (
                      <span
                        className={`mono-label text-xs font-bold px-2 py-1 rounded-sm border ${
                          item.readiness_overall >= 70
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : item.readiness_overall >= 40
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {item.readiness_overall}%{' '}
                        {item.acceptance_level && `· ${item.acceptance_level}`}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        disabled={deleting === item.id}
                        title="Delete"
                        className="p-1.5 rounded-sm hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                      >
                        {deleting === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                      <ChevronRight size={16} className="text-white/40" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
