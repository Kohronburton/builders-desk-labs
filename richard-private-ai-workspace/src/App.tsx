import { useMemo, useState } from "react";
import { events, records } from "./data";
import { groundedAnswer, retrieve } from "./retrieval";

type View = "command" | "workspace" | "registry" | "integrations" | "health";

const nav: { id: View; label: string; icon: string }[] = [
  { id: "command", label: "Command Center", icon: "⌘" },
  { id: "workspace", label: "Workspace", icon: "◇" },
  { id: "registry", label: "Data Registry", icon: "▤" },
  { id: "integrations", label: "Integrations", icon: "⌁" },
  { id: "health", label: "System Health", icon: "◉" },
];

const Badge = ({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "blue" }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export function App() {
  const [view, setView] = useState<View>("command");
  const [query, setQuery] = useState("What did we decide about Android camera capture?");
  const [submitted, setSubmitted] = useState(query);
  const [imported, setImported] = useState(false);
  const results = useMemo(() => retrieve(submitted, records), [submitted]);

  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><span>C</span><div>CONTINUUM<small>PRIVATE AI</small></div></div>
        <nav>
          {nav.map((item) => (
            <button className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} key={item.id}>
              <i>{item.icon}</i>{item.label}
            </button>
          ))}
        </nav>
        <div className="security-card">
          <span className="pulse" />
          <div><strong>Private workspace</strong><small>Encryption active · Audit on</small></div>
        </div>
        <div className="profile"><div className="avatar">OW</div><div><strong>Workspace Owner</strong><small>Administrator</small></div><b>•••</b></div>
      </aside>

      <main>
        <header>
          <div><small>PRIVATE INTELLIGENCE WORKSPACE</small><h1>{nav.find((item) => item.id === view)?.label}</h1></div>
          <div className="header-actions"><Badge>All systems operational</Badge><button className="icon-button">⌕</button><button className="icon-button">?</button></div>
        </header>

        {view === "command" && (
          <>
            <section className="hero">
              <div><Badge tone="blue">DEMO ENVIRONMENT</Badge><h2>Your data stays authoritative.<br />AI stays grounded.</h2><p>Traceable retrieval, versioned memory, and integrity controls for private multimodal intelligence.</p></div>
              <div className="shield"><span>✓</span><strong>100%</strong><small>source traceability</small></div>
            </section>

            <section className="stats">
              <article><span>Verified sources</span><strong>1,284</strong><small className="positive">↑ 42 this week</small></article>
              <article><span>Searchable chunks</span><strong>18,906</strong><small>PostgreSQL + pgvector</small></article>
              <article><span>Active sessions</span><strong>12</strong><small>Across 3 devices</small></article>
              <article><span>Integrity exceptions</span><strong>1</strong><small className="warning">Needs review</small></article>
            </section>

            <section className="grid">
              <article className="panel ask-panel">
                <div className="panel-title"><div><small>GROUNDED RETRIEVAL</small><h3>Ask the workspace</h3></div><Badge tone="blue">Gemini-ready</Badge></div>
                <form onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }}>
                  <textarea value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Workspace question" />
                  <button type="submit">Search verified memory <span>→</span></button>
                </form>
                <div className="answer"><small>SYNTHESIZED ANSWER</small><p>{groundedAnswer(submitted, results)}</p></div>
                <div className="sources">
                  {results.map((result) => <div key={result.sourceId}><span>▤</span><div><strong>{result.title}</strong><small>{result.sourceId} · verified source</small></div><b>{Math.round(result.score * 100)}%</b></div>)}
                </div>
              </article>

              <article className="panel">
                <div className="panel-title"><div><small>PIPELINE</small><h3>Ingestion status</h3></div><button className="text-button" onClick={() => setImported(true)}>Import sample</button></div>
                <div className="pipeline">
                  {[
                    ["Capture", imported ? "1 new file accepted" : "4 sources queued", "done"],
                    ["Validate", imported ? "Checksum verified" : "Schema + checksum", "done"],
                    ["Protect", "PII policy scan", "done"],
                    ["Index", imported ? "6 chunks embedded" : "pgvector embeddings", imported ? "done" : "live"],
                  ].map(([title, detail, state], i) => <div className="pipeline-row" key={title}><span className={state}>{state === "done" ? "✓" : "↻"}</span><div><strong>{title}</strong><small>{detail}</small></div><em>0{i + 1}</em></div>)}
                </div>
                <div className="integrity"><div><span>◆</span><div><strong>Zero-loss controls</strong><small>Idempotent imports · Immutable originals · Dead-letter recovery</small></div></div><b>ENFORCED</b></div>
              </article>
            </section>
          </>
        )}

        {view === "workspace" && <ListView title="Workspace modules" subtitle="Phase-ready capabilities" items={[
          ["Private Knowledge", "Grounded answers with citations and no summary-of-summary drift", "Active"],
          ["Android Capture", "CameraX upload contract, resumable chunks, device metadata", "Phase 2"],
          ["Live Media Router", "Policy-driven routing to Gemini, operators, and archive", "Phase 3"],
        ]} />}

        {view === "registry" && (
          <section className="panel wide"><div className="panel-title"><div><small>AUTHORITATIVE RECORDS</small><h3>Data Registry</h3></div><Badge>{records.length} demo sources</Badge></div>
            <div className="registry">{records.map((record) => <div className="registry-row" key={record.id}><span className="doc-icon">▤</span><div><strong>{record.title}</strong><small>{record.summary}</small><em>{record.tags.map((tag) => `#${tag}`).join("  ")}</em></div><div><Badge tone={record.state === "review" ? "amber" : "green"}>{record.state}</Badge><small>{record.chunks} chunks · {record.checksum}</small></div></div>)}</div>
          </section>
        )}

        {view === "integrations" && <ListView title="Integration adapters" subtitle="Replace mocks without changing domain logic" items={[
          ["Gemini API", "Structured response adapter with source attribution contract", "Ready"],
          ["PostgreSQL + pgvector", "Records, chunks, embeddings, sessions, and audit events", "Blueprint"],
          ["Object Storage", "Encrypted media with signed access and retention policy", "Blueprint"],
        ]} />}

        {view === "health" && (
          <section className="panel wide"><div className="panel-title"><div><small>OBSERVABILITY</small><h3>Audit timeline</h3></div><Badge>Healthy</Badge></div>
            <div className="audit">{events.map((event) => <div key={event.id}><time>{event.time}</time><span className={event.result}>●</span><div><strong>{event.action}</strong><small>{event.actor} · {event.target}</small></div></div>)}</div>
          </section>
        )}
      </main>
    </div>
  );
}

function ListView({ title, subtitle, items }: { title: string; subtitle: string; items: string[][] }) {
  return <section className="panel wide"><div className="panel-title"><div><small>{subtitle.toUpperCase()}</small><h3>{title}</h3></div></div><div className="module-list">{items.map(([name, description, status], index) => <article key={name}><span>0{index + 1}</span><div><h4>{name}</h4><p>{description}</p></div><Badge tone={status.includes("Phase") ? "amber" : "green"}>{status}</Badge></article>)}</div></section>;
}
