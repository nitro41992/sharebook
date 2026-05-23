"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Brain, CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import { intentCategories, intentLabels, type IntentCategory } from "@sharebook/shared";

type Capture = {
  id: string;
  capture_type: string;
  source_app: string | null;
  source_url: string | null;
  source_text: string | null;
  title: string | null;
  thumbnail_url: string | null;
  analysis_state: string;
  analysis_error: string | null;
  default_intent: IntentCategory | null;
  default_intent_confidence: number | null;
  current_save_intent: IntentCategory | null;
  intent_rationale: string | null;
  context_note: string | null;
  created_at: string;
  capture_assets?: Array<{ id: string; mime_type: string | null; public_url: string | null }>;
  captured_entities?: Array<{
    id: string;
    entity_type: string;
    display_name: string;
    confidence: number;
    evidence: string | null;
  }>;
  reminder_suggestions?: Array<{
    id: string;
    trigger_type: string;
    trigger_value: string;
    rationale: string;
    confidence: number;
  }>;
  collection_suggestions?: Array<{
    id: string;
    name: string;
    rationale: string;
    confidence: number;
  }>;
};

type SearchResult = {
  id: string;
  capture_id: string;
  document: string;
  captures?: Capture;
};

function stateClass(state: string) {
  if (state === "ready") return "ready";
  if (state === "failed") return "bad";
  if (state === "needs_review" || state === "partial") return "warn";
  return "";
}

