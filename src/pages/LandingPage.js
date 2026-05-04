/**
 * Landing Page Component
 * 
 * Public-facing landing page that introduces the SpikeScope
 * with a hero section, features overview, and a CTA to get started.
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LandingPage.css';

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  const canvasRef = useRef(null);
  const teamMembers = [
  { name: 'Abdulrahman Mahmoud', affiliation: 'MBZUAI', role: 'Assistant Professor of Computer Science', image: 'images/Abdulrahman_inner.png', link: 'https://ma3mool.github.io/' },
  { name: 'Elizabeth Churchill', affiliation: 'MBZUAI', role: 'Department Chair and Professor of Human-Computer Interaction' , image: 'images/images (1).png',link: 'https://elizabethchurchill.com/'  },
    { name: 'Olivier Oullier', affiliation: 'MBZUAI', role: 'Visiting Professor of Practice, Human-Computer Interaction', image: 'images/Olivier_Website-1.jpg',link: 'https://mbzuai.ac.ae/study/faculty/olivier-oullier/'  },
  { name: 'James Smith', affiliation: 'University of Wisconsin', role: 'Professor Emeritus', image: 'images/James_E_Smith.jpg',link: 'https://directory.engr.wisc.edu/ece/faculty/smith_james/'  },
  { name: 'Abhishek Bhattachargee', affiliation: 'Princeton', role: 'Professor of Computer Science', image: 'images/citations.jpg',link: 'https://www.cs.yale.edu/homes/abhishek/' },
  { name: 'Raghavendra Pradyumna Pothukuchi', affiliation: 'UNC', role: 'Assistant Professor', image: 'images/Pothukuchi.jpg',link: 'https://www.cs.unc.edu/~raghav/'  },
  { name: 'Luciano Dyballa', affiliation: 'IE University', role: 'Assistant Professor', image: 'images/prof-luciano-dyballa_1.png',link: 'https://www.ie.edu/university/about/faculty/luciano-dyballa/'  },
  { name: 'Dongning Ma', affiliation: 'MBZUAI', role: 'Postdoctoral Associate', image: 'images/profile.png',link: 'https://dongning-ma.github.io/'  },
  { name: 'Juwayni Macadato Lucman', affiliation: 'MBZUAI', role: 'Phd Student', image: 'images/juwayni.jpeg' },
  { name: 'Mohamed Aziz Benzarti', affiliation: 'MBZUAI', role: 'Research Engineer' , image: 'images/1758875142554.jpg'},
  
  { name: 'Mohamed Elzeftawy', affiliation: 'MBZUAI', role: 'MSc Student', image: 'images/zeftawy.jpeg' },
  { name: 'Dastan Bekmukhanbetov', affiliation: 'MBZUAI', role: 'MSc Student' , image: 'images/dastan.jpg'},
];

const getInitials = (name) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  // Animated neural network background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;
    let particles = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.radius = Math.random() * 2 + 1;
        this.opacity = Math.random() * 0.5 + 0.2;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(64, 224, 208, ${this.opacity})`;
        ctx.fill();
      }
    }

    const init = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 12000);
      for (let i = 0; i < count; i++) {
        particles.push(new Particle());
      }
    };

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(64, 224, 208, ${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      drawConnections();
      animationId = requestAnimationFrame(animate);
    };

    resize();
    init();
    animate();
    window.addEventListener('resize', () => {
      resize();
      init();
    });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="landing">
      <canvas ref={canvasRef} className="landing-canvas" />

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <div className="landing-nav-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#bolt-grad)" />
              <defs>
                <linearGradient id="bolt-grad" x1="3" y1="2" x2="21" y2="22">
                  <stop stopColor="#40e0d0" />
                  <stop offset="1" stopColor="#0d9488" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="landing-nav-title">SpikeScope</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features" className="landing-nav-link">Features</a>
          <a href="#workflow" className="landing-nav-link">Workflow</a>
          <a href="#about" className="landing-nav-link">About</a>
          <a href="#team" className="landing-nav-link">Team</a>
          {isAuthenticated ? (
  <Link to="/dashboard" className="landing-nav-cta">
    Go to Dashboard
  </Link>
) : (
  <div className="landing-nav-actions">
    <Link to="/demo" className="landing-nav-cta">
      Try Demo
    </Link>
    <Link to="/login" className="landing-nav-cta">
      Sign In
    </Link>
  </div>
)}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">Neural Data Analysis Platform</div>
          <h1 className="landing-hero-title">
            Visualize & Sort
            <br />
            <span className="landing-hero-gradient">Neural Spikes</span>
          </h1>
          <p className="landing-hero-description">
            A powerful, interactive dashboard for exploring extracellular neural recordings.
            Detect spikes, run clustering algorithms, and analyze waveforms — all in one place.
          </p>
          <div className="landing-hero-actions">
            <Link
              to={'/demo'}
              className="landing-btn-primary"
            >
              <span>Try It Now</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <a href="#features" className="landing-btn-secondary">
              Learn More
            </a>
          </div>
        </div>

        {/* Hero visuals — Signal View + Cluster View */}
        <div className="landing-hero-visual">
          {/* Signal View Card */}
          <div className="landing-waveform-card">
            <div className="landing-waveform-header">
              <div className="landing-waveform-dots">
                <span /><span /><span />
              </div>
              <span className="landing-waveform-title">Signal View</span>
            </div>
            <svg className="landing-waveform-svg" viewBox="0 0 600 125">
              <defs>
                <linearGradient id="wave-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(64, 224, 208, 0.3)" />
                  <stop offset="100%" stopColor="rgba(64, 224, 208, 0)" />
                </linearGradient>
              </defs>
              {/* Baseline */}
              <line x1="0" y1="65" x2="600" y2="65" stroke="rgba(64, 224, 208, 0.1)" strokeWidth="1" />
              {/* Waveform path */}
              <path
                className="landing-waveform-path"
                d="M0,65 Q20,65 40,63 T80,65 T120,61 T140,65 T160,65 
                   Q170,65 175,42 L180,15 Q182,8 185,22 L190,58 Q195,72 200,68 T220,65 
                   T260,65 T300,63 T320,65 T340,65
                   Q350,65 355,40 L360,12 Q362,5 365,25 L370,60 Q375,74 380,67 T400,65
                   T440,65 T480,62 T500,65 T520,65
                   Q530,65 535,44 L540,18 Q542,10 545,28 L550,56 Q555,70 560,66 T580,65 T600,65"
                fill="none"
                stroke="#40e0d0"
                strokeWidth="2"
              />
              {/* Area fill */}
              <path
                className="landing-waveform-area"
                d="M0,65 Q20,65 40,63 T80,65 T120,61 T140,65 T160,65 
                   Q170,65 175,42 L180,15 Q182,8 185,22 L190,58 Q195,72 200,68 T220,65 
                   T260,65 T300,63 T320,65 T340,65
                   Q350,65 355,40 L360,12 Q362,5 365,25 L370,60 Q375,74 380,67 T400,65
                   T440,65 T480,62 T500,65 T520,65
                   Q530,65 535,44 L540,18 Q542,10 545,28 L550,56 Q555,70 560,66 T580,65 T600,65
                   L600,125 L0,125 Z"
                fill="url(#wave-grad)"
              />
              {/* Spike markers */}
              <circle cx="180" cy="15" r="4" fill="#ff6b6b" className="landing-spike-dot" />
              <circle cx="360" cy="12" r="4" fill="#ff6b6b" className="landing-spike-dot" />
              <circle cx="540" cy="18" r="4" fill="#ff6b6b" className="landing-spike-dot" />
              {/* Threshold line */}
              <line x1="0" y1="32" x2="600" y2="32" stroke="rgba(255,107,107,0.4)" strokeWidth="1" strokeDasharray="6 4" />
              <text x="8" y="28" fill="rgba(255,107,107,0.6)" fontSize="10" fontFamily="monospace">threshold</text>
            </svg>
          </div>

          {/* Cluster View Card */}
          <div className="landing-cluster-card">
            <div className="landing-waveform-header">
              <div className="landing-waveform-dots">
                <span /><span /><span />
              </div>
              <span className="landing-waveform-title">Cluster View</span>
            </div>
            <svg className="landing-cluster-svg" viewBox="0 0 500 120">
              <defs>
                <radialGradient id="cluster-glow-1" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(64, 224, 208, 0.15)" />
                  <stop offset="100%" stopColor="rgba(64, 224, 208, 0)" />
                </radialGradient>
                <radialGradient id="cluster-glow-2" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(139, 92, 246, 0.15)" />
                  <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
                </radialGradient>
                <radialGradient id="cluster-glow-3" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(251, 191, 36, 0.15)" />
                  <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
                </radialGradient>
              </defs>
              {/* Grid lines */}
              <line x1="20" y1="5" x2="20" y2="100" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="120" y1="5" x2="120" y2="100" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="220" y1="5" x2="220" y2="100" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="320" y1="5" x2="320" y2="100" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="420" y1="5" x2="420" y2="100" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="20" y1="25" x2="480" y2="25" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="20" y1="55" x2="480" y2="55" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              <line x1="20" y1="85" x2="480" y2="85" stroke="rgba(224,230,237,0.06)" strokeWidth="0.5" />
              {/* Cluster glows */}
              <circle cx="100" cy="50" r="35" fill="url(#cluster-glow-1)" />
              <circle cx="300" cy="55" r="38" fill="url(#cluster-glow-2)" />
              <circle cx="430" cy="45" r="32" fill="url(#cluster-glow-3)" />
              {/* Cluster 1 — teal */}
              <circle cx="82" cy="40" r="3.5" fill="#40e0d0" opacity="0.8" className="landing-cluster-dot landing-cd-1" />
              <circle cx="100" cy="35" r="3.5" fill="#40e0d0" opacity="0.7" className="landing-cluster-dot landing-cd-2" />
              <circle cx="90" cy="52" r="3.5" fill="#40e0d0" opacity="0.9" className="landing-cluster-dot landing-cd-3" />
              <circle cx="110" cy="48" r="3.5" fill="#40e0d0" opacity="0.6" className="landing-cluster-dot landing-cd-4" />
              <circle cx="95" cy="62" r="3.5" fill="#40e0d0" opacity="0.8" className="landing-cluster-dot landing-cd-5" />
              <circle cx="78" cy="55" r="3.5" fill="#40e0d0" opacity="0.7" className="landing-cluster-dot landing-cd-1" />
              <circle cx="105" cy="58" r="3" fill="#40e0d0" opacity="0.65" className="landing-cluster-dot landing-cd-3" />
              <circle cx="88" cy="44" r="3" fill="#40e0d0" opacity="0.75" className="landing-cluster-dot landing-cd-2" />
              <circle cx="115" cy="42" r="3" fill="#40e0d0" opacity="0.55" className="landing-cluster-dot landing-cd-4" />
              <circle cx="98" cy="30" r="3" fill="#40e0d0" opacity="0.65" className="landing-cluster-dot landing-cd-5" />
              {/* Cluster 2 — purple */}
              <circle cx="285" cy="45" r="3.5" fill="#8b5cf6" opacity="0.8" className="landing-cluster-dot landing-cd-2" />
              <circle cx="305" cy="40" r="3.5" fill="#8b5cf6" opacity="0.7" className="landing-cluster-dot landing-cd-3" />
              <circle cx="290" cy="60" r="3.5" fill="#8b5cf6" opacity="0.9" className="landing-cluster-dot landing-cd-4" />
              <circle cx="315" cy="55" r="3.5" fill="#8b5cf6" opacity="0.6" className="landing-cluster-dot landing-cd-5" />
              <circle cx="298" cy="68" r="3.5" fill="#8b5cf6" opacity="0.8" className="landing-cluster-dot landing-cd-1" />
              <circle cx="278" cy="52" r="3.5" fill="#8b5cf6" opacity="0.7" className="landing-cluster-dot landing-cd-2" />
              <circle cx="310" cy="62" r="3" fill="#8b5cf6" opacity="0.65" className="landing-cluster-dot landing-cd-4" />
              <circle cx="320" cy="48" r="3" fill="#8b5cf6" opacity="0.75" className="landing-cluster-dot landing-cd-3" />
              <circle cx="288" cy="72" r="3" fill="#8b5cf6" opacity="0.55" className="landing-cluster-dot landing-cd-5" />
              <circle cx="302" cy="35" r="3" fill="#8b5cf6" opacity="0.65" className="landing-cluster-dot landing-cd-1" />
              {/* Cluster 3 — amber */}
              <circle cx="418" cy="38" r="3.5" fill="#fbbf24" opacity="0.8" className="landing-cluster-dot landing-cd-3" />
              <circle cx="435" cy="45" r="3.5" fill="#fbbf24" opacity="0.7" className="landing-cluster-dot landing-cd-4" />
              <circle cx="425" cy="30" r="3.5" fill="#fbbf24" opacity="0.9" className="landing-cluster-dot landing-cd-5" />
              <circle cx="445" cy="40" r="3.5" fill="#fbbf24" opacity="0.6" className="landing-cluster-dot landing-cd-1" />
              <circle cx="412" cy="50" r="3.5" fill="#fbbf24" opacity="0.8" className="landing-cluster-dot landing-cd-2" />
              <circle cx="450" cy="34" r="3" fill="#fbbf24" opacity="0.7" className="landing-cluster-dot landing-cd-3" />
              <circle cx="422" cy="55" r="3" fill="#fbbf24" opacity="0.65" className="landing-cluster-dot landing-cd-5" />
              <circle cx="440" cy="28" r="3" fill="#fbbf24" opacity="0.55" className="landing-cluster-dot landing-cd-4" />
              {/* Legend */}
              <circle cx="145" cy="108" r="4" fill="#40e0d0" />
              <text x="153" y="111" fill="rgba(224,230,237,0.5)" fontSize="9" fontFamily="monospace">Cluster 1</text>
              <circle cx="230" cy="108" r="4" fill="#8b5cf6" />
              <text x="238" y="111" fill="rgba(224,230,237,0.5)" fontSize="9" fontFamily="monospace">Cluster 2</text>
              <circle cx="320" cy="108" r="4" fill="#fbbf24" />
              <text x="328" y="111" fill="rgba(224,230,237,0.5)" fontSize="9" fontFamily="monospace">Cluster 3</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-features">
        <div className="landing-section-header">
          <span className="landing-section-tag">Features</span>
          <h2 className="landing-section-title">Everything You Need for Spike Analysis</h2>
          <p className="landing-section-subtitle">
            From raw signal exploration to automated spike sorting — all the tools a neuroscientist needs.
          </p>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3>Signal Visualization</h3>
            <p>Explore raw, filtered, and spike-detected signals across hundreds of channels with interactive zoom and pan.</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="19" r="2" />
                <circle cx="19" cy="19" r="2" />
                <line x1="14.5" y1="10" x2="17.5" y2="6.5" />
                <line x1="9.5" y1="14" x2="6.5" y2="17.5" />
                <line x1="14.5" y1="14" x2="17.5" y2="17.5" />
              </svg>
            </div>
            <h3>Spike Sorting</h3>
            <p>Run clustering algorithms like Kilosort and custom methods to automatically classify detected spikes into distinct neural units.</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <h3>Multi-Panel View</h3>
            <p>Arrange and customize multiple analysis panels side-by-side with a flexible dockable widget system.</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h3>Cluster Analysis</h3>
            <p>Visualize clusters with dimensionality reduction, inspect waveform shapes, and navigate individual spikes on the timeline.</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3>Dataset Management</h3>
            <p>Upload, switch, and manage multiple neural recording datasets with support for PyTorch tensor and memory-mapped formats.</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" />
                <line x1="18" y1="20" x2="18" y2="4" />
                <line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <h3>Runtime Analytics</h3>
            <p>Track and compare algorithm performance metrics to optimize your spike sorting pipeline and benchmark results.</p>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="landing-workflow">
        <div className="landing-section-header">
          <span className="landing-section-tag">Workflow</span>
          <h2 className="landing-section-title">From Raw Data to Sorted Spikes</h2>
          <p className="landing-section-subtitle">
            A streamlined three-step workflow to go from neural recordings to classified units.
          </p>
        </div>

        <div className="landing-workflow-steps">
          <div className="landing-workflow-step">
            <div className="landing-step-number">01</div>
            <div className="landing-step-content">
              <h3>Upload & Explore</h3>
              <p>Import your neural recording datasets and visually explore raw signals, apply filters, and set detection thresholds interactively.</p>
            </div>
          </div>
          <div className="landing-workflow-connector" />
          <div className="landing-workflow-step">
            <div className="landing-step-number">02</div>
            <div className="landing-step-content">
              <h3>Detect & Cluster</h3>
              <p>Run spike sorting algorithms with customizable parameters. View results as 2D/3D cluster plots and inspect each unit's waveform.</p>
            </div>
          </div>
          <div className="landing-workflow-connector" />
          <div className="landing-workflow-step">
            <div className="landing-step-number">03</div>
            <div className="landing-step-content">
              <h3>Analyze & Compare</h3>
              <p>Dive into cluster statistics, compare algorithm results, and navigate directly to individual spikes on the original timeline.</p>
            </div>
          </div>
        </div>
      </section>
