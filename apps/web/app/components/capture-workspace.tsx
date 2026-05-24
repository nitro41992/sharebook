"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Search
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
  suggested_actions?: Array<{
    type: string;
    label: string;
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
  capture?: Capture;
  captures?: Capture;
  match_context: string;
  match_signal: string;
  score: number;
};

type EvalRun = {
  id: string;
  model_route: string;
  passed: boolean | null;
  score: {
    actual_intent?: string | null;
    intent_pass?: boolean;
    bad_intent_hit?: boolean;
    missing_entities?: string[];
    entity_pass?: boolean;
    missing_reminders?: string[];
    reminder_pass?: boolean;
    search_misses?: string[];
    search_pass?: boolean;
  };
  created_at: string;
};

type EvalFixture = {
  id: string;
  label: string | null;
  expected_intent: IntentCategory | null;
  acceptable_intents: string[];
  bad_intents: string[];
  required_entities: string[];
  expected_reminders: string[];
  search_queries: string[];
  notes: string | null;
  eval_runs?: EvalRun[];
};

type InspectorTab = "review" | "quality" | "source";

type IntentUndo = {
  captureId: string;
  from: IntentCategory;
  to: IntentCategory;
};

const feedbackIssues = [
  { id: "wrong_intent", label: "Wrong intent" },
  { id: "missing_entity", label: "Missing entity" },
  { id: "wrong_entity", label: "Wrong entity" },
  { id: "missing_reminder", label: "Missing reminder" },
  { id: "bad_reminder", label: "Bad reminder" },
  { id: "misleading_rationale", label: "Misleading rationale" },
  { id: "bad_suggested_action", label: "Bad suggested action" },
  { id: "search_would_fail", label: "Search would fail" }
] as const;

type FeedbackIssue = (typeof feedbackIssues)[number]["id"];

type QualityReport = {
  total_feedback: number;
  issue_counts: Record<string, number>;
  overused_intents: Record<string, number>;
  missing_entity_examples: string[];
  reminder_issue_examples: string[];
  search_issue_examples: string[];
  comments: Array<{ label: string; comment: string }>;
  prompt_suggestions: Array<{
    pattern: string;
    proposed_prompt_wording: string;
    risk: string;
    expected_improvement: string;
  }>;
};

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

function linesToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToLines(value?: string[]) {
  return (value ?? []).join("\n");
}

function reminderBlankReason(capture: Capture, run?: AnalysisRun) {
  if (capture.analysis_state === "queued") {
    return "Analysis has not run yet, so Sharebook has not looked for reminder-worthy triggers.";
  }
  if (capture.analysis_state === "processing") {
    return "Analysis is still running. Reminder suggestions will appear only after the model returns a concrete trigger.";
  }
  if (capture.analysis_state === "failed") {
    return "The latest analysis failed before a trustworthy reminder suggestion could be stored.";
  }
  if (!run) {
    return "No analysis run is recorded yet.";
  }
  const output =
    run.repaired_output && typeof run.repaired_output === "object"
      ? (run.repaired_output as { suggested_reminders?: unknown; suggested_actions?: unknown })
      : null;
  const rawReminders = Array.isArray(output?.suggested_reminders)
    ? output.suggested_reminders.length
    : 0;
  const rawActions = Array.isArray(output?.suggested_actions) ? output.suggested_actions.length : 0;
  if (rawReminders === 0 && rawActions > 0) {
    return "The model proposed actions, but did not identify a concrete time, place, event, trip, or clear follow-up trigger for a Reminder.";
  }
  if (rawReminders === 0) {
    return "The model left reminders blank. That is valid when the Capture lacks a concrete trigger; Sharebook favors fewer, higher-confidence reminders.";
  }
  return "The latest run contained reminder-like output, but none is currently stored. Inspect output for schema or persistence details.";
}

