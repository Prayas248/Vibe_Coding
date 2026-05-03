import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import StarMap from '../components/StarMap';
import '../Landing.css';

const PipelineCard = ({ number, title, desc, badges }) => {
  const cardRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('visible');
          // Add staggered delay based on number
          entries[0].target.style.transitionDelay = `${number * 60}ms`;
        }
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [number]);

  return (
    <div className="pipeline-card" ref={cardRef}>
      <div className="pipeline-number">{number}</div>
      <div className="pipeline-content">
        <h3 className="serif-text">{title}</h3>
        <p className="mono-label">{desc}</p>
        {badges && (
          <div className="pipeline-badges">
            {badges.map((b, i) => <span key={i} className="badge">{b}</span>)}
          </div>
        )}
      </div>
    </div>
  );
};

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    document.body.classList.add('landing-page');
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.body.classList.remove('landing-page');
    };
  }, []);

  const scrollToPipeline = (e) => {
    e.preventDefault();
    document.getElementById('pipeline').scrollIntoView({ behavior: 'smooth' });
  };

  const domains = [
    { id: 'cs_ai', examples: 'NeurIPS, ICLR, ICML' },
    { id: 'nlp', examples: 'ACL, EMNLP, NAACL' },
    { id: 'neuroscience', examples: 'Nature Neuro, Neuron, J Neurosci' },
    { id: 'biology', examples: 'Cell, PLoS Biology, eLife' },
    { id: 'medicine', examples: 'Lancet, NEJM, JAMA' },
    { id: 'chemistry', examples: 'JACS, Angewandte Chemie' },
    { id: 'physics', examples: 'Physical Review Letters, Nature Physics' },
    { id: 'general_stem', examples: 'Nature, Science, PNAS' }
  ];

  return (
    <div className="landing-container">
      <StarMap />
      
      <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-left">
          <Link to="/" className="logo">Vibe</Link>
          <span className="nav-separator">|</span>
          <span className="nav-tagline">research → venue</span>
        </div>
        <div className="nav-right">
          <button onClick={scrollToPipeline} className="nav-link">How it works</button>
          <Link to="/analyze" className="btn-nav">Try Vibe</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-badge animate-in delay-600">
          Powered by LLaMA 3.3 + OpenAlex
        </div>
        <h1 className="hero-title">
          <span className="muted animate-in">Find where your</span>
          <span className="primary animate-in delay-200">research belongs.</span>
        </h1>
        <p className="hero-subtitle animate-in delay-400 mono-label">
          Upload your abstract. In seconds, Vibe surfaces the journals and conferences most likely to accept your work.
        </p>
        <div className="cta-group animate-in delay-600">
          <Link to="/analyze" className="btn-primary">
            → Analyze Your Paper
          </Link>
          <button onClick={scrollToPipeline} className="btn-ghost" style={{ padding: '0.75rem 2rem' }}>
            ↓ How it works
          </button>
        </div>
      </section>

      <section className="value-prop">
        <div className="value-grid">
          <div className="value-card">
            <h3>&lt; 30s</h3>
            <p>From PDF to ranked venues in under 30 seconds</p>
          </div>
          <div className="value-card">
            <h3>768-dim</h3>
            <p>Semantic vector matching against real published papers</p>
          </div>
          <div className="value-card">
            <h3>Top 5</h3>
            <p>Ranked shortlist with per-journal explanations written by AI</p>
          </div>
        </div>
      </section>

      <section id="pipeline" className="pipeline-section">
        <div className="section-header">
          <h2>How Vibe Thinks</h2>
          <p className="mono-label">A 6-stage analytical pipeline.</p>
        </div>
        <div className="pipeline-grid">
          <PipelineCard 
            number="1" 
            title="PDF Extraction" 
            desc="Your abstract is pulled from the uploaded paper" 
          />
          <PipelineCard 
            number="2" 
            title="Parallel AI Analysis" 
            desc="Features, embeddings, and novelty signals run concurrently" 
            badges={['LLaMA 3.3', 'all-mpnet-base-v2', 'Impact Scorer']}
          />
          <PipelineCard 
            number="3" 
            title="OpenAlex Discovery" 
            desc="Semantic search across millions of real publications" 
            badges={['OpenAlex API']}
          />
          <PipelineCard 
            number="4" 
            title="Elite Venue Injection" 
            desc="Domain-curated journals are blended with dynamic results" 
            badges={['cs_ai', 'nlp', 'neuroscience', 'biology', '...']}
          />
          <PipelineCard 
            number="5" 
            title="Semantic Scoring" 
            desc="Venues ranked by 65% semantic fit + 35% keyword overlap + domain match" 
          />
          <PipelineCard 
            number="6" 
            title="AI Explanations" 
            desc="Each top-5 journal gets a human-readable explanation of why it fits" 
          />
        </div>
      </section>

      <section className="domains-section">
        <h2 className="serif-text" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Built for every corner of STEM</h2>
        <div className="domain-grid">
          {domains.map(d => (
            <div key={d.id} className="domain-chip">
              {d.id}
              <div className="tooltip">{d.examples}</div>
            </div>
          ))}
        </div>
        <p className="domain-desc mono-label">
          Domain-specific blocklists prevent cross-contamination. A biology paper will never see IEEE TPAMI in its results.
        </p>
      </section>

      <section className="formula-section">
        <div className="section-header">
          <h2>The Math Behind the Match</h2>
        </div>
        <div className="code-block">
          <div><span className="code-var">semanticScore</span>  <span className="code-op">=</span> <span className="code-num">0.9</span> <span className="code-op">×</span> venueSimilarity <span className="code-op">+</span> <span className="code-num">0.1</span> <span className="code-op">×</span> consistency</div>
          <div><span className="code-var">rawScore</span>       <span className="code-op">=</span> (<span className="code-num">0.65</span> <span className="code-op">×</span> semantic <span className="code-op">+</span> <span className="code-num">0.35</span> <span className="code-op">×</span> keywords) <span className="code-op">×</span> (<span className="code-num">0.6</span> <span className="code-op">+</span> <span className="code-num">0.4</span> <span className="code-op">×</span> domainMatch)</div>
          <div><span className="code-var">finalScore</span>     <span className="code-op">=</span> <span className="code-num">0.85</span> <span className="code-op">×</span> intermediate <span className="code-op">+</span> <span className="code-num">0.15</span> <span className="code-op">×</span> reputation</div>
          <div><span className="code-var">displayScore</span>   <span className="code-op">=</span> <span className="code-func">min</span>(<span className="code-num">1.0</span>, <span className="code-num">0.45</span> <span className="code-op">+</span> score<span className="code-op">^</span><span className="code-num">0.7</span> <span className="code-op">×</span> <span className="code-num">0.6</span>)</div>
        </div>
        <p className="formula-desc mono-label">
          Vibe weights semantic fit above all else, then tunes for keyword relevance, domain alignment, and journal reputation.
        </p>
      </section>

      <section className="tech-stack">
        <div className="tech-list">
          <span>LLaMA 3.3-70B via Groq</span> &middot; 
          <span>Google Gemini 1.5 Flash</span> &middot; 
          <span>all-mpnet-base-v2</span> &middot; 
          <span>OpenAlex</span> &middot; 
          <span>React + Vite</span> &middot; 
          <span>Node.js + Express</span>
        </div>
        <div className="tech-disclaimer">
          OpenAlex data resets daily. For best results, submit during off-peak hours (after midnight UTC).
        </div>
      </section>

      <footer className="cta-footer">
        <h2>Your research deserves the right audience.</h2>
        <Link to="/analyze" className="btn-primary btn-large">
          → Open Vibe
        </Link>
        <div className="cta-footer-meta">
          <div className="footer-col">
            <span>© 2026 Vibe</span>
            <span>MIT License</span>
          </div>
          <div className="footer-col">
            <span>Powered by open models + open data</span>
            <span>Data via OpenAlex · Resets midnight UTC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
