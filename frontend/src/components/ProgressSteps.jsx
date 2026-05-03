import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileText, Brain, Search, Database, BarChart3, MessageSquare, Sparkles, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Parsing manuscript', sublabel: 'Extracting text and identifying abstract', icon: FileText },
  { id: 2, label: 'Analyzing research', sublabel: 'Identifying domain, methodology & keywords', icon: Brain },
  { id: 3, label: 'Searching venues', sublabel: 'Scanning 3,000+ academic journals', icon: Search },
  { id: 4, label: 'Enriching candidates', sublabel: 'Fetching publication data from OpenAlex', icon: Database },
  { id: 5, label: 'Computing match scores', sublabel: 'Semantic similarity & domain alignment', icon: BarChart3 },
  { id: 6, label: 'Generating insights', sublabel: 'Crafting detailed match explanations', icon: MessageSquare },
  { id: 7, label: 'Finalizing results', sublabel: 'Preparing your readiness report', icon: Sparkles },
];

export default function ProgressSteps({ sessionId, isActive }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [serverStep, setServerStep] = useState(0);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      setCurrentStep(0);
      setServerStep(0);
    }
  }, [isActive]);

  // Listen to SSE progress events
  useEffect(() => {
    if (!sessionId || !isActive) return;

    const es = new EventSource(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/analyze/progress/${sessionId}`);
    
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setServerStep(data.step);
      } catch (e) { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [sessionId, isActive]);

  // Smooth step progression
  useEffect(() => {
    if (serverStep > currentStep) {
      const timer = setTimeout(() => setCurrentStep(serverStep), 300);
      return () => clearTimeout(timer);
    }
  }, [serverStep, currentStep]);

  // Fallback timer
  useEffect(() => {
    if (!isActive) return;
    
    const stepTimings = [0, 2000, 6000, 8000, 15000, 20000, 25000, 28000];
    const timers = stepTimings.map((delay, i) => {
      if (i === 0) return null;
      return setTimeout(() => {
        setCurrentStep(prev => Math.max(prev, i));
      }, delay);
    });

    return () => timers.forEach(t => t && clearTimeout(t));
  }, [isActive]);

  if (!isActive) return null;

  const completedCount = STEPS.filter(s => currentStep > s.id).length;
  const progressPct = Math.round((completedCount / STEPS.length) * 100);

  return createPortal(
    <div 
      className={`transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        height: '100dvh',
        zIndex: 99999,
        background: '#080a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="w-full max-w-lg px-8 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="text-primary animate-spin" size={16} />
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold tracking-tight">Analyzing your manuscript</h3>
            <p className="text-[10px] text-muted-foreground mono-label uppercase tracking-widest mt-0.5">
              {progressPct}% complete
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary/60 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="w-full max-w-lg px-8 py-6 space-y-0.5">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isComplete = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isPending = currentStep < step.id;

          return (
            <div key={step.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isComplete
                      ? 'bg-primary/20 text-primary'
                      : isCurrent
                      ? 'bg-primary/10 text-primary ring-2 ring-primary/30'
                      : 'bg-white/[0.03] text-white/15'
                  }`}
                >
                  {isComplete ? (
                    <Check size={12} strokeWidth={3} />
                  ) : isCurrent ? (
                    <StepIcon size={12} className="animate-pulse" />
                  ) : (
                    <StepIcon size={12} />
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-px h-5 transition-all duration-500 ${
                      isComplete ? 'bg-primary/20' : 'bg-white/[0.03]'
                    }`}
                  />
                )}
              </div>

              <div className={`pt-1 transition-all duration-500 ${isPending ? 'opacity-20' : 'opacity-100'}`}>
                <p
                  className={`text-[11px] font-medium tracking-wide uppercase ${
                    isCurrent ? 'text-primary' : isComplete ? 'text-white/60' : 'text-white/20'
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 mono-label">
                    {step.sublabel}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="w-full max-w-lg px-8 pt-2">
        <p className="text-[9px] text-white/20 mono-label uppercase tracking-widest text-center">
          Powered by sentence-BERT + OpenAlex
        </p>
      </div>
    </div>,
    document.body
  );
}