export function CaptureWorkspace({ initialCaptures }: { initialCaptures: Capture[] }) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [selectedId, setSelectedId] = useState(initialCaptures[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) ?? captures[0],
    [captures, selectedId]
  );

  async function refreshCaptures(nextSelectedId?: string) {
    const response = await fetch("/api/captures");
    const json = await response.json();
    setCaptures(json.captures ?? []);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }

  async function createCapture(formData: FormData) {
    setCreating(true);
    const response = await fetch("/api/captures", {
      method: "POST",
      body: formData
    });
    const json = await response.json();
    setCreating(false);
    if (!response.ok) {
      alert(json.error ?? "Capture failed");
      return;
    }
    await refreshCaptures(json.capture.id);
  }

  async function analyzeSelected(route = "high_precision_openai") {
    if (!selected) return;
    setAnalyzing(true);
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === selected.id
          ? { ...capture, analysis_state: "processing", analysis_error: null }
          : capture
      )
    );
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captureId: selected.id, route })
    });
    const json = await response.json();
    setAnalyzing(false);
    if (!response.ok) {
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === selected.id
            ? {
                ...capture,
                analysis_state: "failed",
                analysis_error: json.error ?? "Analysis failed"
              }
            : capture
        )
      );
      return;
    }
    await refreshCaptures(selected.id);
  }

  async function search() {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const json = await response.json();
    setSearchResults(json.results ?? []);
  }

  useEffect(() => {
    setCaptures(initialCaptures);
  }, [initialCaptures]);

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="section">
          <div className="brand">
            <span className="mark">S</span>
            <span>Sharebook</span>
          </div>
          <p className="muted small">
            Phase 0A validates whether AI can preserve why a capture mattered.
          </p>
        </div>
        <div className="divider" />
        <form
          className="section capture-form"
          onSubmit={(event) => {
            event.preventDefault();
            createCapture(new FormData(event.currentTarget));
            event.currentTarget.reset();
          }}
        >
          <div className="h2">New capture</div>
          <label className="field">
            <span className="label">URL</span>
            <input className="input" name="sourceUrl" placeholder="https://..." />
          </label>
          <label className="field">
            <span className="label">Text</span>
            <textarea
              className="textarea"
              name="sourceText"
              placeholder="Paste a note, caption, DM text, or rough context"
            />
          </label>
          <label className="field">
            <span className="label">Image or screenshot</span>
            <input className="input" name="asset" type="file" accept="image/*" />
          </label>
          <label className="field">
            <span className="label">Source app</span>
            <select className="select" name="sourceApp" defaultValue="">
              <option value="">Unknown</option>
              <option>Instagram</option>
              <option>TikTok</option>
              <option>Reddit</option>
              <option>YouTube</option>
              <option>Maps</option>
              <option>Browser</option>
              <option>Photos</option>
              <option>Messages</option>
              <option>Other</option>
            </select>
          </label>
          <button className="button" disabled={creating}>
            {creating ? "Saving..." : "Save capture"}
          </button>
        </form>
      </aside>

      <main className="main">
        <div className="section">
          <div className="eyebrow">Review inbox</div>
          <h1 className="h1">What did you save, and why?</h1>
          <div className="search-box">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") search();
              }}
              placeholder="Search fuzzy memory, entities, notes, or intent"
            />
            <button className="button secondary" onClick={search} aria-label="Search">
              <Search size={16} />
            </button>
          </div>
          {searchResults.length ? (
            <p className="muted small">
              Search returned {searchResults.length} result
              {searchResults.length === 1 ? "" : "s"}. Select the matching capture below.
            </p>
          ) : null}
        </div>
        <div className="capture-list">
          {captures.length ? (
            captures.map((capture) => (
              <button
                key={capture.id}
                className={`capture-row ${selected?.id === capture.id ? "active" : ""}`}
                onClick={() => setSelectedId(capture.id)}
              >
                <p className="row-title">
                  {capture.title || capture.source_url || capture.source_text || "Untitled capture"}
                </p>
                <div className="row-meta">
                  <span className={`chip ${stateClass(capture.analysis_state)}`}>
                    {capture.analysis_state}
                  </span>
                  <span className="chip">{capture.capture_type}</span>
                  {capture.current_save_intent ? (
                    <span className="chip intent">
                      {intentLabels[capture.current_save_intent]}
                    </span>
                  ) : null}
                  {capture.source_app ? <span className="chip">{capture.source_app}</span> : null}
                </div>
              </button>
            ))
          ) : (
            <div className="empty">Create a capture to start validating the intent engine.</div>
          )}
        </div>
      </main>

      <aside className="inspector">
        {selected ? (
          <div className="section">
            <div className="toolbar">
              <span className={`chip ${stateClass(selected.analysis_state)}`}>
                {selected.analysis_state}
              </span>
              <span className="chip">{selected.capture_type}</span>
            </div>
            <h2 className="h2" style={{ marginTop: 18 }}>
              {selected.title || selected.source_url || "Capture detail"}
            </h2>
            {selected.intent_rationale ? (
              <p className="body">{selected.intent_rationale}</p>
            ) : (
              <p className="body">
                Run analysis to infer save intent, captured entities, reminders, collections,
                and search phrases.
              </p>
            )}
            <div className="toolbar">
              <button className="button" onClick={() => analyzeSelected()} disabled={analyzing}>
                {analyzing ? <Loader2 size={16} /> : <Brain size={16} />}
                {analyzing ? "Analyzing" : selected.analysis_state === "failed" ? "Retry analysis" : "Run analysis"}
              </button>
              <button
                className="button secondary"
                onClick={() => analyzeSelected("openai_mini")}
                disabled={analyzing}
              >
                <Sparkles size={16} />
                Mini
              </button>
            </div>

            <div className="panel">
              {selected.analysis_error ? (
                <div className="suggestion-item" style={{ borderLeftColor: "var(--bad)" }}>
                  <strong>Last analysis error</strong>
                  <p className="muted small">{selected.analysis_error}</p>
                </div>
              ) : null}
            </div>

            <div className="panel">
              <div className="label">Intent correction</div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                {intentCategories.map((intent) => (
                  <span
                    key={intent}
                    className={`chip ${intent === selected.current_save_intent ? "intent" : ""}`}
                  >
                    {intentLabels[intent]}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="label">Entities</div>
              <div className="entity-list" style={{ marginTop: 10 }}>
                {selected.captured_entities?.length ? (
                  selected.captured_entities.map((entity) => (
                    <div className="entity-item" key={entity.id}>
                      <strong>{entity.display_name}</strong>{" "}
                      <span className="muted small">
                        {entity.entity_type} · {Math.round(entity.confidence * 100)}%
                      </span>
                      {entity.evidence ? <p className="muted small">{entity.evidence}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="muted small">No entities extracted yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="label">Reminder suggestions</div>
              <div className="suggestion-list" style={{ marginTop: 10 }}>
                {selected.reminder_suggestions?.length ? (
                  selected.reminder_suggestions.map((reminder) => (
                    <div className="suggestion-item" key={reminder.id}>
                      <strong>{reminder.trigger_value}</strong>{" "}
                      <span className="muted small">{reminder.trigger_type}</span>
                      <p className="muted small">{reminder.rationale}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted small">No reminder suggestions yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="label">Collection suggestions</div>
              <div className="suggestion-list" style={{ marginTop: 10 }}>
                {selected.collection_suggestions?.length ? (
                  selected.collection_suggestions.map((collection) => (
                    <div className="suggestion-item" key={collection.id}>
                      <strong>{collection.name}</strong>
                      <p className="muted small">{collection.rationale}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted small">No collection suggestions yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="toolbar">
                <span className="chip">
                  <CheckCircle2 size={14} /> Accept output
                </span>
                <span className="chip">
                  <Archive size={14} /> Archive later
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">Select a capture to inspect analysis output.</div>
        )}
      </aside>
    </div>
  );
}