export function CaptureWorkspace({ initialCaptures }: { initialCaptures: Capture[] }) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [selectedId, setSelectedId] = useState(initialCaptures[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [tab, setTab] = useState<InspectorTab>("review");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [fixtureStatus, setFixtureStatus] = useState("");
  const [fixtures, setFixtures] = useState<EvalFixture[]>([]);
  const [evalStatus, setEvalStatus] = useState("");
  const [intentUpdatingId, setIntentUpdatingId] = useState<string | null>(null);
  const [intentUndo, setIntentUndo] = useState<IntentUndo | null>(null);
  const [inspectedRunId, setInspectedRunId] = useState("");
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [reportStatus, setReportStatus] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState<{
    looksRight: boolean;
    issues: FeedbackIssue[];
    correctedIntent: string;
    requiredEntities: string;
    expectedReminders: string;
    searchQueries: string;
    comment: string;
  }>({
    looksRight: true,
    issues: [],
    correctedIntent: "",
    requiredEntities: "",
    expectedReminders: "",
    searchQueries: "",
    comment: ""
  });

  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) ?? captures[0],
    [captures, selectedId]
  );
  const selectedRuns = selected?.analysis_runs ?? [];
  const selectedRun =
    selectedRuns.find((run) => run.id === selectedRunId) ?? selectedRuns[0];
  const inspectedRun = selectedRuns.find((run) => run.id === inspectedRunId);
  const selectedPreview = selected?.capture_assets?.find((asset) =>
    asset.mime_type?.startsWith("image/")
  );
  const selectedActions = useMemo(() => {
    const output =
      selectedRun?.repaired_output && typeof selectedRun.repaired_output === "object"
        ? (selectedRun.repaired_output as { suggested_actions?: unknown })
        : null;
    return Array.isArray(output?.suggested_actions)
      ? output.suggested_actions.filter(
          (action): action is { type?: string; label?: string; rationale?: string; confidence?: number } =>
            Boolean(action && typeof action === "object")
        )
      : [];
  }, [selectedRun]);

  const hasEntityIssue =
    feedbackDraft.issues.includes("missing_entity") || feedbackDraft.issues.includes("wrong_entity");
  const hasReminderIssue =
    feedbackDraft.issues.includes("missing_reminder") || feedbackDraft.issues.includes("bad_reminder");
  const hasSearchIssue = feedbackDraft.issues.includes("search_would_fail");

  function toggleIssue(issue: FeedbackIssue) {
    setFeedbackDraft((draft) => {
      const issues = draft.issues.includes(issue)
        ? draft.issues.filter((item) => item !== issue)
        : [...draft.issues, issue];
      return { ...draft, issues, looksRight: issues.length === 0 };
    });
  }

  function parseFeedbackNotes(notes: string | null) {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes) as {
        kind?: string;
        issues?: string[];
        comment?: string;
        looksRight?: boolean;
      };
      return parsed.kind === "mini_feedback" ? parsed : null;
    } catch {
      return null;
    }
  }

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

  async function analyzeCapture(captureId: string, route = "openai_mini") {
    if (intentUndo?.captureId === captureId) setIntentUndo(null);
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
    const captureId = selected.id;
    const previousIntent = selected.current_save_intent ?? selected.default_intent;
    setIntentUpdatingId(captureId);
    setIntentUndo(null);
    try {
      const response = await fetch("/api/captures", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureId, currentSaveIntent: intent })
      });
      const json = await readJsonResponse(response);
      if (!response.ok) {
        alert(json.error ?? "Could not update intent");
        return;
      }
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === captureId ? { ...capture, current_save_intent: intent } : capture
        )
      );
      if (previousIntent && previousIntent !== intent) {
        setIntentUndo({ captureId, from: previousIntent, to: intent });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update intent");
    } finally {
      setIntentUpdatingId(null);
    }
  }

  async function undoIntent() {
    if (!intentUndo) return;
    const undo = intentUndo;
    setIntentUpdatingId(undo.captureId);
    try {
      const response = await fetch("/api/captures", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureId: undo.captureId, currentSaveIntent: undo.from })
      });
      const json = await readJsonResponse(response);
      if (!response.ok) {
        alert(json.error ?? "Could not undo intent change");
        return;
      }
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === undo.captureId ? { ...capture, current_save_intent: undo.from } : capture
        )
      );
      setIntentUndo(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not undo intent change");
    } finally {
      setIntentUpdatingId(null);
    }
  }

  async function search() {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const json = await readJsonResponse(response);
    if (!response.ok) {
      alert(json.error ?? "Search failed");
      return;
    }
    setSearchResults(json.results ?? []);
  }

  const loadFixtures = useCallback(async (captureId = selected?.id) => {
    if (!captureId) return;
    const response = await fetch(`/api/evals/fixtures?captureId=${encodeURIComponent(captureId)}`);
    const json = await readJsonResponse(response);
    if (!response.ok) {
      setEvalStatus(json.error ?? "Could not load fixtures");
      return;
    }
    setFixtures(json.fixtures ?? []);
  }, [selected?.id]);

  async function saveFeedback() {
    if (!selected) return;
    setFixtureStatus("Saving feedback...");
    const feedbackNotes = JSON.stringify({
      kind: "mini_feedback",
      looksRight: feedbackDraft.looksRight,
      issues: feedbackDraft.issues,
      comment: feedbackDraft.comment.trim(),
      analysisRunId: selectedRun?.id ?? null,
      modelRoute: selectedRun?.model_route ?? "openai_mini",
      promptVersion: selectedRun?.prompt_version ?? null,
      schemaVersion: selectedRun?.schema_version ?? null
    });
    const response = await fetch("/api/evals/fixtures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        captureId: selected.id,
        label: captureTitle(selected),
        expectedIntent:
          feedbackDraft.correctedIntent || selected.current_save_intent || selected.default_intent,
        acceptableIntents: [],
        badIntents: [],
        requiredEntities: linesToList(feedbackDraft.requiredEntities),
        expectedReminders: linesToList(feedbackDraft.expectedReminders),
        searchQueries: linesToList(feedbackDraft.searchQueries),
        notes: feedbackNotes
      })
    });
    const json = await readJsonResponse(response);
    setFixtureStatus(response.ok ? `Saved feedback ${json.fixture?.id?.slice(0, 8)}` : json.error);
    if (response.ok) {
      setIntentUndo(null);
      await loadFixtures(selected.id);
    }
  }

  async function runEval(fixtureId: string, modelRoute = "openai_mini") {
    setEvalStatus("Checking Mini...");
    const response = await fetch("/api/evals/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId, modelRoute })
    });
    const json = await readJsonResponse(response);
    if (!response.ok) {
      setEvalStatus(json.error ?? "Eval failed");
      return;
    }
    setEvalStatus(json.evalRun?.passed ? "Eval passed" : "Eval needs review");
    await loadFixtures(selected?.id);
    if (selected) await refreshCaptures(selected.id);
  }

  async function loadQualityReport() {
    setReportStatus("Building report...");
    const response = await fetch("/api/evals/quality-report");
    const json = await readJsonResponse(response);
    if (!response.ok) {
      setReportStatus(json.error ?? "Could not build report");
      return;
    }
    setQualityReport(json.report ?? null);
    setReportStatus("Report ready");
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

  useEffect(() => {
    if (!selected) return;
    setSelectedRunId(selected.analysis_runs?.[0]?.id ?? "");
    setInspectedRunId("");
    setIntentUndo((undo) => (undo?.captureId === selected.id ? undo : null));
    setFeedbackDraft({
      looksRight: true,
      issues: [],
      correctedIntent: selected.current_save_intent ?? selected.default_intent ?? "",
      requiredEntities: listToLines(
        selected.captured_entities?.slice(0, 4).map((entity) => entity.display_name)
      ),
      expectedReminders: "",
      searchQueries: "",
      comment: ""
    });
    setFixtureStatus("");
    setEvalStatus("");
    setReportStatus("");
    loadFixtures(selected.id);
  }, [loadFixtures, selected]);

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
            <div className="search-results">
              {searchResults.map((result) => {
                const capture = result.capture ?? result.captures;
                if (!capture) return null;
                return (
                  <button
                    className={`search-result ${selected?.id === result.capture_id ? "active" : ""}`}
                    key={`${result.capture_id}-${result.id}`}
                    onClick={() => setSelectedId(result.capture_id)}
                    type="button"
                  >
                    <span>
                      <strong>{captureTitle(capture)}</strong>
                      <span className="muted small">{result.match_context}</span>
                    </span>
                    <span className="row-meta">
                      <span className={`chip ${stateClass(capture.analysis_state)}`}>
                        {capture.analysis_state}
                      </span>
                      {capture.current_save_intent ? (
                        <span className="chip intent">
                          {intentLabels[capture.current_save_intent]}
                        </span>
                      ) : null}
                      {capture.capture_type ? <span className="chip">{capture.capture_type}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            <p className="muted small">No visible search matches yet.</p>
          ) : null}
        </div>
        <div className="section quality-overview">
          <div>
            <div className="eyebrow">Quality report</div>
            <p className="body">
              Review saved feedback across all captures and turn recurring misses into prompt
              improvement suggestions.
            </p>
          </div>
          <button className="button secondary" onClick={loadQualityReport}>
            <AlertTriangle size={16} />
            Build all-feedback report
          </button>
          {reportStatus ? <p className="muted small">{reportStatus}</p> : null}
          {qualityReport ? (
            <div className="quality-report">
              <span className="chip ready">{qualityReport.total_feedback} feedback items</span>
              <JsonBlock value={qualityReport.issue_counts} />
              {qualityReport.prompt_suggestions.map((suggestion) => (
                <div className="eval-run" key={suggestion.pattern}>
                  <strong>{suggestion.pattern}</strong>
                  <p className="muted small">{suggestion.proposed_prompt_wording}</p>
                  <p className="muted small">Risk: {suggestion.risk}</p>
                  <p className="muted small">
                    Expected improvement: {suggestion.expected_improvement}
                  </p>
                </div>
              ))}
            </div>
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
                    {isAnalyzing ? "Running" : capture.analysis_state === "failed" ? "Retry" : "Run Mini"}
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
                    : "Run Mini analysis"}
              </button>
              {selectedRun ? (
                <button
                  className="button secondary"
                  onClick={() =>
                    setInspectedRunId((current) => (current === selectedRun.id ? "" : selectedRun.id))
                  }
                >
                  <Eye size={16} />
                  Inspect output
                </button>
              ) : null}
            </div>
            <div className="tabs">
              {(["review", "quality", "source"] as InspectorTab[]).map((item) => (
                <button
                  key={item}
                  className={`tab ${tab === item ? "active" : ""}`}
                  onClick={() => setTab(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {inspectedRun ? (
              <div className="panel inspect-panel">
                <div className="toolbar">
                  <strong>Output inspection</strong>
                  <button className="button secondary" onClick={exportDebugBundle}>
                    <Download size={16} />
                    Export bundle
                  </button>
                  <span className={`chip ${inspectedRun.status === "failed" ? "bad" : "ready"}`}>
                    {inspectedRun.status ?? "unknown"}
                  </span>
                  <span className="chip">{inspectedRun.model_route ?? inspectedRun.model}</span>
                </div>
                <div className="debug-grid">
                  <div>
                    <div className="label">Prompt/schema</div>
                    <p className="muted small">
                      {inspectedRun.prompt_version} · {inspectedRun.schema_version}
                    </p>
                  </div>
                  <div>
                    <div className="label">Latency</div>
                    <p className="muted small">
                      {inspectedRun.latency_ms ? `${inspectedRun.latency_ms} ms` : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <div className="label">Cost</div>
                    <p className="muted small">
                      {inspectedRun.cost_estimate == null ? "Not estimated" : inspectedRun.cost_estimate}
                    </p>
                  </div>
                </div>
                <details className="debug-details">
                  <summary>Raw and structured output</summary>
                  <div className="label">Schema errors</div>
                  <JsonBlock value={inspectedRun.schema_errors} />
                  <div className="label">Input snapshot</div>
                  <JsonBlock value={inspectedRun.input_snapshot} />
                  <div className="label">Raw model output</div>
                  <JsonBlock value={inspectedRun.raw_model_output} />
                  <div className="label">Structured output / repaired JSON</div>
                  <JsonBlock value={inspectedRun.extracted_json ?? inspectedRun.repaired_output} />
                </details>
              </div>
            ) : null}

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
                        disabled={intentUpdatingId === selected.id}
                      >
                        {intentLabels[intent]}
                      </button>
                    ))}
                  </div>
                  {intentUndo?.captureId === selected.id ? (
                    <div className="undo-banner">
                      <span>
                        Intent changed from {intentLabels[intentUndo.from]} to{" "}
                        {intentLabels[intentUndo.to]}.
                      </span>
                      <button
                        className="button secondary"
                        onClick={undoIntent}
                        disabled={intentUpdatingId === selected.id}
                      >
                        Undo
                      </button>
                    </div>
                  ) : null}
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
                      <div className="suggestion-item">
                        <strong>No reminder suggestions stored</strong>
                        <p className="muted small">{reminderBlankReason(selected, selectedRun)}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="label">Suggested actions</div>
                  <div className="suggestion-list" style={{ marginTop: 10 }}>
                    {selectedActions.length ? (
                      selectedActions.map((action, index) => (
                        <div className="suggestion-item" key={`${action.type ?? "action"}-${index}`}>
                          <strong>{action.label ?? action.type ?? "Suggested action"}</strong>{" "}
                          {action.type ? <span className="muted small">{action.type}</span> : null}
                          {action.rationale ? <p className="muted small">{action.rationale}</p> : null}
                        </div>
                      ))
                    ) : (
                      <p className="muted small">No suggested actions recorded in the latest run.</p>
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

            {tab === "quality" ? (
              <>
                <div className="panel">
                  <div className="label">Mini feedback</div>
                  <p className="muted small">
                    Mark what is wrong with the current Mini result. Leave it as looks right when the
                    output matches why you saved this.
                  </p>
                  <label className="feedback-check">
                    <input
                      type="checkbox"
                      checked={feedbackDraft.looksRight}
                      onChange={(event) =>
                        setFeedbackDraft((draft) => ({
                          ...draft,
                          looksRight: event.target.checked,
                          issues: event.target.checked ? [] : draft.issues
                        }))
                      }
                    />
                    <span>Looks right</span>
                  </label>
                  <div className="issue-grid">
                    {feedbackIssues.map((issue) => (
                      <label className="feedback-check" key={issue.id}>
                        <input
                          type="checkbox"
                          checked={feedbackDraft.issues.includes(issue.id)}
                          onChange={() => toggleIssue(issue.id)}
                        />
                        <span>{issue.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="fixture-grid" style={{ marginTop: 14 }}>
                    {feedbackDraft.issues.includes("wrong_intent") ? (
                      <label className="field">
                        <span className="label">Correct intent</span>
                        <select
                          className="select"
                          value={feedbackDraft.correctedIntent}
                          onChange={(event) =>
                            setFeedbackDraft((draft) => ({
                              ...draft,
                              correctedIntent: event.target.value
                            }))
                          }
                        >
                          <option value="">Use current intent</option>
                          {intentCategories.map((intent) => (
                            <option key={intent} value={intent}>
                              {intentLabels[intent]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {hasEntityIssue ? (
                      <label className="field">
                        <span className="label">Expected entities</span>
                        <textarea
                          className="textarea compact"
                          value={feedbackDraft.requiredEntities}
                          onChange={(event) =>
                            setFeedbackDraft((draft) => ({
                              ...draft,
                              requiredEntities: event.target.value
                            }))
                          }
                          placeholder="One entity per line or comma-separated"
                        />
                      </label>
                    ) : null}
                    {hasReminderIssue ? (
                      <label className="field">
                        <span className="label">Expected reminders</span>
                        <textarea
                          className="textarea compact"
                          value={feedbackDraft.expectedReminders}
                          onChange={(event) =>
                            setFeedbackDraft((draft) => ({
                              ...draft,
                              expectedReminders: event.target.value
                            }))
                          }
                          placeholder="Concrete reminder trigger or rationale"
                        />
                      </label>
                    ) : null}
                    {hasSearchIssue ? (
                      <label className="field">
                        <span className="label">Search queries that should find this</span>
                        <textarea
                          className="textarea compact"
                          value={feedbackDraft.searchQueries}
                          onChange={(event) =>
                            setFeedbackDraft((draft) => ({
                              ...draft,
                              searchQueries: event.target.value
                            }))
                          }
                          placeholder="that ramen place, bus ticket to Easton"
                        />
                      </label>
                    ) : null}
                    <label className="field">
                      <span className="label">Optional comment</span>
                      <textarea
                        className="textarea compact"
                        value={feedbackDraft.comment}
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            comment: event.target.value
                          }))
                        }
                        placeholder="I saved this to try the workout, not just watch it."
                      />
                    </label>
                  </div>
                  <div className="toolbar">
                    <button className="button secondary" onClick={saveFeedback}>
                      <CheckCircle2 size={16} />
                      Save feedback
                    </button>
                  </div>
                  {fixtureStatus ? <p className="muted small">{fixtureStatus}</p> : null}
                  {evalStatus ? <p className="muted small">{evalStatus}</p> : null}
                </div>
                <div className="panel">
                  <div className="label">Saved feedback</div>
                  <div className="suggestion-list" style={{ marginTop: 10 }}>
                    {fixtures.length ? (
                      fixtures.map((fixture) => {
                        const meta = parseFeedbackNotes(fixture.notes);
                        return (
                          <div className="suggestion-item" key={fixture.id}>
                            <div className="toolbar">
                              <strong>{fixture.label || `Feedback ${fixture.id.slice(0, 8)}`}</strong>
                              {fixture.expected_intent ? (
                                <span className="chip intent">{intentLabels[fixture.expected_intent]}</span>
                              ) : null}
                              {meta?.looksRight ? <span className="chip ready">looks right</span> : null}
                            </div>
                            {meta?.issues?.length ? (
                              <p className="muted small">Issues: {meta.issues.join(", ")}</p>
                            ) : null}
                            {meta?.comment ? <p className="muted small">{meta.comment}</p> : null}
                            <p className="muted small">
                              {fixture.required_entities.length} entities ·{" "}
                              {fixture.expected_reminders.length} reminders ·{" "}
                              {fixture.search_queries.length} search queries
                            </p>
                            <div className="toolbar">
                              <button className="button secondary" onClick={() => runEval(fixture.id)}>
                                <ClipboardCheck size={16} />
                                Check Mini
                              </button>
                            </div>
                            {fixture.eval_runs?.length ? (
                              <div className="eval-run-list">
                                {fixture.eval_runs.map((run) => (
                                  <div className="eval-run" key={run.id}>
                                    <span className={`chip ${run.passed ? "ready" : "warn"}`}>
                                      {run.passed ? "passed" : "review"}
                                    </span>
                                    <span className="muted small">
                                      {run.model_route} · {new Date(run.created_at).toLocaleString()}
                                    </span>
                                    <p className="muted small">
                                      intent {run.score.intent_pass ? "ok" : "miss"} · entities{" "}
                                      {run.score.entity_pass ? "ok" : "miss"} · reminders{" "}
                                      {run.score.reminder_pass ? "ok" : "miss"} · search{" "}
                                      {run.score.search_pass ? "ok" : "miss"}
                                    </p>
                                    {run.score.missing_entities?.length ? (
                                      <p className="muted small">
                                        Missing entities: {run.score.missing_entities.join(", ")}
                                      </p>
                                    ) : null}
                                    {run.score.missing_reminders?.length ? (
                                      <p className="muted small">
                                        Missing reminders: {run.score.missing_reminders.join(", ")}
                                      </p>
                                    ) : null}
                                    {run.score.search_misses?.length ? (
                                      <p className="muted small">
                                        Search misses: {run.score.search_misses.join(", ")}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="muted small">No feedback saved for this capture yet.</p>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="label">Recent Mini runs</div>
                  <p className="muted small">Inspect a run only when you need raw output or schema details.</p>
                  <div className="suggestion-list" style={{ marginTop: 10 }}>
                    {selected.analysis_runs?.length ? (
                      selected.analysis_runs.map((run) => (
                        <div
                          className={`suggestion-item ${run.id === selectedRun?.id ? "selected-run" : ""}`}
                          key={run.id}
                        >
                          <div className="toolbar">
                            <strong>{run.model_route ?? run.model}</strong>{" "}
                            <span className="muted small">
                              {run.is_canonical ? "canonical" : "comparison"} · {run.status}
                            </span>
                          </div>
                          <p className="muted small">
                            {run.latency_ms ? `${run.latency_ms} ms` : "No latency"} ·{" "}
                            {new Date(run.created_at).toLocaleString()}
                          </p>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedRunId(run.id);
                              setInspectedRunId((current) => (current === run.id ? "" : run.id));
                            }}
                          >
                            Inspect output
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted small">No runs yet.</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}

          </div>
        ) : (
          <div className="empty">Select a capture to inspect analysis output.</div>
        )}
      </aside>
    </div>
  );
}
