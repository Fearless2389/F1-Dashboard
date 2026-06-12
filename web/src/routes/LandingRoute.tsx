import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { ArrowRight, BarChart3, Cpu, Github, MonitorPlay, Trophy } from "lucide-react";

import { Button } from "@/components/ui/Button";

/**
 * Public landing page at `/`.
 *
 * Replaced the old "/" → "/live" redirect with a real marketing-style
 * surface so a hiring manager who lands on the URL can answer two
 * questions in 5 seconds: "what is this?" and "what's the most
 * impressive thing to click?".
 *
 * Structure:
 *   1. Hero: italic Playfair brand + one-line tagline + two CTAs.
 *   2. 3-pillar feature grid: Predict / Replay / Analyse.
 *   3. Tech-stack pill row — answers "what's it built with?" without
 *      needing the visitor to read the README.
 *   4. Footer strip with the GitHub link + cost-credit ("Live on free
 *      Vercel + Hugging Face Spaces").
 */
export default function LandingRoute() {
  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] bg-paddock-dark text-f1-white relative overflow-hidden f1-grid-bg">
      <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-24">
        {/* ── HERO ──────────────────────────────────────────────────── */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="text-[11px] uppercase tracking-widest text-paddock-coral font-semibold mb-4">
            Formula 1 · Machine learning · Real-time replay
          </div>
          <h1 className="font-display font-black italic text-5xl md:text-7xl leading-[0.95] tracking-tight">
            <span className="text-f1-white">Paddock</span>{" "}
            <span className="text-paddock-coral">Dashboard</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-f1-muted max-w-2xl leading-relaxed">
            Six trained ML models, a 10,000-iteration Monte Carlo race simulator, and a real-time
            telemetry replay of every 2025–2026 race — all wired into one dashboard. Predicts who
            wins, who's on the podium, and where every driver finishes; then lets you press play
            and watch how it actually went.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link to="/dashboard">
              <Button size="lg" variant="primary">
                Open dashboard <ArrowRight size={16} />
              </Button>
            </Link>
            <a
              href="https://github.com/Fearless2389/F1-Dashboard"
              target="_blank"
              rel="noreferrer"
            >
              <Button size="lg" variant="secondary">
                <Github size={16} /> Read the code
              </Button>
            </a>
          </div>
        </m.div>

        {/* ── 3-PILLAR FEATURE GRID ─────────────────────────────────── */}
        <div className="mt-20 md:mt-28 grid gap-4 grid-cols-1 md:grid-cols-3">
          <FeatureCard
            href="/apex"
            icon={<Trophy size={20} className="text-paddock-coral" />}
            kicker="Predict"
            title="Who wins the next race"
            body="Predicted winner, podium tiles, P4–P10 finish table, SHAP-templated reasoning for every podium pick, and a 22-driver probability matrix from 10K Monte Carlo simulations."
            delay={0.1}
          />
          <FeatureCard
            href="/live"
            icon={<MonitorPlay size={20} className="text-paddock-cream" />}
            kicker="Replay"
            title="Watch the race unfold"
            body="Track-map dot animation for every driver, live timing tower with compounds + tyre age, overtake feed that streams as the playhead crosses each move, and per-driver telemetry traces (speed, throttle, brake, gear)."
            delay={0.18}
          />
          <FeatureCard
            href="/standings"
            icon={<BarChart3 size={20} className="text-paddock-coral" />}
            kicker="Analyse"
            title="Championship at any round"
            body="Drivers + constructors standings with a round selector (verify HAM = VER = 369.5 going into Abu Dhabi 2021), cumulative-points progression chart, and per-driver season comparison."
            delay={0.26}
          />
        </div>

        {/* ── TECH STACK PILLS ──────────────────────────────────────── */}
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-20 md:mt-28"
        >
          <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold mb-4 text-center">
            Built with
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
            {STACK.map(s => (
              <span
                key={s}
                className="text-xs px-3 py-1.5 rounded-full border border-f1-edge bg-f1-panel/40 text-f1-muted hover:text-f1-white hover:border-paddock-coral/40 transition-colors"
              >
                {s}
              </span>
            ))}
          </div>
        </m.div>

        {/* ── PROOF STRIP ───────────────────────────────────────────── */}
        <div className="mt-20 md:mt-28 grid gap-4 grid-cols-2 md:grid-cols-4 text-center">
          <Stat n="6"      label="trained ML models" />
          <Stat n="160K+"  label="historical race rows" />
          <Stat n="29"     label="replayable 2025–26 races" />
          <Stat n="$0/mo"  label="deploy cost" hint="Vercel + HF Spaces" />
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────── */}
        <div className="mt-20 md:mt-28 pt-8 border-t border-f1-edge flex flex-wrap items-center justify-between gap-4 text-xs text-f1-muted">
          <div className="flex items-center gap-2">
            <Cpu size={12} />
            <span>FastAPI backend on Hugging Face Spaces · React + Vite frontend on Vercel</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-f1-white transition-colors">
              How it works
            </Link>
            <a
              href="https://github.com/Fearless2389/F1-Dashboard"
              target="_blank"
              rel="noreferrer"
              className="hover:text-f1-white transition-colors"
            >
              GitHub →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const STACK = [
  "Python 3.12", "FastAPI", "XGBoost", "LightGBM", "SHAP", "FastF1", "Pandas",
  "React 18", "TypeScript", "Vite", "TanStack Query", "Tailwind v4", "Recharts",
  "Framer Motion", "WebSocket", "Docker",
];

function FeatureCard({
  href, icon, kicker, title, body, delay,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
    >
      <Link
        to={href}
        className="block group h-full rounded-xl border border-f1-edge bg-f1-panel/40 hover:bg-f1-panel/70 hover:border-paddock-coral/30 transition-all p-6 hover:-translate-y-0.5 hover:shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-md bg-f1-dark/60 p-2 border border-f1-edge">
            {icon}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            {kicker}
          </div>
        </div>
        <h2 className="font-display font-bold text-xl mb-2 group-hover:text-paddock-coral transition-colors">
          {title}
        </h2>
        <p className="text-sm text-f1-muted leading-relaxed">{body}</p>
        <div className="mt-4 flex items-center gap-1 text-xs text-paddock-coral font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          Open <ArrowRight size={12} />
        </div>
      </Link>
    </m.div>
  );
}

function Stat({ n, label, hint }: { n: string; label: string; hint?: string }) {
  return (
    <div>
      <div className="font-display font-black text-3xl md:text-4xl text-paddock-coral tabular-nums leading-none">
        {n}
      </div>
      <div className="text-xs text-f1-muted mt-2">{label}</div>
      {hint && <div className="text-[10px] text-f1-muted/70 mt-0.5">{hint}</div>}
    </div>
  );
}

