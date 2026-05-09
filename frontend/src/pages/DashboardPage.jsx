import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  TrendingUp,
  FileText,
  Target,
  Sparkles,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import StarMap from '../components/StarMap';
import UserMenu from '../components/UserMenu';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import '../Landing.css';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 text-white/50 mono-label text-[10px] uppercase tracking-widest">
        <Icon size={12} /> {label}
      </div>
      <div className="text-3xl font-bold text-white mt-3 serif-text">{value}</div>
      {sub && <div className="text-xs text-white/40 mono-label mt-1">{sub}</div>}
    </div>
  );
}

function Sparkline({ points }) {
  if (!points.length) {
    return (
      <div className="text-white/30 text-xs mono-label py-8 text-center">
        Need at least one analysis to see a trend.
      </div>
    );
  }
  const w = 600;
  const h = 120;
  const padding = 8;
  const xs = points.map((_, i) => (points.length === 1 ? w / 2 : padding + (i * (w - 2 * padding)) / (points.length - 1)));
  const ys = points.map((p) => h - padding - (p / 100) * (h - 2 * padding));
  const path = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(' ');
  const area = `${path} L ${xs[xs.length - 1].toFixed(1)} ${h - padding} L ${xs[0].toFixed(1)} ${h - padding} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
      <defs>
        <linearGradient id="spark-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-grad)" />
      <path d={path} fill="none" stroke="rgb(34, 197, 94)" strokeWidth="2" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="3" fill="rgb(34, 197, 94)" />
      ))}
    </svg>
  );
}

function DomainBars({ items }) {
  if (!items.length) {
    return <div className="text-white/30 text-xs mono-label">No data yet.</div>;
  }
  const max = Math.max(...items.map((i) => i.count));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.domain}>
          <div className="flex justify-between mono-label text-[10px] uppercase tracking-wider mb-1">
            <span className="text-white/70">{item.domain}</span>
            <span className="text-white/40">{item.count}</span>
          </div>
          <div className="h-2 bg-white/5 rounded-sm overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AcceptanceDistribution({ counts }) {
  const total = counts.High + counts.Medium + counts.Low;
  if (!total) return <div className="text-white/30 text-xs mono-label">No data yet.</div>;
  const segments = [
    { key: 'High', value: counts.High, color: 'bg-emerald-500' },
    { key: 'Medium', value: counts.Medium, color: 'bg-yellow-500' },
    { key: 'Low', value: counts.Low, color: 'bg-red-500' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-sm overflow-hidden">
        {segments.map((s) =>
          s.value ? (
            <div
              key={s.key}
              className={`${s.color} transition-all duration-500`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.key}: ${s.value}`}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {segments.map((s) => (
          <div key={s.key}>
            <div className="text-2xl font-bold text-white serif-text">{s.value}</div>
            <div className="mono-label text-[10px] uppercase tracking-wider text-white/50 mt-1">
              {s.key} fit
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        if (!cancelled) setError(err.message || 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!items.length) {
      return {
        total: 0,
        thisMonth: 0,
        avgReadiness: null,
        topDomain: '—',
      };
    }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = items.filter(
      (it) => new Date(it.created_at) >= monthStart
    ).length;
    const readinessVals = items
      .map((it) => it.readiness_overall)
      .filter((v) => typeof v === 'number');
    const avgReadiness = readinessVals.length
      ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length)
      : null;

    const domainCounts = {};
    for (const it of items) {
      if (it.domain) domainCounts[it.domain] = (domainCounts[it.domain] || 0) + 1;
    }
    const topDomain =
      Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return {
      total: items.length,
      thisMonth,
      avgReadiness,
      topDomain,
    };
  }, [items]);

  const trendPoints = useMemo(() => {
    return [...items]
      .reverse()
      .map((it) => it.readiness_overall)
      .filter((v) => typeof v === 'number');
  }, [items]);

  const domainBars = useMemo(() => {
    const map = {};
    for (const it of items) {
      const d = it.domain || 'unknown';
      map[d] = (map[d] || 0) + 1;
    }
    return Object.entries(map)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [items]);

  const acceptanceCounts = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0 };
    for (const it of items) {
      if (it.acceptance_level && c[it.acceptance_level] != null) {
        c[it.acceptance_level] += 1;
      }
    }
    return c;
  }, [items]);

  const topJournalsLeaderboard = useMemo(() => {
    const map = {};
    for (const it of items) {
      if (it.top_journal_name) {
        map[it.top_journal_name] = (map[it.top_journal_name] || 0) + 1;
      }
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [items]);

  const recent = items.slice(0, 6);

  return (
    <div className="landing-container min-h-screen">
      <StarMap />
      <nav className="landing-nav scrolled">
        <div className="nav-left">
          <Link to="/" className="logo">Orbis</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">dashboard</span>
        </div>
        <div className="nav-right">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/analyze" className="nav-link">Analyze</Link>
          <Link to="/history" className="nav-link">History</Link>
          <UserMenu />
        </div>
      </nav>

      <div className="pt-28 pb-20 px-4 max-w-6xl mx-auto relative z-10">
        <div className="animate-in mb-10">
          <span className="mono-label text-primary text-xs tracking-widest uppercase mb-3 block">
            Stage ∞: Operations Center
          </span>
          <h1 className="hero-title text-white">
            Welcome back, <span className="italic serif-text">researcher.</span>
          </h1>
          <p className="hero-subtitle mono-label opacity-70 mt-4">
            Signed in as {user?.email}
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-white/60 mono-label text-xs uppercase tracking-widest py-12">
            <Loader2 className="animate-spin" size={16} /> Loading your activity...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3 mb-8">
            <AlertTriangle size={16} className="shrink-0" />
            <p className="mono-label">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={FileText}
                label="Total analyses"
                value={stats.total}
                sub="papers submitted"
              />
              <StatCard
                icon={Calendar}
                label="This month"
                value={stats.thisMonth}
                sub="runs in current month"
              />
              <StatCard
                icon={Target}
                label="Avg readiness"
                value={stats.avgReadiness != null ? `${stats.avgReadiness}%` : '—'}
                sub="across all submissions"
              />
              <StatCard
                icon={Sparkles}
                label="Top domain"
                value={stats.topDomain}
                sub="most frequent area"
              />
            </div>

            {items.length === 0 ? (
              <div className="glass-card p-12 text-center space-y-6">
                <Activity size={36} className="text-primary/60 mx-auto" />
                <div>
                  <h2 className="text-xl text-white serif-text">No analyses yet.</h2>
                  <p className="text-white/50 mono-label text-xs mt-2 uppercase tracking-wider">
                    Submit your first manuscript to populate this dashboard.
                  </p>
                </div>
                <Link to="/analyze" className="btn-primary inline-flex">
                  → Start your first analysis
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  <div className="glass-card p-6 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg text-white flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-400" />
                        Readiness over time
                      </h2>
                      <span className="mono-label text-[10px] uppercase tracking-widest text-white/40">
                        oldest → newest
                      </span>
                    </div>
                    <Sparkline points={trendPoints} />
                  </div>

                  <div className="glass-card p-6">
                    <h2 className="text-lg text-white mb-4">Acceptance distribution</h2>
                    <AcceptanceDistribution counts={acceptanceCounts} />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="glass-card p-6">
                    <h2 className="text-lg text-white mb-4">Top domains</h2>
                    <DomainBars items={domainBars} />
                  </div>

                  <div className="glass-card p-6">
                    <h2 className="text-lg text-white mb-4">Most-matched journals</h2>
                    {topJournalsLeaderboard.length === 0 ? (
                      <div className="text-white/30 text-xs mono-label">No data yet.</div>
                    ) : (
                      <ul className="space-y-3">
                        {topJournalsLeaderboard.map((j, idx) => (
                          <li
                            key={j.name}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="mono-label text-[10px] text-white/40 w-4">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span className="text-white/80 truncate">{j.name}</span>
                            </div>
                            <span className="mono-label text-xs text-primary">
                              ×{j.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg text-white">Recent activity</h2>
                    <Link to="/history" className="nav-link text-xs flex items-center gap-1">
                      View all <ChevronRight size={14} />
                    </Link>
                  </div>
                  <ul className="divide-y divide-white/5">
                    {recent.map((item) => (
                      <li
                        key={item.id}
                        className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/5 px-3 rounded-sm transition-colors"
                        onClick={() => navigate(`/results/${item.id}`)}
                      >
                        <div className="min-w-0">
                          <div className="text-white truncate">
                            {item.file_name || 'untitled.pdf'}
                          </div>
                          <div className="mono-label text-[10px] uppercase tracking-wider text-white/40 mt-1">
                            {item.domain || 'unknown'} · {timeAgo(item.created_at)} ·{' '}
                            {formatDate(item.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {typeof item.readiness_overall === 'number' && (
                            <span
                              className={`mono-label text-xs font-bold ${
                                item.readiness_overall >= 70
                                  ? 'text-emerald-400'
                                  : item.readiness_overall >= 40
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {item.readiness_overall}%
                            </span>
                          )}
                          <ChevronRight size={16} className="text-white/40" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
