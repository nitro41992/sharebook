"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Brain,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Sparkles
} from "lucide-react";
import { intentCategories, intentLabels, type IntentCategory } from "@sharebook/shared";

type AnalysisRun = {
  id: string;
  model_route: string | null;
  status: string | null;
  is_canonical: boolean | null;
  provider: string;
  model: string;
  prompt_version: string;
  schema_version: string;
  latency_ms: number | null;
  usage: Record<string, unknown> | null;
  cost_estimate: number | null;
  raw_output: unknown;
  raw_model_output: string | null;
  extracted_json: unknown | null;
  repaired_output: unknown | null;
  schema_errors: Array<{ path: string; message: string }> | null;
  input_snapshot: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

type Capture = {
  id: string;
  capture_type: string;
  source_app: string | null;
  source_url: string | null;
  source_text: string | null;
  title: string | null;
  display_title: string | null;
  thumbnail_url: string | null;
  analysis_state: string;
  analysis_error: string | null;
  default_intent: IntentCategory | null;
  default_intent_confidence: number | null;
  current_save_intent: IntentCategory | null;
  intent_rationale: string | null;
  context_note: string | null;
  created_at: string;
  capture_assets?: Array<{
    id: string;
    mime_type: string | null;
    signed_url?: string | null;
    public_url?: string | null;
  }>;
  analysis_runs?: AnalysisRun[];
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

type InspectorTab = "review" | "source" | "debug" | "evals";

function stateClass(state: string) {
  if (state === "ready") return "ready";
  if (state === "failed") return "bad";
  if (state === "needs_review" || state === "partial") return "warn";
  return "";
}

function captureTitle(capture: Capture) {
  return (
    capture.display_title ||
    capture.title ||
    capture.source_url ||
    capture.source_text ||
    "Untitled capture"
  );
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: `Server returned ${response.status} ${response.statusText || "response"} instead of JSON.`
    };
  }
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null || value === "") return <p className="muted small">None recorded.</p>;
  return <pre className="code-block">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}

