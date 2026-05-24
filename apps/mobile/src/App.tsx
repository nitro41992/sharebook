import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { clearSharedPayloads, useIncomingShare } from "expo-sharing";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { intentCategories, intentLabels, type IntentCategory } from "@sharebook/shared";

declare const process: {
  env: Record<string, string | undefined>;
};

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
  display_title: string | null;
  title: string | null;
  source_app: string | null;
  source_url: string | null;
  source_text: string | null;
  capture_type: string;
  analysis_state: string;
  analysis_error: string | null;
  default_intent: IntentCategory | null;
  default_intent_confidence: number | null;
  current_save_intent: IntentCategory | null;
  intent_rationale: string | null;
  thumbnail_url: string | null;
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
  match_context: string;
  match_signal: string;
  score: number;
  capture?: Capture;
  captures?: Capture;
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
    past_reminders?: string[];
    reminder_pass?: boolean;
    search_misses?: string[];
    generated_search_phrase_hits?: string[];
    search_pass?: boolean;
    broad_collection_suggestions?: string[];
  };
  created_at: string;
};

type EvalFixture = {
  id: string;
  label: string | null;
  expected_intent: IntentCategory | null;
  required_entities: string[];
  expected_reminders: string[];
  search_queries: string[];
  notes: string | null;
  eval_runs?: EvalRun[];
};

type QualityReport = {
  total_feedback: number;
  issue_counts: Record<string, number>;
  comments: Array<{ label: string; comment: string }>;
  product_signal_themes: Array<{
    theme: string;
    count: number;
    recommendation: string;
    examples: Array<{ label: string; comment: string }>;
  }>;
  prompt_suggestions: Array<{
    pattern: string;
    proposed_prompt_wording: string;
    risk: string;
    expected_improvement: string;
  }>;
};

type CaptureDraft = {
  sourceUrl: string;
  sourceText: string;
  asset?: {
    uri: string;
    name: string;
    type: string;
  } | null;
};

const feedbackIssues = [
  { id: "wrong_intent", label: "Wrong intent" },
  { id: "missing_entity", label: "Missing entity" },
  { id: "wrong_entity", label: "Wrong entity" },
  { id: "missing_reminder", label: "Missing reminder" },
  { id: "bad_reminder", label: "Bad reminder" },
  { id: "misleading_rationale", label: "Misleading rationale" },
  { id: "bad_suggested_action", label: "Bad action" },
  { id: "search_would_fail", label: "Search would fail" }
] as const;

type FeedbackIssue = (typeof feedbackIssues)[number]["id"];
type Screen = "home" | "detail" | "qualityReport";
type DetailTab = "review" | "quality" | "source" | "debug";

const pageSize = 25;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const apiBaseUrl = (process.env.EXPO_PUBLIC_SHAREBOOK_API_URL ?? "").replace(/\/$/, "");
const authRedirectUrl = "sharebook://auth/callback";

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock
  }
});

function captureTitle(capture: Capture) {
  return (
    capture.display_title ||
    capture.title ||
    capture.source_url ||
    capture.source_text ||
    "Untitled capture"
  );
}

function activeIntent(capture: Capture | null | undefined) {
  return capture?.current_save_intent || capture?.default_intent || null;
}

function labelForIntent(intent: IntentCategory | null | undefined) {
  return intent ? intentLabels[intent] : "Pending";
}

function confidenceText(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "No confidence";
}

function extractUrl(value: string) {
  return value.match(/https?:\/\/\S+/i)?.[0] ?? "";
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

function stringify(value: unknown) {
  if (value == null || value === "") return "None recorded.";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function parseFeedbackNotes(notes: string | null) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as {
      kind?: string;
      looksRight?: boolean;
      issues?: string[];
      comment?: string;
    };
    return parsed.kind === "mini_feedback" ? parsed : null;
  } catch {
    return null;
  }
}