<section id="team" className="team-section">
  <div className="team-container">
    <div className="team-header">
      <span className="team-eyebrow">Our Team</span>
      <h2>Meet the Team</h2>
      <p>
        SpikeScope is being developed through a collaborative effort across
        institutions, combining expertise in neuroscience, spike sorting,
        machine learning, and systems engineering.
      </p>
    </div>

    <div className="team-grid">
  {teamMembers.map((member, index) => (
    <div key={index} className="team-card">
      <div className="team-card-image">
        {member.image ? (
          <img src={member.image} alt={member.name} className="team-avatar-image" />
        ) : (
          <div className="team-avatar-fallback">
            {getInitials(member.name)}
          </div>
        )}
      </div>

      <div className="team-card-body">
        <h3>
          <a
            href={member.link}
            target="_blank"
            rel="noopener noreferrer"
            className="team-name-link"
          >
            {member.name}
          </a>
        </h3>
        <p className="team-role">{member.role}</p>
        <p className="team-affiliation">{member.affiliation}</p>
      </div>
    </div>
  ))}
</div>
  </div>
</section>
      {/* About / CTA Section */}
      <section id="about" className="landing-about">
        <div className="landing-about-card">
          <h2>Ready to Explore Your Neural Data?</h2>
          <p>
            SpikeScope is built for neuroscientists and engineers who need a modern, 
            web-based tool for extracellular spike analysis. Whether you're running Kilosort, 
            custom clustering, or just exploring raw waveforms — this platform has you covered.
          </p>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="landing-btn-primary landing-btn-large"
          >
            <span>Try SpikeScope</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#40e0d0" />
            </svg>
            <span>SpikeScope</span>
          </div>
          <p className="landing-footer-copy">&copy; {new Date().getFullYear()} SpikeScope. Built for neural signal analysis.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
