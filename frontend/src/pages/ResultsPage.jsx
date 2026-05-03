import { useState } from 'react';
import { Target, Zap, CheckCircle, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';

export default function ResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expandedJournal, setExpandedJournal] = useState(0);

  const rawResult = sessionStorage.getItem(`orbis_result_${id}`);
  const result = rawResult ? JSON.parse(rawResult) : null;

  if (!result || !result.topJournals || !Array.isArray(result.topJournals)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">Session Expired</h2>
          <p className="text-muted-foreground">This session has expired or the link is invalid.</p>
          <Link to="/analyze" className="inline-block mt-4 px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg transition-colors">
            ← Start a new analysis
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <header className="flex justify-between items-center pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">Analysis Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            <FileText size={16} /> {result.fileName || 'document.pdf'}
          </p>
        </div>
        <button 
          onClick={() => navigate('/analyze')}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium text-white"
        >
          Analyze New Paper
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Readiness, Issues, Suggestions */}
        <div className="space-y-8 lg:col-span-1">
          {/* Readiness Score */}
          <div className="glass-card p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Target size={120} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white">
              <Zap className="text-yellow-400" size={20} /> Readiness Score
            </h2>
            
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-white/5 mb-4 group-hover:scale-105 transition-transform duration-500">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle 
                    cx="50%" cy="50%" r="46%" 
                    fill="none" stroke="currentColor" strokeWidth="8"
                    className="text-white/5"
                  />
                  <circle 
                    cx="50%" cy="50%" r="46%" 
                    fill="none" stroke="currentColor" strokeWidth="8"
                    strokeDasharray="289"
                    strokeDashoffset={289 - (289 * (result.readinessScore.overall / 100))}
                    className={`transition-all duration-1000 ease-out ${
                      result.readinessScore.acceptanceLevel === 'High' ? 'text-green-500' :
                      result.readinessScore.acceptanceLevel === 'Medium' ? 'text-yellow-500' : 'text-red-500'
                    }`}
                  />
                </svg>
                <span className="text-4xl font-bold text-white">
                  {result.readinessScore.overall}%
                </span>
              </div>
              
              <span className={`px-4 py-1 rounded-full text-sm font-semibold uppercase tracking-wider mb-6 ${
                result.readinessScore.acceptanceLevel === 'High' ? 'bg-green-500/20 text-green-400 border border-green-500/20' :
                result.readinessScore.acceptanceLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20' : 
                'bg-red-500/20 text-red-400 border border-red-500/20'
              }`}>
                {result.readinessScore.acceptanceLevel} Fit
              </span>

              {/* Factors Breakdown */}
              <div className="w-full space-y-3 pt-6 border-t border-white/10">
                {Object.entries(result.readinessScore.factors).map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="text-white/70">{val}%</span>
                    </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ease-out ${
                            val >= 60 ? 'bg-primary' : val >= 35 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Key Issues */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
              <AlertTriangle size={18} /> Key Issues
            </h2>
            <ul className="space-y-3">
              {result.readinessScore.issues.map((issue, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground bg-white/5 p-3 rounded-lg">
                  <span className="text-red-400 mt-0.5">•</span> {issue}
                </li>
              ))}
            </ul>
          </div>

          {/* Suggestions */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400">
              <CheckCircle size={18} /> Suggestions
            </h2>
            <ul className="space-y-3">
              {result.readinessScore.suggestions.map((suggestion, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground bg-white/5 p-3 rounded-lg">
                  <span className="text-green-400 mt-0.5">→</span> {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Journal Matches */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-semibold mb-2 text-white">Top Journal Matches</h2>
          
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs font-medium bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
              Domain: {result.features?.domain || 'Unknown'}
            </span>
            {result.features?.keywords?.slice(0, 4).map((kw, i) => (
              <span key={i} className="text-xs font-medium bg-white/5 text-white/70 px-3 py-1 rounded-full border border-white/10">
                {kw}
              </span>
            ))}
          </div>

          <div className="space-y-4">
            {result.topJournals.filter(Boolean).map((journal, idx) => (
              <div key={idx} className={`glass-card overflow-hidden transition-all duration-300 ${expandedJournal === idx ? 'ring-1 ring-primary/50' : 'hover:bg-white/10'}`}>
                <div 
                  className="p-5 cursor-pointer flex justify-between items-center"
                  onClick={() => setExpandedJournal(expandedJournal === idx ? -1 : idx)}
                >
                  <div>
                    <h3 className="font-semibold text-lg text-white">{journal.name}</h3>
                    {journal.scope && journal.scope.length < 150 && !journal.scope.startsWith('Academic venue focusing') && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{journal.scope}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-bold text-primary">{Math.round((journal.displayScore || journal.score) * 100)}% Match</div>
                      <div className="text-xs text-muted-foreground mb-3">Hybrid Score</div>
                      
                      {journal.focusScore != null && (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                            journal.focusScore >= 0.75 ? 'bg-primary/10 text-primary border-primary/20' :
                            journal.focusScore >= 0.55 ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {journal.focusScore >= 0.75 ? 'Highly Focused' :
                             journal.focusScore >= 0.55 ? 'Moderately Focused' : 'Broad Scope'}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 italic whitespace-nowrap">
                            {journal.focusScore >= 0.75 ? 'Publishes tightly specialized work' :
                             journal.focusScore >= 0.55 ? 'Balanced scope with clear topical focus' : 'Covers diverse research areas'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 rounded-full bg-white/5 text-white">
                      {expandedJournal === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>
                
                {expandedJournal === idx && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/10 text-sm animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <h4 className="font-medium text-white mb-2">Why it fits</h4>
                        <p className="text-muted-foreground bg-white/5 p-3 rounded-lg">{journal?.explanation?.fitReason ?? 'No explanation available.'}</p>
                      </div>
                      
                      <div className="space-y-4">
                        {journal?.explanation?.risks?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-red-400 mb-2">Potential Risks</h4>
                            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                              {journal.explanation.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                            </ul>
                          </div>
                        )}
                        
                        {journal?.explanation?.suggestions?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-green-400 mb-2">How to improve fit</h4>
                            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                              {journal.explanation.suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
