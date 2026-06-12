import { Link } from "react-router-dom";
import { ArrowRight, Database, Layers, LineChart, Github, Cpu } from "lucide-react";

import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Explainer surface — what the project is, what data it uses, what
 * models it trains, how the deploy works. The "How is this predicted?"
 * trigger on every prediction route opens a side-drawer that summarises
 * the relevant bits and links here for the full version.
 *
 * Also serves as the home of the Models page (was a separate top-nav
 * entry; folded under About per the user-approved Q1 plan).
 */
export default function AboutRoute() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-paddock-coral font-semibold mb-2">
          About
        </div>
        <h1 className="font-display font-black italic text-4xl md:text-5xl tracking-tight">
          How <span className="text-paddock-coral">Paddock Dashboard</span> works
        </h1>
        <p className="mt-4 text-base text-f1-muted leading-relaxed max-w-3xl">
          Six trained ML models, a Plackett-Luce Monte Carlo simulator, and a real-time replay
          of every cached race — all wired into one React dashboard backed by a FastAPI service.
          Here's the pipeline end-to-end.
        </p>
      </header>

      {/* ── DATA SOURCES ────────────────────────────────────────────── */}
      <Section icon={<Database size={18} className="text-paddock-coral" />} kicker="Data sources" title="Where the numbers come from">
        <ul className="space-y-3 text-sm text-f1-muted leading-relaxed">
          <li>
            <strong className="text-f1-white">FastF1</strong> — the authoritative source of
            timing data, telemetry, and lap-by-lap detail. We use it for historical races
            (training data) and for cached race replays. Each race in the cache carries a few
            megabytes of timing, plus optional ~75 MB of car-data + position-data for hero
            replays.
          </li>
          <li>
            <strong className="text-f1-white">Jolpica/Ergast</strong> — race results, qualifying
            results, driver and constructor standings. Used live for round-aware standings and
            schedule queries.
          </li>
          <li>
            <strong className="text-f1-white">OpenF1</strong> — driver photos, team colours,
            session metadata, fallback for live data during real race weekends.
          </li>
          <li>
            <strong className="text-f1-white">Open-Meteo</strong> — 5-day weather forecast for
            upcoming races (rain probability, air temperature). Inputs to the wet-race
            classifier.
          </li>
        </ul>
      </Section>

      {/* ── FEATURES ────────────────────────────────────────────────── */}
      <Section icon={<Layers size={18} className="text-paddock-coral" />} kicker="Feature engineering" title="What the models actually see">
        <p className="text-sm text-f1-muted leading-relaxed mb-3">
          Each race-driver row gets <strong className="text-f1-white">~18 features</strong> across
          four categories:
        </p>
        <ul className="space-y-2 text-sm text-f1-muted leading-relaxed list-disc pl-5">
          <li>
            <strong className="text-f1-white">Qualifying</strong> — gap to pole (ms), position,
            intra-team delta.
          </li>
          <li>
            <strong className="text-f1-white">Driver form</strong> — rolling average finish over
            the last 5 and 10 races, DNF rate, fastest-lap rate, points trajectory.
          </li>
          <li>
            <strong className="text-f1-white">Team / car form</strong> — team average finish, pit
            stop times, team DNF rate (cars-as-machines vs cars-as-drivers signals).
          </li>
          <li>
            <strong className="text-f1-white">Circuit history</strong> — driver's average finish
            at this venue, circuit downforce level, overtake difficulty, wet-race rate, weather
            forecast.
          </li>
        </ul>
      </Section>

      {/* ── MODELS ──────────────────────────────────────────────────── */}
      <Section icon={<LineChart size={18} className="text-paddock-cream" />} kicker="Models" title="Six trained predictors">
        <p className="text-sm text-f1-muted leading-relaxed mb-4">
          Trained on a <strong className="text-f1-white">time-aware split</strong> (2018–2024 +
          2026 train, 2025 validation, 2026 test) to prevent target leakage from regulation
          changes. SHAP attributions feed the prose explanations on the Predictor page.
        </p>
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 text-sm">
          {MODELS.map(m => (
            <div key={m.target} className="rounded-md border border-f1-edge bg-f1-panel/40 px-3 py-2">
              <div className="font-mono text-xs text-paddock-coral">{m.target}</div>
              <div className="text-[11px] text-f1-muted leading-relaxed mt-0.5">{m.use}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link to="/model" className="inline-flex items-center gap-1 text-xs text-paddock-cream hover:text-f1-white">
            See per-model metrics + feature importance <ArrowRight size={12} />
          </Link>
        </div>
      </Section>

      {/* ── SIMULATOR ───────────────────────────────────────────────── */}
      <Section icon={<Cpu size={18} className="text-paddock-cream" />} kicker="Monte Carlo" title="10,000-iteration race simulator">
        <p className="text-sm text-f1-muted leading-relaxed">
          The point predictions tell you who'll win, but they don't tell you{" "}
          <em>how confident</em> the model is. On every Predictor page we run{" "}
          <strong className="text-f1-white">10,000 Plackett-Luce race samples</strong> with
          per-driver DNF rolls, then count where each driver landed. That gives every cell of the
          22×22 distribution matrix a real probability — and the headline numbers (win-prob,
          podium-prob, expected finish) all come from that same simulation. DNFs are tracked in
          their own column so a fragile car doesn't drag everyone's expected position toward P20.
        </p>
      </Section>

      {/* ── DEPLOY ──────────────────────────────────────────────────── */}
      <Section icon={<Github size={18} className="text-paddock-coral" />} kicker="Deploy" title="$0/month production">
        <p className="text-sm text-f1-muted leading-relaxed mb-3">
          The full stack — including the 3 GB FastF1 cache, six trained model artifacts, and
          WebSocket infrastructure — runs free:
        </p>
        <ul className="space-y-2 text-sm text-f1-muted leading-relaxed list-disc pl-5">
          <li>
            <strong className="text-f1-white">Frontend on Vercel</strong> Hobby — React/Vite
            build, 100 GB bandwidth/month, preview deploys per PR.
          </li>
          <li>
            <strong className="text-f1-white">Backend on Hugging Face Spaces</strong> (Docker
            SDK, CPU basic) — 16 GB RAM, 50 GB disk, sleeps after 48 h of idle.
          </li>
          <li>
            All data + trained models version-tracked in git (artifacts are tiny: ~2.8 MB total
            for the six .pkl files).
          </li>
        </ul>
        <p className="text-sm text-f1-muted leading-relaxed mt-3">
          Full deploy guide:{" "}
          <a
            href="https://github.com/Fearless2389/F1-Dashboard/blob/main/DEPLOY.md"
            target="_blank"
            rel="noreferrer"
            className="text-paddock-cream hover:text-f1-white"
          >
            DEPLOY.md →
          </a>
        </p>
      </Section>

      <div className="pt-6 flex flex-wrap items-center gap-3">
        <Link to="/dashboard">
          <Button variant="primary">
            Open dashboard <ArrowRight size={14} />
          </Button>
        </Link>
        <a
          href="https://github.com/Fearless2389/F1-Dashboard"
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="secondary">
            <Github size={14} /> GitHub
          </Button>
        </a>
      </div>
    </div>
  );
}

const MODELS = [
  { target: "xgb_top10",     use: "Probability of finishing inside the top 10" },
  { target: "xgb_podium",    use: "Probability of finishing on the podium (P1–P3)" },
  { target: "lgbm_winner",   use: "Plackett-Luce ranker for race winner" },
  { target: "xgb_dnf",       use: "Probability of retiring before the chequered flag" },
  { target: "lgbm_fastest_lap", use: "Probability of taking the fastest-lap bonus point" },
  { target: "lgbm_quali",    use: "Predicted starting grid when actual quali isn't on file" },
];

function Section({
  icon, kicker, title, children,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            {kicker}
          </div>
        </div>
        <h2 className="font-display font-bold text-xl md:text-2xl mb-4">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}