export function CaptureWorkspace({ initialCaptures }: { initialCaptures: Capture[] }) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [selectedId, setSelectedId] = useState(initialCaptures[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [tab, setTab] = useState<InspectorTab>("review");
  const [fixtureStatus, setFixtureStatus] = useState("");
  const [compareStatus, setCompareStatus] = useState("");

  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) ?? captures[0],
    [captures, selectedId]
  );
  const selectedRun = selected?.analysis_runs?.[0];
  const selectedPreview = selected?.capture_assets?.find((asset) =>
    asset.mime_type?.startsWith("image/")
  );

  async function refreshCaptures(nextSelectedId?: string) {
    const response = await fetch("/api/captures");
    const json = await readJsonResponse(response);
    if (!response.ok) {
      alert(json.error ?? "Failed to refresh captures");
      return;
    }
    setCaptures(json.captures ?? []);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }

  async function createCapture(formData: FormData) {
    setCreating(true);
    const response = await fetch("/api/captures", {
      method: "POST",
      body: formData
    });
    const json = await readJsonResponse(response);
    setCreating(false);
    if (!response.ok) {
      alert(json.error ?? "Capture failed");
      return;
    }
    await refreshCaptures(json.capture.id);
  }

  async function analyzeCapture(captureId: string, route = "high_precision_openai") {
    setAnalyzingIds((current) => new Set(current).add(captureId));
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === captureId
          ? { ...capture, analysis_state: "processing", analysis_error: null }
          : capture
      )
    );

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureId, route })
      });
      const json = await readJsonResponse(response);
      if (!response.ok) {
        setCaptures((current) =>
          current.map((capture) =>
            capture.id === captureId
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
      await refreshCaptures(captureId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis request failed";
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === captureId
            ? { ...capture, analysis_state: "failed", analysis_error: message }
            : capture
        )
      );
    } finally {
      setAnalyzingIds((current) => {
        const next = new Set(current);
        next.delete(captureId);
        return next;
      });
    }
  }

  async function updateIntent(intent: IntentCategory) {
    if (!selected) return;
    const response = await fetch("/api/captures", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captureId: selected.id, currentSaveIntent: intent })
    });
    const json = await readJsonResponse(response);
    if (!response.ok) {
      alert(json.error ?? "Could not update intent");
      return;
    }
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === selected.id ? { ...capture, current_save_intent: intent } : capture
      )
    );
  }

  async function search() {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const json = await readJsonResponse(response);
    setSearchResults(json.results ?? []);
  }

  async function saveFixture() {
    if (!selected) return;
    setFixtureStatus("Saving fixture...");
    const response = await fetch("/api/evals/fixtures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        captureId: selected.id,
        label: captureTitle(selected),
        expectedIntent: selected.current_save_intent ?? selected.default_intent
      })
    });
    const json = await readJsonResponse(response);
    setFixtureStatus(response.ok ? `Saved fixture ${json.fixture?.id?.slice(0, 8)}` : json.error);
  }

  async function compareModels() {
    if (!selected) return;
    setCompareStatus("Comparing models...");
    const response = await fetch("/api/analyze/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captureId: selected.id })
    });
    const json = await readJsonResponse(response);
    if (!response.ok) {
      setCompareStatus(json.error ?? "Comparison failed");
      return;
    }
    setCompareStatus(`Saved ${json.results?.length ?? 0} comparison runs`);
    await refreshCaptures(selected.id);
  }

  function exportDebugBundle() {
    if (!selected) return;
    const bundle = {
      capture: selected,
      latest_analysis_run: selectedRun ?? null
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sharebook-debug-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
            <button className="button secondary icon-button" onClick={search} aria-label="Search">
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
            captures.map((capture) => {
              const isAnalyzing = analyzingIds.has(capture.id);
              return (
                <div
                  key={capture.id}
                  className={`capture-row ${selected?.id === capture.id ? "active" : ""}`}
                  onClick={() => setSelectedId(capture.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="row-main">
                    <p className="row-title">{captureTitle(capture)}</p>
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
                    {capture.analysis_error ? (
                      <p className="muted small row-error">{capture.analysis_error}</p>
                    ) : null}
                  </div>
                  <button
                    className="button secondary row-action"
                    disabled={isAnalyzing}
                    onClick={(event) => {
                      event.stopPropagation();
                      analyzeCapture(capture.id);
                    }}
                  >
                    {isAnalyzing ? <Loader2 size={15} /> : capture.analysis_state === "failed" ? <RefreshCw size={15} /> : <Brain size={15} />}
                    {isAnalyzing ? "Running" : capture.analysis_state === "failed" ? "Retry" : "Run"}
                  </button>
                </div>
              );
            })
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
              {selectedRun ? (
                <span className="chip">{selectedRun.model_route ?? selectedRun.model}</span>
              ) : null}
            </div>
            <h2 className="h2" style={{ marginTop: 18 }}>
              {captureTitle(selected)}
            </h2>
            <div className="toolbar">
              <button
                className="button"
                onClick={() => analyzeCapture(selected.id)}
                disabled={analyzingIds.has(selected.id)}
              >
                {analyzingIds.has(selected.id) ? <Loader2 size={16} /> : <Brain size={16} />}
                {analyzingIds.has(selected.id)
                  ? "Analyzing"
                  : selected.analysis_state === "failed"
                    ? "Retry analysis"
                    : "Run analysis"}
              </button>
              <button
                className="button secondary"
                onClick={() => analyzeCapture(selected.id, "openai_mini")}
                disabled={analyzingIds.has(selected.id)}
              >
                <Sparkles size={16} />
                Mini
              </button>
            </div>
            <div className="tabs">
              {(["review", "source", "debug", "evals"] as InspectorTab[]).map((item) => (
                <button
                  key={item}
                  className={`tab ${tab === item ? "active" : ""}`}
                  onClick={() => setTab(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {tab === "review" ? (
              <>
                {selected.analysis_error ? (
                  <div className="panel">
                    <div className="suggestion-item" style={{ borderLeftColor: "var(--bad)" }}>
                      <strong>Last analysis error</strong>
                      <p className="muted small">{selected.analysis_error}</p>
                    </div>
                  </div>
                ) : null}
                <div className="panel">
                  <p className="body">
                    {selected.intent_rationale ||
                      "Run analysis to infer save intent, captured entities, reminders, collections, and search phrases."}
                  </p>
                </div>
                <div className="panel">
                  <div className="label">Intent correction</div>
                  <div className="toolbar" style={{ marginTop: 10 }}>
                    {intentCategories.map((intent) => (
                      <button
                        key={intent}
                        className={`chip chip-button ${
                          intent === selected.current_save_intent ? "intent" : ""
                        }`}
                        onClick={() => updateIntent(intent)}
                      >
                        {intentLabels[intent]}
                      </button>
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
              </>
            ) : null}

            {tab === "source" ? (
              <>
                <div className="panel">
                  <div className="label">Source preview</div>
                  {selectedPreview?.signed_url ? (
                    <img className="preview" src={selectedPreview.signed_url} alt="Capture upload" />
                  ) : selected.thumbnail_url ? (
                    <img className="preview" src={selected.thumbnail_url} alt="Capture thumbnail" />
                  ) : (
                    <p className="muted small">No image preview for this capture.</p>
                  )}
                </div>
                <div className="panel">
                  <div className="label">Source URL</div>
                  <p className="body">{selected.source_url || "None"}</p>
                </div>
                <div className="panel">
                  <div className="label">Source text</div>
                  <p className="body">{selected.source_text || "None"}</p>
                </div>
              </>
            ) : null}

            {tab === "debug" ? (
              <>
                <div className="panel">
                  <div className="toolbar">
                    <button className="button secondary" onClick={exportDebugBundle}>
                      <Download size={16} />
                      Export bundle
                    </button>
                    {selectedRun ? (
                      <>
                        <span className={`chip ${selectedRun.status === "failed" ? "bad" : "ready"}`}>
                          {selectedRun.status ?? "unknown"}
                        </span>
                        <span className="chip">{selectedRun.provider}</span>
                        <span className="chip">{selectedRun.model}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {selectedRun ? (
                  <>
                    <div className="panel debug-grid">
                      <div>
                        <div className="label">Prompt/schema</div>
                        <p className="muted small">
                          {selectedRun.prompt_version} · {selectedRun.schema_version}
                        </p>
                      </div>
                      <div>
                        <div className="label">Latency</div>
                        <p className="muted small">
                          {selectedRun.latency_ms ? `${selectedRun.latency_ms} ms` : "Unknown"}
                        </p>
                      </div>
                      <div>
                        <div className="label">Cost</div>
                        <p className="muted small">
                          {selectedRun.cost_estimate == null ? "Not estimated" : selectedRun.cost_estimate}
                        </p>
                      </div>
                    </div>
                    <div className="panel">
                      <div className="label">Usage</div>
                      <JsonBlock value={selectedRun.usage} />
                    </div>
                    <div className="panel">
                      <div className="label">Schema errors</div>
                      <JsonBlock value={selectedRun.schema_errors} />
                    </div>
                    <div className="panel">
                      <div className="label">Input snapshot</div>
                      <JsonBlock value={selectedRun.input_snapshot} />
                    </div>
                    <div className="panel">
                      <div className="label">Raw model output</div>
                      <JsonBlock value={selectedRun.raw_model_output} />
                    </div>
                    <div className="panel">
                      <div className="label">Repaired JSON</div>
                      <JsonBlock value={selectedRun.repaired_output} />
                    </div>
                  </>
                ) : (
                  <div className="panel">
                    <p className="muted small">No analysis run recorded yet.</p>
                  </div>
                )}
              </>
            ) : null}

            {tab === "evals" ? (
              <>
                <div className="panel">
                  <div className="toolbar">
                    <button className="button secondary" onClick={saveFixture}>
                      <CheckCircle2 size={16} />
                      Save as fixture
                    </button>
                    <button className="button secondary" onClick={compareModels}>
                      <Sparkles size={16} />
                      Compare models
                    </button>
                  </div>
                  {fixtureStatus ? <p className="muted small">{fixtureStatus}</p> : null}
                  {compareStatus ? <p className="muted small">{compareStatus}</p> : null}
                </div>
                <div className="panel">
                  <div className="label">Recent runs</div>
                  <div className="suggestion-list" style={{ marginTop: 10 }}>
                    {selected.analysis_runs?.length ? (
                      selected.analysis_runs.map((run) => (
                        <div className="suggestion-item" key={run.id}>
                          <strong>{run.model_route ?? run.model}</strong>{" "}
                          <span className="muted small">
                            {run.is_canonical ? "canonical" : "comparison"} · {run.status}
                          </span>
                          <p className="muted small">
                            {run.latency_ms ? `${run.latency_ms} ms` : "No latency"} ·{" "}
                            {new Date(run.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="muted small">No runs yet.</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}

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