function getAuthCallbackParams(url: string) {
  const params = new URLSearchParams();
  const parsed = new URL(url);
  for (const source of [parsed.search, parsed.hash]) {
    const normalized = source.replace(/^[?#]/, "");
    if (!normalized) continue;
    new URLSearchParams(normalized).forEach((value, key) => params.set(key, value));
  }
  return params;
}

async function createSessionFromAuthUrl(url: string) {
  const params = getAuthCallbackParams(url);
  const error = params.get("error_description") || params.get("error") || params.get("error_code");
  if (error) throw new Error(error);

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) throw sessionError;
    return data.session;
  }

  const code = params.get("code");
  if (code) {
    const { data, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
    if (codeError) throw codeError;
    return data.session;
  }

  return null;
}

async function apiFetch(path: string, session: Session, init: RequestInit = {}) {
  if (!apiBaseUrl) throw new Error("Missing EXPO_PUBLIC_SHAREBOOK_API_URL.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.access_token}`);
  if (!(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(json.error ?? `Request failed: ${response.status}`);
  return json;
}

function StatusPill({ state }: { state: string }) {
  const style =
    state === "ready"
      ? styles.pillReady
      : state === "failed"
        ? styles.pillBad
        : state === "needs_review" || state === "partial"
          ? styles.pillWarn
          : state === "processing"
            ? styles.pillProcessing
            : styles.pillNeutral;
  return <Text style={[styles.pill, style]}>{state}</Text>;
}

function PillButton({
  label,
  active,
  disabled,
  onPress
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choicePill,
        active && styles.choicePillActive,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingAction, setLoadingAction] = useState<"password" | "magic" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendMagicLink() {
    setLoadingAction("magic");
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: authRedirectUrl,
        shouldCreateUser: false
      }
    });
    setLoadingAction(null);

    if (result.error) {
      Alert.alert("Could not send link", result.error.message);
      return;
    }
    setSentTo(email);
  }

  async function signInWithPassword() {
    setLoadingAction("password");
    const result = await supabase.auth.signInWithPassword({ email, password });
    setLoadingAction(null);

    if (result.error) {
      Alert.alert("Could not sign in", result.error.message);
    }
  }

  const loading = loadingAction !== null;

  return (
    <View style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.authShell}
      >
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.authIntro}>
            <Text style={styles.mark}>S</Text>
            <Text style={styles.title}>Sharebook</Text>
            <Text style={styles.subtitle}>Save from your phone. Review why it mattered.</Text>
          </View>
          <View style={styles.formStack}>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              disabled={loading || !email || !password}
              onPress={signInWithPassword}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.authButton,
                (pressed || loading) && styles.pressed,
                (!email || !password) && styles.disabled
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {loadingAction === "password" ? "Signing in..." : "Sign in with password"}
              </Text>
            </Pressable>
            <Pressable
              disabled={loading || !email}
              onPress={sendMagicLink}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.authButton,
                (pressed || loadingAction === "magic") && styles.pressed,
                !email && styles.disabled
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {loadingAction === "magic" ? "Sending..." : "Send magic link"}
              </Text>
            </Pressable>
            <Text style={styles.authNotice}>
              {sentTo
                ? `Check ${sentTo}. Open the link on this phone.`
                : "Use the same email you use on the web dashboard."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function App() {
  const incomingShare = useIncomingShare();
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [captureDetails, setCaptureDetails] = useState<Record<string, Capture>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaptureDraft>({
    sourceUrl: "",
    sourceText: "",
    asset: null
  });
  const [loading, setLoading] = useState(true);
  const [loadingCaptures, setLoadingCaptures] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [showAccount, setShowAccount] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("review");
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<EvalFixture[]>([]);
  const [fixtureStatus, setFixtureStatus] = useState("");
  const [evalStatus, setEvalStatus] = useState("");
  const [editingFeedbackId, setEditingFeedbackId] = useState("");
  const [intentUpdatingId, setIntentUpdatingId] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [reportStatus, setReportStatus] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState({
    looksRight: true,
    issues: [] as FeedbackIssue[],
    correctedIntent: "",
    requiredEntities: "",
    expectedReminders: "",
    searchQueries: "",
    comment: ""
  });

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return captureDetails[selectedId] ?? captures.find((capture) => capture.id === selectedId) ?? null;
  }, [captureDetails, captures, selectedId]);

  const selectedRun = selected?.analysis_runs?.[0] ?? null;
  const selectedPreview = selected?.capture_assets?.find((asset) =>
    asset.mime_type?.startsWith("image/")
  );
  const selectedActions = useMemo(() => {
    const fromCapture = selected?.suggested_actions ?? [];
    if (fromCapture.length) return fromCapture;
    const output =
      selectedRun?.repaired_output && typeof selectedRun.repaired_output === "object"
        ? (selectedRun.repaired_output as { suggested_actions?: unknown })
        : null;
    return Array.isArray(output?.suggested_actions)
      ? output.suggested_actions.filter(
          (action): action is { type: string; label: string; rationale: string; confidence: number } =>
            Boolean(action && typeof action === "object")
        )
      : [];
  }, [selected, selectedRun]);

  const hasEntityIssue =
    feedbackDraft.issues.includes("missing_entity") || feedbackDraft.issues.includes("wrong_entity");
  const hasReminderIssue =
    feedbackDraft.issues.includes("missing_reminder") || feedbackDraft.issues.includes("bad_reminder");
  const hasSearchIssue = feedbackDraft.issues.includes("search_would_fail");

  const mergeCapture = useCallback((capture: Capture) => {
    setCaptureDetails((current) => ({ ...current, [capture.id]: capture }));
    setCaptures((current) => {
      const exists = current.some((item) => item.id === capture.id);
      const next = exists
        ? current.map((item) => (item.id === capture.id ? { ...item, ...capture } : item))
        : [capture, ...current];
      return next.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    });
  }, []);

  const resetFeedbackDraft = useCallback((capture: Capture | null) => {
    setEditingFeedbackId("");
    setFeedbackDraft({
      looksRight: true,
      issues: [],
      correctedIntent: activeIntent(capture) ?? "",
      requiredEntities: listToLines(
        capture?.captured_entities?.slice(0, 4).map((entity) => entity.display_name)
      ),
      expectedReminders: "",
      searchQueries: "",
      comment: ""
    });
  }, []);

  const loadFixtures = useCallback(
    async (captureId = selectedId) => {
      if (!captureId || !session) return;
      try {
        const json = await apiFetch(
          `/api/evals/fixtures?captureId=${encodeURIComponent(captureId)}`,
          session
        );
        setFixtures(json.fixtures ?? []);
      } catch (error) {
        setEvalStatus(error instanceof Error ? error.message : "Could not load fixtures");
      }
    },
    [selectedId, session]
  );

  const loadCaptureDetail = useCallback(
    async (captureId: string, activeSession = session) => {
      if (!activeSession) return null;
      setLoadingDetailId(captureId);
      try {
        const json = await apiFetch(
          `/api/captures?view=detail&captureId=${encodeURIComponent(captureId)}`,
          activeSession
        );
        const capture = json.capture as Capture;
        mergeCapture(capture);
        resetFeedbackDraft(capture);
        setFixtureStatus("");
        setEvalStatus("");
        await loadFixtures(captureId);
        return capture;
      } catch (error) {
        Alert.alert("Could not load capture", error instanceof Error ? error.message : "Unknown error");
        return null;
      } finally {
        setLoadingDetailId(null);
      }
    },
    [loadFixtures, mergeCapture, resetFeedbackDraft, session]
  );

  const refreshCaptures = useCallback(
    async (activeSession = session) => {
      if (!activeSession) return;
      setLoadingCaptures(true);
      setRefreshing(true);
      try {
        const json = await apiFetch(`/api/captures?view=summary&limit=${pageSize}`, activeSession);
        setCaptures(json.captures ?? []);
        setNextCursor(json.nextCursor ?? null);
      } catch (error) {
        Alert.alert("Could not load captures", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setLoadingCaptures(false);
        setRefreshing(false);
      }
    },
    [session]
  );

  useEffect(() => {
    let mounted = true;
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    async function handleAuthUrl(url: string) {
      try {
        const nextSession = await createSessionFromAuthUrl(url);
        if (nextSession && mounted) setSession(nextSession);
      } catch (error) {
        Alert.alert("Could not finish sign in", error instanceof Error ? error.message : "Unknown error");
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      handleAuthUrl(url);
    });
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      mounted = false;
      appStateSubscription.remove();
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) refreshCaptures(session);
  }, [refreshCaptures, session]);

  useEffect(() => {
    const shared = incomingShare.resolvedSharedPayloads?.[0] as
      | {
          contentType?: string | null;
          contentUri?: string | null;
          contentMimeType?: string | null;
          originalName?: string | null;
        }
      | undefined;
    const raw = incomingShare.sharedPayloads?.[0] as
      | { value?: string; mimeType?: string; shareType?: string }
      | undefined;
    if (!shared && !raw) return;

    const rawValue = raw?.value ?? "";
    const sharedUrl = shared?.contentType === "website" ? shared.contentUri ?? "" : "";
    const sourceUrl = sharedUrl || extractUrl(rawValue);
    const isImage = shared?.contentType === "image" && shared.contentUri;
    setDraft({
      sourceUrl,
      sourceText: sourceUrl ? rawValue.replace(sourceUrl, "").trim() : rawValue,
      asset: isImage
        ? {
            uri: shared.contentUri!,
            name: shared.originalName ?? "shared-image.jpg",
            type: shared.contentMimeType ?? "image/jpeg"
          }
        : null
    });
  }, [incomingShare.resolvedSharedPayloads, incomingShare.sharedPayloads]);

  async function loadMoreCaptures() {
    if (!session || !nextCursor || loadingMore || loadingCaptures) return;
    setLoadingMore(true);
    try {
      const json = await apiFetch(
        `/api/captures?view=summary&limit=${pageSize}&cursor=${encodeURIComponent(nextCursor)}`,
        session
      );
      setCaptures((current) => {
        const seen = new Set(current.map((capture) => capture.id));
        const additions = ((json.captures ?? []) as Capture[]).filter((capture) => !seen.has(capture.id));
        return [...current, ...additions];
      });
      setNextCursor(json.nextCursor ?? null);
    } catch (error) {
      Alert.alert("Could not load more", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openCapture(captureId: string) {
    setSelectedId(captureId);
    setScreen("detail");
    setDetailTab("review");
    setFixtureStatus("");
    setEvalStatus("");
    await loadCaptureDetail(captureId);
  }

  async function runSearch() {
    if (!session) return;
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const json = await apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`, session);
      setSearchResults(json.results ?? []);
    } catch (error) {
      Alert.alert("Search failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSearching(false);
    }
  }

  async function analyzeCapture(captureId: string, activeSession = session) {
    if (!activeSession) return;
    setAnalyzingIds((current) => new Set(current).add(captureId));
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === captureId
          ? { ...capture, analysis_state: "processing", analysis_error: null }
          : capture
      )
    );
    setCaptureDetails((current) => {
      const existing = current[captureId];
      return existing
        ? {
            ...current,
            [captureId]: { ...existing, analysis_state: "processing", analysis_error: null }
          }
        : current;
    });

    try {
      await apiFetch("/api/analyze", activeSession, {
        method: "POST",
        body: JSON.stringify({ captureId, route: "openai_mini" })
      });
      await loadCaptureDetail(captureId, activeSession);
    } catch (error) {
      Alert.alert("Analysis failed", error instanceof Error ? error.message : "Unknown error");
      await loadCaptureDetail(captureId, activeSession);
    } finally {
      setAnalyzingIds((current) => {
        const next = new Set(current);
        next.delete(captureId);
        return next;
      });
    }
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setDraft((current) => ({
      ...current,
      asset: {
        uri: asset.uri,
        name: asset.fileName ?? "capture.jpg",
        type: asset.mimeType ?? "image/jpeg"
      }
    }));
  }

  async function saveCapture() {
    if (!session) return;
    if (!draft.sourceUrl.trim() && !draft.sourceText.trim() && !draft.asset) {
      Alert.alert("Nothing to save", "Add a link, text, or image first.");
      return;
    }
    setSaving(true);
    const form = new FormData();
    if (draft.sourceUrl.trim()) form.append("sourceUrl", draft.sourceUrl.trim());
    if (draft.sourceText.trim()) form.append("sourceText", draft.sourceText.trim());
    if (draft.asset) {
      form.append("asset", {
        uri: draft.asset.uri,
        name: draft.asset.name,
        type: draft.asset.type
      } as unknown as Blob);
    }

    try {
      const json = await apiFetch("/api/captures", session, {
        method: "POST",
        body: form
      });
      const capture = json.capture as Capture;
      setDraft({ sourceUrl: "", sourceText: "", asset: null });
      clearSharedPayloads();
      mergeCapture(capture);
      setSelectedId(capture.id);
      setScreen("detail");
      setDetailTab("review");
      await analyzeCapture(capture.id, session);
      await refreshCaptures(session);
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function updateIntent(intent: IntentCategory) {
    if (!session || !selected) return;
    const captureId = selected.id;
    setIntentUpdatingId(captureId);
    try {
      const json = await apiFetch("/api/captures", session, {
        method: "PATCH",
        body: JSON.stringify({ captureId, currentSaveIntent: intent })
      });
      mergeCapture(json.capture as Capture);
      setFeedbackDraft((current) => ({ ...current, correctedIntent: intent }));
    } catch (error) {
      Alert.alert("Could not update intent", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIntentUpdatingId(null);
    }
  }

  async function saveFeedback() {
    if (!session || !selected) return;
    setFixtureStatus(editingFeedbackId ? "Updating feedback..." : "Saving feedback...");
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
    const payload = {
      ...(editingFeedbackId ? { fixtureId: editingFeedbackId } : { captureId: selected.id }),
      label: captureTitle(selected),
      expectedIntent: feedbackDraft.correctedIntent || activeIntent(selected),
      acceptableIntents: [],
      badIntents: [],
      requiredEntities: linesToList(feedbackDraft.requiredEntities),
      expectedReminders: linesToList(feedbackDraft.expectedReminders),
      searchQueries: linesToList(feedbackDraft.searchQueries),
      notes: feedbackNotes
    };
    try {
      const json = await apiFetch("/api/evals/fixtures", session, {
        method: editingFeedbackId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setFixtureStatus(
        `${editingFeedbackId ? "Updated" : "Saved"} feedback ${json.fixture?.id?.slice(0, 8) ?? ""}`
      );
      setEditingFeedbackId("");
      await loadFixtures(selected.id);
    } catch (error) {
      setFixtureStatus(error instanceof Error ? error.message : "Could not save feedback");
    }
  }

  function editFeedback(fixture: EvalFixture) {
    const meta = parseFeedbackNotes(fixture.notes);
    setEditingFeedbackId(fixture.id);
    setFeedbackDraft({
      looksRight: meta?.looksRight ?? !meta?.issues?.length,
      issues: (meta?.issues ?? []).filter((issue): issue is FeedbackIssue =>
        feedbackIssues.some((item) => item.id === issue)
      ),
      correctedIntent: fixture.expected_intent ?? activeIntent(selected) ?? "",
      requiredEntities: listToLines(fixture.required_entities),
      expectedReminders: listToLines(fixture.expected_reminders),
      searchQueries: listToLines(fixture.search_queries),
      comment: meta?.comment ?? fixture.notes ?? ""
    });
    setFixtureStatus(`Editing feedback ${fixture.id.slice(0, 8)}`);
  }

  async function deleteFeedback(fixtureId: string) {
    if (!session || !selected) return;
    Alert.alert("Delete feedback?", "This removes the saved eval fixture.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setFixtureStatus("Deleting feedback...");
          try {
            await apiFetch(`/api/evals/fixtures?fixtureId=${encodeURIComponent(fixtureId)}`, session, {
              method: "DELETE"
            });
            if (editingFeedbackId === fixtureId) resetFeedbackDraft(selected);
            setFixtureStatus("Deleted feedback");
            await loadFixtures(selected.id);
          } catch (error) {
            setFixtureStatus(error instanceof Error ? error.message : "Could not delete feedback");
          }
        }
      }
    ]);
  }

  async function runEval(fixtureId: string) {
    if (!session || !selected) return;
    setEvalStatus("Checking Mini...");
    try {
      const json = await apiFetch("/api/evals/run", session, {
        method: "POST",
        body: JSON.stringify({ fixtureId, modelRoute: "openai_mini" })
      });
      setEvalStatus(json.evalRun?.passed ? "Eval passed" : "Eval needs review");
      await loadFixtures(selected.id);
      await loadCaptureDetail(selected.id);
    } catch (error) {
      setEvalStatus(error instanceof Error ? error.message : "Eval failed");
    }
  }

  async function loadQualityReport() {
    if (!session) return;
    setScreen("qualityReport");
    setReportStatus("Building report...");
    try {
      const json = await apiFetch("/api/evals/quality-report", session);
      setQualityReport(json.report ?? null);
      setReportStatus("Report ready");
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Could not build report");
    }
  }

  function toggleIssue(issue: FeedbackIssue) {
    setFeedbackDraft((current) => {
      const issues = current.issues.includes(issue)
        ? current.issues.filter((item) => item !== issue)
        : [...current.issues, issue];
      return { ...current, issues, looksRight: issues.length === 0 };
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setCaptures([]);
    setCaptureDetails({});
    setSelectedId(null);
    setScreen("home");
    setShowAccount(false);
  }

  async function setAccountPassword() {
    if (newPassword.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords do not match", "Enter the same password twice.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      Alert.alert("Could not set password", error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    Alert.alert("Password saved", "You can now sign in with email and password.");
  }

  function HomeHeader() {
    return (
      <View style={styles.homeHeader}>
        {showAccount ? (
          <View style={styles.accountPanel}>
            <Text style={styles.sectionTitle}>Set password</Text>
            <Text style={styles.bodyText}>Add a password so magic links stay optional.</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="password-new"
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              value={newPassword}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="password-new"
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
            />
            <Pressable
              disabled={savingPassword}
              onPress={setAccountPassword}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                savingPassword && styles.disabled
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {savingPassword ? "Saving..." : "Set password"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.capturePanel}>
          <Text style={styles.sectionTitle}>New capture</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(sourceUrl) => setDraft((current) => ({ ...current, sourceUrl }))}
            placeholder="Paste a link"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.sourceUrl}
          />
          <TextInput
            multiline
            onChangeText={(sourceText) => setDraft((current) => ({ ...current, sourceText }))}
            placeholder="Optional caption, note, or context"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.textArea]}
            value={draft.sourceText}
          />
          <View style={styles.row}>
            <Pressable onPress={pickImage} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {draft.asset ? "Change image" : "Add image"}
              </Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={saveCapture}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                saving && styles.disabled
              ]}
            >
              <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save and analyze"}</Text>
            </Pressable>
          </View>
          {draft.asset ? <Text style={styles.meta}>Attached: {draft.asset.name}</Text> : null}
        </View>

        <View style={styles.searchPanel}>
          <Text style={styles.sectionTitle}>Search</Text>
          <View style={styles.row}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              placeholder="Search memory, entities, notes, or intent"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.flexInput]}
              value={query}
            />
            <Pressable
              disabled={searching}
              onPress={runSearch}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.smallButton,
                pressed && styles.pressed,
                searching && styles.disabled
              ]}
            >
              <Text style={styles.secondaryButtonText}>{searching ? "..." : "Go"}</Text>
            </Pressable>
          </View>
          {searchResults.length ? (
            <View style={styles.searchResults}>
              {searchResults.slice(0, 5).map((result) => {
                const resultCapture = result.capture ?? result.captures;
                return (
                  <Pressable
                    key={`${result.capture_id}-${result.id}`}
                    onPress={() => openCapture(result.capture_id)}
                    style={({ pressed }) => [styles.searchResult, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.searchTitle}>
                      {resultCapture ? captureTitle(resultCapture) : result.capture_id.slice(0, 8)}
                    </Text>
                    <Text numberOfLines={2} style={styles.meta}>
                      {result.match_context}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : query.trim() ? (
            <Text style={styles.empty}>No visible search matches yet.</Text>
          ) : null}
        </View>

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent captures</Text>
            <Text style={styles.meta}>{captures.length} loaded</Text>
          </View>
          <Pressable onPress={loadQualityReport} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Quality report</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function CaptureRow({ item }: { item: Capture }) {
    const intent = activeIntent(item);
    return (
      <Pressable
        onPress={() => openCapture(item.id)}
        style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
      >
        <View style={styles.captureRowTop}>
          <Text numberOfLines={2} style={styles.captureTitle}>
            {captureTitle(item)}
          </Text>
          <StatusPill state={item.analysis_state} />
        </View>
        <View style={styles.inlineMeta}>
          <Text style={styles.intentText}>{labelForIntent(intent)}</Text>
          <Text style={styles.meta}> · {item.capture_type}</Text>
          {item.source_app ? <Text style={styles.meta}> · {item.source_app}</Text> : null}
        </View>
        {item.analysis_error ? (
          <Text numberOfLines={2} style={styles.errorText}>
            {item.analysis_error}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  function renderHome() {
    return (
      <FlatList
        contentContainerStyle={styles.content}
        data={captures}
        keyExtractor={(capture) => capture.id}
        ListHeaderComponent={<HomeHeader />}
        ListEmptyComponent={
          loadingCaptures ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.meta}>Loading recent captures...</Text>
            </View>
          ) : (
            <Text style={styles.empty}>Share or paste something to start the dogfood loop.</Text>
          )
        }
        ListFooterComponent={
          nextCursor ? (
            <Pressable
              disabled={loadingMore}
              onPress={loadMoreCaptures}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.footerButton,
                pressed && styles.pressed,
                loadingMore && styles.disabled
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {loadingMore ? "Loading..." : "Load more"}
              </Text>
            </Pressable>
          ) : captures.length ? (
            <Text style={styles.endText}>End of loaded captures</Text>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refreshCaptures()} />
        }
        renderItem={({ item }) => <CaptureRow item={item} />}
      />
    );
  }

  function renderReviewTab(capture: Capture) {
    const intent = activeIntent(capture);
    return (
      <View style={styles.detailStack}>
        {capture.analysis_error ? (
          <View style={styles.panel}>
            <Text style={styles.subhead}>Last analysis error</Text>
            <Text style={styles.errorText}>{capture.analysis_error}</Text>
          </View>
        ) : null}
        <View style={styles.panel}>
          <Text style={styles.subhead}>Predicted intent</Text>
          <View style={styles.intentSummary}>
            <Text style={styles.intentLabel}>{labelForIntent(intent)}</Text>
            <Text style={styles.meta}>{confidenceText(capture.default_intent_confidence)}</Text>
          </View>
          <Text style={styles.bodyText}>
            {capture.intent_rationale || "Analysis has not produced a rationale yet."}
          </Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Intent correction</Text>
          <View style={styles.wrapRow}>
            {intentCategories.map((item) => (
              <PillButton
                key={item}
                active={item === capture.current_save_intent}
                disabled={intentUpdatingId === capture.id}
                label={intentLabels[item]}
                onPress={() => updateIntent(item)}
              />
            ))}
          </View>
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Reminders</Text>
          {capture.reminder_suggestions?.length ? (
            capture.reminder_suggestions.map((reminder) => (
              <View style={styles.plainBlock} key={reminder.id}>
                <Text style={styles.blockTitle}>{reminder.trigger_value}</Text>
                <Text style={styles.meta}>{reminder.trigger_type}</Text>
                <Text style={styles.bodyText}>{reminder.rationale}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No reminder suggestion stored.</Text>
          )}
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Entities</Text>
          {capture.captured_entities?.length ? (
            capture.captured_entities.map((entity) => (
              <View style={styles.plainBlock} key={entity.id}>
                <Text style={styles.blockTitle}>{entity.display_name}</Text>
                <Text style={styles.meta}>
                  {entity.entity_type} · {Math.round(entity.confidence * 100)}%
                </Text>
                {entity.evidence ? <Text style={styles.bodyText}>{entity.evidence}</Text> : null}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No entities extracted yet.</Text>
          )}
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Suggested actions</Text>
          {selectedActions.length ? (
            selectedActions.map((action, index) => (
              <View style={styles.plainBlock} key={`${action.type}-${index}`}>
                <Text style={styles.blockTitle}>{action.label || action.type}</Text>
                <Text style={styles.bodyText}>{action.rationale}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No suggested actions recorded.</Text>
          )}
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Collections</Text>
          {capture.collection_suggestions?.length ? (
            capture.collection_suggestions.map((collection) => (
              <View style={styles.plainBlock} key={collection.id}>
                <Text style={styles.blockTitle}>{collection.name}</Text>
                <Text style={styles.bodyText}>{collection.rationale}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No collection suggestion stored.</Text>
          )}
        </View>
      </View>
    );
  }

  function renderQualityTab(capture: Capture) {
    return (
      <View style={styles.detailStack}>
        <View style={styles.panel}>
          <View style={styles.captureRowTop}>
            <Text style={styles.subhead}>Mini feedback</Text>
            {editingFeedbackId ? <Text style={[styles.pill, styles.pillWarn]}>editing</Text> : null}
          </View>
          <Pressable
            onPress={() =>
              setFeedbackDraft((current) => ({
                ...current,
                looksRight: !current.looksRight,
                issues: !current.looksRight ? [] : current.issues
              }))
            }
            style={styles.checkRow}
          >
            <View style={[styles.checkbox, feedbackDraft.looksRight && styles.checkboxChecked]} />
            <Text style={styles.bodyStrong}>Looks right</Text>
          </Pressable>
          <View style={styles.wrapRow}>
            {feedbackIssues.map((issue) => (
              <PillButton
                key={issue.id}
                active={feedbackDraft.issues.includes(issue.id)}
                label={issue.label}
                onPress={() => toggleIssue(issue.id)}
              />
            ))}
          </View>
          {feedbackDraft.issues.includes("wrong_intent") ? (
            <View>
              <Text style={styles.label}>Correct intent</Text>
              <View style={styles.wrapRow}>
                {intentCategories.map((intent) => (
                  <PillButton
                    key={intent}
                    active={feedbackDraft.correctedIntent === intent}
                    label={intentLabels[intent]}
                    onPress={() =>
                      setFeedbackDraft((current) => ({ ...current, correctedIntent: intent }))
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
          {hasEntityIssue ? (
            <TextInput
              multiline
              onChangeText={(requiredEntities) =>
                setFeedbackDraft((current) => ({ ...current, requiredEntities }))
              }
              placeholder="Expected entities, one per line"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.compactArea]}
              value={feedbackDraft.requiredEntities}
            />
          ) : null}
          {hasReminderIssue ? (
            <TextInput
              multiline
              onChangeText={(expectedReminders) =>
                setFeedbackDraft((current) => ({ ...current, expectedReminders }))
              }
              placeholder="Expected reminders"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.compactArea]}
              value={feedbackDraft.expectedReminders}
            />
          ) : null}
          {hasSearchIssue ? (
            <TextInput
              multiline
              onChangeText={(searchQueries) =>
                setFeedbackDraft((current) => ({ ...current, searchQueries }))
              }
              placeholder="Search queries that should find this"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.compactArea]}
              value={feedbackDraft.searchQueries}
            />
          ) : null}
          <TextInput
            multiline
            onChangeText={(comment) => setFeedbackDraft((current) => ({ ...current, comment }))}
            placeholder="Optional comment"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.compactArea]}
            value={feedbackDraft.comment}
          />
          <View style={styles.row}>
            <Pressable onPress={saveFeedback} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {editingFeedbackId ? "Update feedback" : "Save feedback"}
              </Text>
            </Pressable>
            {editingFeedbackId ? (
              <Pressable onPress={() => resetFeedbackDraft(capture)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
          {fixtureStatus ? <Text style={styles.meta}>{fixtureStatus}</Text> : null}
          {evalStatus ? <Text style={styles.meta}>{evalStatus}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.subhead}>Saved feedback</Text>
          {fixtures.length ? (
            fixtures.map((fixture) => {
              const meta = parseFeedbackNotes(fixture.notes);
              return (
                <View style={styles.plainBlock} key={fixture.id}>
                  <Text style={styles.blockTitle}>
                    {fixture.label || `Feedback ${fixture.id.slice(0, 8)}`}
                  </Text>
                  {fixture.expected_intent ? (
                    <Text style={styles.intentText}>{intentLabels[fixture.expected_intent]}</Text>
                  ) : null}
                  {meta?.issues?.length ? (
                    <Text style={styles.meta}>Issues: {meta.issues.join(", ")}</Text>
                  ) : meta?.looksRight ? (
                    <Text style={styles.meta}>Looks right</Text>
                  ) : null}
                  {meta?.comment ? <Text style={styles.bodyText}>{meta.comment}</Text> : null}
                  <Text style={styles.meta}>
                    {fixture.required_entities.length} entities · {fixture.expected_reminders.length} reminders ·{" "}
                    {fixture.search_queries.length} search queries
                  </Text>
                  <View style={styles.wrapRow}>
                    <PillButton label="Test current prompt" onPress={() => runEval(fixture.id)} />
                    <PillButton label="Edit" onPress={() => editFeedback(fixture)} />
                    <PillButton label="Delete" onPress={() => deleteFeedback(fixture.id)} />
                  </View>
                  {fixture.eval_runs?.slice(0, 3).map((run) => (
                    <View style={styles.evalRun} key={run.id}>
                      <Text style={run.passed ? styles.intentText : styles.warnText}>
                        {run.passed ? "passed" : "review"} · {run.model_route}
                      </Text>
                      <Text style={styles.meta}>
                        intent {run.score.intent_pass ? "ok" : "miss"} · entities{" "}
                        {run.score.entity_pass ? "ok" : "miss"} · reminders{" "}
                        {run.score.reminder_pass ? "ok" : "miss"} · search{" "}
                        {run.score.search_pass ? "ok" : "miss"}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>No feedback saved for this capture yet.</Text>
          )}
        </View>
      </View>
    );
  }

  function renderSourceTab(capture: Capture) {
    const previewUrl = selectedPreview?.signed_url || selectedPreview?.public_url || capture.thumbnail_url;
    return (
      <View style={styles.detailStack}>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Source preview</Text>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={styles.preview} resizeMode="cover" />
          ) : (
            <Text style={styles.empty}>No image preview for this capture.</Text>
          )}
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Source URL</Text>
          <Text style={styles.bodyText}>{capture.source_url || "None"}</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.subhead}>Source text</Text>
          <Text style={styles.bodyText}>{capture.source_text || "None"}</Text>
        </View>
      </View>
    );
  }

  function renderDebugTab(capture: Capture) {
    return (
      <View style={styles.detailStack}>
        {capture.analysis_runs?.length ? (
          capture.analysis_runs.map((run) => (
            <View style={styles.panel} key={run.id}>
              <View style={styles.captureRowTop}>
                <Text style={styles.subhead}>{run.model_route ?? run.model}</Text>
                <Text style={[styles.pill, run.status === "failed" ? styles.pillBad : styles.pillReady]}>
                  {run.status ?? "unknown"}
                </Text>
              </View>
              <Text style={styles.meta}>
                {run.is_canonical ? "canonical" : "comparison"} ·{" "}
                {run.latency_ms ? `${run.latency_ms} ms` : "No latency"} ·{" "}
                {new Date(run.created_at).toLocaleString()}
              </Text>
              <Text style={styles.label}>Prompt/schema</Text>
              <Text style={styles.bodyText}>
                {run.prompt_version} · {run.schema_version}
              </Text>
              <Text style={styles.label}>Schema errors</Text>
              <Text style={styles.codeText}>{stringify(run.schema_errors)}</Text>
              <Text style={styles.label}>Raw model output</Text>
              <Text numberOfLines={12} style={styles.codeText}>
                {stringify(run.raw_model_output)}
              </Text>
              <Text style={styles.label}>Structured output</Text>
              <Text numberOfLines={12} style={styles.codeText}>
                {stringify(run.extracted_json ?? run.repaired_output)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No runs yet.</Text>
        )}
      </View>
    );
  }

  function renderDetail() {
    if (!selected) {
      return (
        <View style={styles.content}>
          <Text style={styles.empty}>Select a capture to inspect analysis output.</Text>
        </View>
      );
    }
    const isAnalyzing = analyzingIds.has(selected.id);
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loadingDetailId === selected.id} onRefresh={() => loadCaptureDetail(selected.id)} />
        }
      >
        <View style={styles.detailHero}>
          <View style={styles.captureRowTop}>
            <Pressable onPress={() => setScreen("home")} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Back</Text>
            </Pressable>
            <StatusPill state={selected.analysis_state} />
          </View>
          <Text style={styles.detailTitle}>{captureTitle(selected)}</Text>
          <View style={styles.inlineMeta}>
            <Text style={styles.intentText}>{labelForIntent(activeIntent(selected))}</Text>
            <Text style={styles.meta}> · {selected.capture_type}</Text>
            {selected.source_app ? <Text style={styles.meta}> · {selected.source_app}</Text> : null}
          </View>
          <Pressable
            disabled={isAnalyzing}
            onPress={() => analyzeCapture(selected.id)}
            style={({ pressed }) => [
              styles.primaryButton,
              styles.fullWidthButton,
              pressed && styles.pressed,
              isAnalyzing && styles.disabled
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isAnalyzing ? "Analyzing..." : selected.analysis_state === "failed" ? "Retry analysis" : "Run Mini analysis"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.tabs}>
          {(["review", "quality", "source", "debug"] as DetailTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setDetailTab(tab)}
              style={[styles.tab, detailTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, detailTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>
        {detailTab === "review" ? renderReviewTab(selected) : null}
        {detailTab === "quality" ? renderQualityTab(selected) : null}
        {detailTab === "source" ? renderSourceTab(selected) : null}
        {detailTab === "debug" ? renderDebugTab(selected) : null}
      </ScrollView>
    );
  }

  function renderQualityReport() {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailHero}>
          <Pressable onPress={() => setScreen("home")} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <Text style={styles.detailTitle}>Quality report</Text>
          <Text style={styles.bodyText}>
            {qualityReport
              ? `${qualityReport.total_feedback} saved feedback items`
              : reportStatus || "No report loaded yet."}
          </Text>
          <Pressable onPress={loadQualityReport} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Refresh report</Text>
          </Pressable>
        </View>
        {qualityReport ? (
          <View style={styles.detailStack}>
            <View style={styles.panel}>
              <Text style={styles.subhead}>Issue counts</Text>
              <Text style={styles.codeText}>{stringify(qualityReport.issue_counts)}</Text>
            </View>
            {qualityReport.product_signal_themes.map((theme) => (
              <View style={styles.panel} key={theme.theme}>
                <Text style={styles.blockTitle}>
                  {theme.theme} ({theme.count})
                </Text>
                <Text style={styles.bodyText}>{theme.recommendation}</Text>
                {theme.examples.slice(0, 2).map((example) => (
                  <Text style={styles.meta} key={`${theme.theme}-${example.label}`}>
                    {example.label}: {example.comment}
                  </Text>
                ))}
              </View>
            ))}
            {qualityReport.prompt_suggestions.map((suggestion) => (
              <View style={styles.panel} key={suggestion.pattern}>
                <Text style={styles.blockTitle}>{suggestion.pattern}</Text>
                <Text style={styles.bodyText}>{suggestion.proposed_prompt_wording}</Text>
                <Text style={styles.meta}>Risk: {suggestion.risk}</Text>
                <Text style={styles.meta}>Expected: {suggestion.expected_improvement}</Text>
              </View>
            ))}
          </View>
        ) : reportStatus === "Building report..." ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.meta}>{reportStatus}</Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (loading && !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <View style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Sharebook 0A</Text>
            <Text style={styles.screenTitle}>
              {screen === "detail" ? "Capture review" : screen === "qualityReport" ? "Quality" : "Phone capture"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setShowAccount((current) => !current)} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Account</Text>
            </Pressable>
            <Pressable onPress={signOut} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
        {screen === "home" ? renderHome() : null}
        {screen === "detail" ? renderDetail() : null}
        {screen === "qualityReport" ? renderQualityReport() : null}
      </View>
    </View>
  );
}

const colors = {
  paper: "#f7f4ee",
  panel: "#ede8de",
  panelStrong: "#ded7ca",
  input: "#fbf8f2",
  ink: "#211f1b",
  muted: "#797166",
  line: "#d4cabd",
  accent: "#3d6f62",
  accentDark: "#234b42",
  readyBg: "#dce9df",
  readyText: "#214b35",
  processingBg: "#e4e0d6",
  processingText: "#5f574a",
  warnBg: "#efe3c3",
  warnText: "#6f5321",
  badBg: "#ead8d0",
  badText: "#793b2f"
};

const styles = StyleSheet.create({
  safe: {
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 0 : 0,
    flex: 1,
    backgroundColor: colors.paper
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: "center",
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 0 : 0
  },
  authShell: {
    flex: 1
  },
  authContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingBottom: 44,
    paddingHorizontal: 24,
    paddingTop: 54
  },
  authIntro: {
    marginBottom: 56
  },
  shell: {
    flex: 1
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  homeHeader: {
    gap: 16
  },
  mark: {
    alignSelf: "flex-start",
    backgroundColor: colors.ink,
    borderRadius: 18,
    color: colors.paper,
    fontSize: 18,
    fontWeight: "800",
    height: 36,
    lineHeight: 36,
    marginBottom: 18,
    overflow: "hidden",
    textAlign: "center",
    width: 36
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 10
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    maxWidth: 320
  },
  formStack: {
    gap: 12
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14
  },
  flexInput: {
    flex: 1
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  compactArea: {
    marginTop: 12,
    minHeight: 76,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16
  },
  authButton: {
    flex: 0,
    width: "100%"
  },
  authNotice: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  primaryButtonText: {
    color: "#f8f4ec",
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16
  },
  smallButton: {
    minWidth: 58
  },
  footerButton: {
    marginTop: 16
  },
  fullWidthButton: {
    flex: 0,
    marginTop: 16,
    width: "100%"
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  textButton: {
    padding: 8
  },
  textButtonLabel: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "800"
  },
  disabled: {
    opacity: 0.45
  },
  pressed: {
    opacity: 0.72
  },
  capturePanel: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    gap: 12,
    padding: 14
  },
  accountPanel: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    gap: 12,
    padding: 14
  },
  searchPanel: {
    gap: 12
  },
  searchResults: {
    gap: 8
  },
  searchResult: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10
  },
  searchTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  captureRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14
  },
  captureRowTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21
  },
  detailHero: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 18
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 29,
    marginTop: 14,
    marginBottom: 8
  },
  detailStack: {
    gap: 14,
    marginTop: 14
  },
  panel: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 14
  },
  subhead: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase"
  },
  bodyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  bodyStrong: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 8
  },
  errorText: {
    color: colors.badText,
    fontSize: 13,
    lineHeight: 18
  },
  warnText: {
    color: colors.warnText,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  codeText: {
    color: colors.ink,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 12,
    lineHeight: 17
  },
  inlineMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4
  },
  intentText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  intentSummary: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
    marginBottom: 8
  },
  intentLabel: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800"
  },
  plainBlock: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10
  },
  blockTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  evalRun: {
    backgroundColor: colors.input,
    borderRadius: 10,
    marginTop: 8,
    padding: 10
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16
  },
  tab: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tabActive: {
    backgroundColor: colors.accent
  },
  tabText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  tabTextActive: {
    color: colors.paper
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8
  },
  checkbox: {
    borderColor: colors.line,
    borderRadius: 5,
    borderWidth: 1,
    height: 20,
    width: 20
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  choicePill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  choicePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  choicePillText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800"
  },
  choicePillTextActive: {
    color: colors.paper
  },
  preview: {
    aspectRatio: 1,
    backgroundColor: colors.panelStrong,
    borderRadius: 12,
    width: "100%"
  },
  loadingBlock: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24
  },
  endText: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 18,
    textAlign: "center"
  },
  pill: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
    textTransform: "lowercase"
  },
  pillReady: {
    backgroundColor: colors.readyBg,
    color: colors.readyText
  },
  pillProcessing: {
    backgroundColor: colors.processingBg,
    color: colors.processingText
  },
  pillWarn: {
    backgroundColor: colors.warnBg,
    color: colors.warnText
  },
  pillBad: {
    backgroundColor: colors.badBg,
    color: colors.badText
  },
  pillNeutral: {
    backgroundColor: colors.panelStrong,
    color: colors.muted
  }
});
