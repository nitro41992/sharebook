import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { clearSharedPayloads, useIncomingShare } from "expo-sharing";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Linking,
  StatusBar as NativeStatusBar,
  View
} from "react-native";

declare const process: {
  env: Record<string, string | undefined>;
};

type Capture = {
  id: string;
  display_title: string | null;
  title: string | null;
  source_url: string | null;
  source_text: string | null;
  capture_type: string;
  analysis_state: string;
  default_intent: string | null;
  current_save_intent: string | null;
  intent_rationale: string | null;
  created_at: string;
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

type CaptureDraft = {
  sourceUrl: string;
  sourceText: string;
  asset?: {
    uri: string;
    name: string;
    type: string;
  } | null;
};

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

function labelForIntent(intent: string | null) {
  return intent ? intent.replace(/_/g, " ") : "pending";
}

function extractUrl(value: string) {
  return value.match(/https?:\/\/\S+/i)?.[0] ?? "";
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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers
  });
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
        : state === "processing"
          ? styles.pillProcessing
          : styles.pillNeutral;
  return <Text style={[styles.pill, style]}>{state}</Text>;
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendMagicLink() {
    setLoading(true);
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: authRedirectUrl,
        shouldCreateUser: false
      }
    });
    setLoading(false);

    if (result.error) {
      Alert.alert("Could not send link", result.error.message);
      return;
    }
    setSentTo(email);
  }

  return (
    <View style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.authShell}
      >
        <ScrollView
          contentContainerStyle={styles.authContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authIntro}>
            <Text style={styles.mark}>S</Text>
            <Text style={styles.title}>Sharebook</Text>
            <Text style={styles.subtitle}>
              Save from your phone. Review why it mattered.
            </Text>
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
            <Pressable
              disabled={loading || !email}
              onPress={sendMagicLink}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.authButton,
                (pressed || loading) && styles.pressed,
                !email && styles.disabled
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? "Sending..." : "Send magic link"}
              </Text>
            </Pressable>
            {sentTo ? (
              <Text style={styles.authNotice}>
                Check {sentTo}. Open the link on this phone to use the same Sharebook data as web.
              </Text>
            ) : (
              <Text style={styles.authNotice}>
                Use the same email you use on the web dashboard.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function App() {
  const incomingShare = useIncomingShare();
  const [session, setSession] = useState<Session | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaptureDraft>({
    sourceUrl: "",
    sourceText: "",
    asset: null
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) ?? null,
    [captures, selectedId]
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
  }, [session]);

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

  async function refreshCaptures(activeSession = session) {
    if (!activeSession) return;
    setLoading(true);
    try {
      const json = await apiFetch("/api/captures", activeSession);
      setCaptures(json.captures ?? []);
    } catch (error) {
      Alert.alert("Could not load captures", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeCapture(captureId: string, activeSession = session) {
    if (!activeSession) return;
    setAnalyzingId(captureId);
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === captureId
          ? { ...capture, analysis_state: "processing" }
          : capture
      )
    );
    try {
      await apiFetch("/api/analyze", activeSession, {
        method: "POST",
        body: JSON.stringify({ captureId, route: "openai_mini" })
      });
      await refreshCaptures(activeSession);
    } catch (error) {
      Alert.alert("Analysis failed", error instanceof Error ? error.message : "Unknown error");
      await refreshCaptures(activeSession);
    } finally {
      setAnalyzingId(null);
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
      setDraft({ sourceUrl: "", sourceText: "", asset: null });
      clearSharedPayloads();
      setSelectedId(json.capture.id);
      await refreshCaptures(session);
      await analyzeCapture(json.capture.id, session);
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setCaptures([]);
    setSelectedId(null);
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
            <Text style={styles.screenTitle}>Phone capture</Text>
          </View>
          <Pressable onPress={signOut} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => refreshCaptures()} />
          }
        >
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
                <Text style={styles.primaryButtonText}>
                  {saving ? "Saving..." : "Save and analyze"}
                </Text>
              </Pressable>
            </View>
            {draft.asset ? <Text style={styles.meta}>Attached: {draft.asset.name}</Text> : null}
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Recent captures</Text>
            <Text style={styles.meta}>{captures.length} total</Text>
          </View>

          {captures.length ? (
            <FlatList
              data={captures}
              keyExtractor={(capture) => capture.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedId(item.id === selectedId ? null : item.id)}
                  style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
                >
                  <View style={styles.captureRowTop}>
                    <Text numberOfLines={2} style={styles.captureTitle}>
                      {captureTitle(item)}
                    </Text>
                    <StatusPill state={item.analysis_state} />
                  </View>
                  <Text style={styles.meta}>
                    {labelForIntent(item.current_save_intent || item.default_intent)} ·{" "}
                    {item.capture_type}
                  </Text>
                </Pressable>
              )}
            />
          ) : (
            <Text style={styles.empty}>Share or paste something to start the dogfood loop.</Text>
          )}

          {selected ? (
            <View style={styles.detailPanel}>
              <View style={styles.captureRowTop}>
                <Text style={styles.sectionTitle}>Review</Text>
                <StatusPill state={selected.analysis_state} />
              </View>
              <Text style={styles.detailTitle}>{captureTitle(selected)}</Text>
              {selected.intent_rationale ? (
                <Text style={styles.bodyText}>{selected.intent_rationale}</Text>
              ) : (
                <Text style={styles.bodyText}>Analysis has not produced a rationale yet.</Text>
              )}
              <View style={styles.divider} />
              <Text style={styles.subhead}>Reminders</Text>
              {selected.reminder_suggestions?.length ? (
                selected.reminder_suggestions.map((reminder) => (
                  <View style={styles.plainBlock} key={reminder.id}>
                    <Text style={styles.blockTitle}>{reminder.trigger_value}</Text>
                    <Text style={styles.meta}>{reminder.trigger_type}</Text>
                    <Text style={styles.bodyText}>{reminder.rationale}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>No reminder suggestion stored.</Text>
              )}
              <Text style={styles.subhead}>Entities</Text>
              {selected.captured_entities?.slice(0, 6).map((entity) => (
                <Text style={styles.bodyText} key={entity.id}>
                  {entity.display_name} · {entity.entity_type}
                </Text>
              ))}
              <Text style={styles.subhead}>Collections</Text>
              {selected.collection_suggestions?.length ? (
                selected.collection_suggestions.map((collection) => (
                  <Text style={styles.bodyText} key={collection.id}>
                    {collection.name}
                  </Text>
                ))
              ) : (
                <Text style={styles.empty}>No collection suggestion stored.</Text>
              )}
              <Pressable
                disabled={analyzingId === selected.id}
                onPress={() => analyzeCapture(selected.id)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.fullWidth,
                  pressed && styles.pressed
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {analyzingId === selected.id ? "Running analysis..." : "Rerun Mini"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const colors = {
  paper: "#f7f4ee",
  panel: "#ede8de",
  panelStrong: "#ded7ca",
  ink: "#211f1b",
  muted: "#797166",
  line: "#d4cabd",
  accent: "#3d6f62",
  accentDark: "#234b42",
  readyBg: "#dce9df",
  readyText: "#214b35",
  processingBg: "#e4e0d6",
  processingText: "#5f574a",
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
  content: {
    padding: 20,
    paddingBottom: 40
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
    backgroundColor: "#fbf8f2",
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14
  },
  textArea: {
    minHeight: 96,
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
    marginTop: 26,
    marginBottom: 10
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  fullWidth: {
    marginTop: 18
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
  detailPanel: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    marginTop: 24,
    padding: 16
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 27,
    marginTop: 14,
    marginBottom: 8
  },
  subhead: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  bodyText: {
    color: colors.muted,
    fontSize: 15,
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
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginTop: 14
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
  pillBad: {
    backgroundColor: colors.badBg,
    color: colors.badText
  },
  pillNeutral: {
    backgroundColor: colors.panelStrong,
    color: colors.muted
  }
});
