"use client";

import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Library,
  Link2,
  MapPin,
  Plus,
  Search,
  Settings,
  StickyNote,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const language = {
  appName: "Sharebook",
  confidence: {
    high: "Looks right",
    needsReview: "Maybe",
    notSure: "Not sure",
    couldNotTell: "Couldn't tell"
  },
  states: {
    saved: "Saved",
    analyzing: "Analyzing in background",
    ready: "Ready to review",
    reminderSuggestion: "Reminder suggested",
    collectionSuggestion: "Collection suggested",
    reviewNeeds: "2 saves need a quick look"
  }
} as const;

const flows = [
  { id: "zero", label: "Upcoming", shortLabel: "Upcoming" },
  { id: "sheet", label: "Capture Sheet", shortLabel: "Capture" },
  { id: "receipt", label: "Capture Receipt", shortLabel: "Saved" },
  { id: "notification", label: "Review Inbox", shortLabel: "Review" },
  { id: "capture-detail", label: "Quick Edit", shortLabel: "Edit" },
  { id: "today-review", label: "Suggestion Review", shortLabel: "Review" },
  { id: "search", label: "Search", shortLabel: "Search" },
  { id: "collections", label: "Library", shortLabel: "Library" },
  { id: "collection-detail", label: "Collection Detail", shortLabel: "Collection" },
  { id: "new-collection", label: "Create Empty Collection", shortLabel: "Create" },
  { id: "settings", label: "Settings", shortLabel: "Settings" }
] as const;

type FlowId = (typeof flows)[number]["id"];
type CaptureEditor = "intent" | "collection" | "reminder" | "place";

function isFlowId(value: string | null): value is FlowId {
  return flows.some((item) => item.id === value);
}

function isCaptureId(value: string | null) {
  return memoryObjects.some((item) => item.id === value);
}

const mockCapture = {
  title: "Ramen reel from Instagram",
  source: "instagram.com/reel/soho-ramen",
  intent: "try this place",
  collection: "NYC restaurants",
  reminder: "next Saturday afternoon",
  place: "SoHo",
  rationale: {
    intent: "Because the reel centers on a restaurant worth visiting.",
    collection: "Because it mentions a SoHo ramen shop near saved NYC places.",
    reminder: "Because the post says it is open this weekend.",
    place: "Because SoHo appears in the caption and storefront text."
  }
};

const memoryObjects = [
  {
    id: "ramen-reel",
    title: "Ramen reel from Instagram",
    source: "Instagram",
    sourceDetail: "Reel saved 3:36 PM",
    context: "Caption and storefront text point to a ramen shop in SoHo.",
    collection: "NYC restaurants",
    thumbnailTone: "ramen",
    status: language.states.reminderSuggestion,
    matchReason: "Place in SoHo",
    contentKind: "media",
    sourceUrl: "instagram.com/reel/soho-ramen",
    intent: "try this place",
    place: "SoHo",
    reminder: "next Saturday afternoon"
  },
  {
    id: "noodle-list",
    title: "Late-night noodle list",
    source: "Safari",
    sourceDetail: "Article saved yesterday",
    context: "Mentions three downtown ramen spots and a late-night dinner list.",
    collection: "NYC restaurants",
    thumbnailTone: "article",
    status: "Indexed with source text",
    matchReason: "Saved to NYC restaurants",
    contentKind: "media",
    sourceUrl: "nytimes.com/late-night-noodles",
    intent: "try this place",
    place: "Lower East Side",
    reminder: "No reminder"
  },
  {
    id: "concert-poster",
    title: "Concert poster screenshot",
    source: "Photos",
    sourceDetail: "Screenshot saved 12:04 PM",
    context: "OCR found a date and venue, but the reminder still needs review.",
    collection: "Weekend ideas",
    thumbnailTone: "poster",
    status: "Date found",
    matchReason: "Concert date found",
    contentKind: "media",
    sourceUrl: "photos://concert-poster",
    intent: "review later",
    place: "Brooklyn",
    reminder: "June 14 at 8:30 PM"
  },
  {
    id: "gift-note",
    title: "Ceramic lamp gift idea",
    source: "Note",
    sourceDetail: "Text saved 4:12 PM",
    context: "Mom mentioned she wants a small ceramic lamp for the reading corner.",
    collection: "Gift ideas",
    thumbnailTone: "note",
    status: "Indexed",
    matchReason: "Intent gift idea",
    contentKind: "text",
    textExcerpt: "Mom mentioned she wants a small ceramic lamp for the reading corner. Look for something warm, not too modern, under $120.",
    intent: "gift idea",
    place: "No place",
    reminder: "Before her birthday"
  }
];

const recentSearches = ["that ramen place near soho", "gift idea from instagram", "concert poster with date"];

const collections = [
  {
    name: "NYC restaurants",
    count: 2,
    detail: "Ramen, dinner lists, places to try",
    description: "Places in New York worth trying, especially ramen, casual dinners, and saved restaurant lists.",
    suggestionState: "Available for future suggestions"
  },
  {
    name: "Japan trip",
    count: 0,
    detail: "Empty collection",
    description: "Restaurants, hotels, train tips, tickets, and ideas for an upcoming Japan trip.",
    suggestionState: "AI can suggest matching saves later"
  },
  {
    name: "Gift ideas",
    count: 1,
    detail: "Products and notes",
    description: "Products, notes, and links that could become gifts later.",
    suggestionState: "Available for future suggestions"
  }
];

const calendarDays = [
  { day: "Today", date: "25" },
  { day: "Tue", date: "26", marker: "review" },
  { day: "Wed", date: "27" },
  { day: "Thu", date: "28" },
  { day: "Fri", date: "29" },
  { day: "Sat", date: "30" },
  { day: "Jun", date: "14", marker: "event" }
];

const upcomingItems = [
  {
    date: "Tue, May 26",
    time: "Evening",
    title: "Ramen place in SoHo",
    meta: "Suggested from an Instagram reel you saved.",
    state: "Review",
    tone: "green"
  },
  {
    date: "Sun, Jun 14",
    time: "8:30 PM",
    title: "Concert poster",
    meta: "Date found in screenshot. Reminder not added yet.",
    state: "Maybe",
    tone: "amber"
  }
];

const inboxItems = [
  {
    title: "Ramen reel from Instagram",
    source: "Instagram",
    detail: "Extracting place, intent, reminder, and source text.",
    status: "Processing",
    tone: "processing",
    action: "receipt" as FlowId
  },
  {
    title: "Concert poster screenshot",
    source: "Photos",
    detail: "Date found. Reminder still needs your say.",
    status: "Quick edit",
    tone: "ready",
    action: "capture-detail" as FlowId
  },
  {
    title: "Ramen place in SoHo",
    source: "Tue, May 26",
    detail: "Suggested from a saved reel. Not added to calendar.",
    status: "Coming up",
    tone: "upcoming",
    action: "today-review" as FlowId
  }
];

export default function ConsumerRedesignPage() {
  const [flowId, setFlowId] = useState<FlowId>("zero");
  const [selectedCaptureId, setSelectedCaptureId] = useState(memoryObjects[0].id);

  const flow = useMemo(() => flows.find((item) => item.id === flowId) ?? flows[0], [flowId]);
  const openCaptureDetail = (captureId = memoryObjects[0].id) => {
    setSelectedCaptureId(captureId);
    setFlowId("capture-detail");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("flow");
    const capture = params.get("capture");
    if (isFlowId(candidate)) setFlowId(candidate);
    if (capture && isCaptureId(capture)) setSelectedCaptureId(capture);
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.workspace} aria-labelledby="prototype-title">
        <div className={styles.leftRail}>
          <p className={styles.eyebrow}>Mobile UI prototype</p>
          <h1 id="prototype-title">{language.appName}</h1>
          <p className={styles.lede}>
            A softer consumer direction for saving the things you will want again.
          </p>

          <div className={styles.directionPanel} aria-label="Canonical design direction">
            <p className={styles.controlLabel}>Direction</p>
            <h2>Modern Memory App</h2>
            <p>
              White space, signal-blue focus, pill controls, soft media objects, and almost no
              operational chrome.
            </p>
          </div>
        </div>

        <div className={styles.previewStage}>
          <div className={styles.stageHeader}>
            <div>
              <p className={styles.eyebrow}>Current step</p>
              <h2>{flow.label}</h2>
            </div>
          </div>

          <div className={styles.phoneShell}>
            <div className={styles.phoneChrome}>
              <span />
            </div>
            <div className={styles.phoneScreen}>
              <PhoneScreen
                flowId={flowId}
                openCaptureDetail={openCaptureDetail}
                selectedCaptureId={selectedCaptureId}
                setFlowId={setFlowId}
              />
            </div>
          </div>
        </div>

        <aside className={styles.rightRail} aria-label="Flow">
          <p className={styles.controlLabel}>Flow</p>
          <div className={styles.flowList}>
            {flows.map((item, index) => (
              <button
                className={styles.flowButton}
                aria-current={item.id === flowId ? "step" : undefined}
                data-active={item.id === flowId}
                key={item.id}
                onClick={() => setFlowId(item.id)}
                type="button"
              >
                <span className={styles.flowIndex}>{index + 1}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.checklist} aria-hidden="true" />
        </aside>
      </section>
    </main>
  );
}

function PhoneScreen({
  flowId,
  openCaptureDetail,
  selectedCaptureId,
  setFlowId
}: {
  flowId: FlowId;
  openCaptureDetail: (captureId?: string) => void;
  selectedCaptureId: string;
  setFlowId: (flowId: FlowId) => void;
}) {
  const showNavigation =
    flowId === "zero" ||
    flowId === "notification" ||
    flowId === "capture-detail" ||
    flowId === "today-review" ||
    flowId === "search" ||
    flowId === "collections" ||
    flowId === "collection-detail" ||
    flowId === "settings";
  const showTopBar = true;

  return (
    <div className={styles.appSurface}>
      {showTopBar ? <TopBar title={titleForFlow(flowId)} /> : null}
      <div className={`${styles.screenBody} ${showNavigation ? "" : styles.screenBodyFocused}`}>
        {flowId === "zero" ? <UpcomingScreen setFlowId={setFlowId} /> : null}
        {flowId === "sheet" ? <CaptureSheet setFlowId={setFlowId} /> : null}
        {flowId === "receipt" ? <CaptureReceipt setFlowId={setFlowId} /> : null}
        {flowId === "notification" ? <InboxScreen isUpdated openCaptureDetail={openCaptureDetail} setFlowId={setFlowId} /> : null}
        {flowId === "capture-detail" ? <CaptureDetail captureId={selectedCaptureId} setFlowId={setFlowId} /> : null}
        {flowId === "today-review" ? <UpcomingReview openCaptureDetail={openCaptureDetail} /> : null}
        {flowId === "search" ? <SearchScreen openCaptureDetail={openCaptureDetail} setFlowId={setFlowId} /> : null}
        {flowId === "collections" ? <CollectionsScreen setFlowId={setFlowId} /> : null}
        {flowId === "collection-detail" ? <CollectionDetail openCaptureDetail={openCaptureDetail} /> : null}
        {flowId === "new-collection" ? <NewCollection setFlowId={setFlowId} /> : null}
        {flowId === "settings" ? <SettingsScreen /> : null}
      </div>
      {showNavigation ? <BottomNav flowId={flowId} setFlowId={setFlowId} /> : null}
    </div>
  );
}

function titleForFlow(flowId: FlowId) {
  if (flowId === "zero") return "Upcoming";
  if (flowId === "notification") return "Review Inbox";
  if (flowId === "sheet") return "Capture";
  if (flowId === "capture-detail") return "Quick edit";
  if (flowId === "today-review") return "Review";
  if (flowId === "search") return "Search";
  if (flowId === "collections") return "Library";
  if (flowId === "collection-detail") return "Collection";
  if (flowId === "new-collection") return "New collection";
  if (flowId === "settings") return "Settings";
  return "Upcoming";
}

function TopBar({ title }: { title: string }) {
  return (
    <header className={styles.topBar}>
      <div>
        <h3>{title}</h3>
      </div>
    </header>
  );
}

function UpcomingScreen({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>No upcoming saves yet</p>
        <h2>Save something for when it matters later.</h2>
      </div>

      <section className={styles.shareInstruction} aria-label="Native share instruction">
        <span className={styles.instructionIcon}>
          <Plus aria-hidden="true" size={18} />
        </span>
        <div>
          <h3>Share from another app</h3>
          <p>From the app with the post, place, link, or photo open, use Share and choose Sharebook.</p>
        </div>
      </section>

      <div className={styles.actionGrid} aria-label="Fallback capture actions">
        <ActionButton icon={<Link2 aria-hidden="true" size={17} />} onClick={() => setFlowId("sheet")}>
          Paste link
        </ActionButton>
        <ActionButton icon={<StickyNote aria-hidden="true" size={17} />} onClick={() => setFlowId("sheet")}>
          Add note
        </ActionButton>
        <ActionButton icon={<ImageIcon aria-hidden="true" size={17} />} onClick={() => setFlowId("sheet")}>
          Upload image
        </ActionButton>
        <ActionButton icon={<InboxIcon aria-hidden="true" size={17} />} onClick={() => setFlowId("notification")}>
          Review inbox
        </ActionButton>
      </div>

      <section className={styles.plainSection}>
        <div className={styles.sectionHeaderRow}>
          <h3>Coming up</h3>
          <span>Across days</span>
        </div>
        <p>Sharebook only surfaces something here when a saved Capture has a time, place, or review cue worth your attention.</p>
      </section>
    </section>
  );
}

function InboxScreen({
  isUpdated = false,
  openCaptureDetail,
  setFlowId
}: {
  isUpdated?: boolean;
  openCaptureDetail: (captureId?: string) => void;
  setFlowId: (flowId: FlowId) => void;
}) {
  const visibleInboxItems = isUpdated
    ? [
        {
          title: "Ramen reel from Instagram",
          source: "Instagram",
          detail: "Place, intent, and collection found. Reminder still needs your say.",
          status: "Quick edit",
          tone: "ready",
          action: "capture-detail" as FlowId
        },
        ...inboxItems.slice(1)
      ]
    : inboxItems;
  const inboxSummary = isUpdated
    ? [
        { count: 0, label: "Processing", flow: "receipt" as FlowId },
        { count: 2, label: "Ready", flow: "capture-detail" as FlowId },
        { count: 2, label: "Upcoming", flow: "today-review" as FlowId }
      ]
    : [
        { count: 1, label: "Processing", flow: "receipt" as FlowId },
        { count: 1, label: "Ready", flow: "capture-detail" as FlowId },
        { count: 2, label: "Upcoming", flow: "today-review" as FlowId }
      ];

  return (
    <section className={styles.screenStack}>
      {isUpdated ? (
        <button className={styles.inboxToast} onClick={() => openCaptureDetail("ramen-reel")} type="button">
          <span className={styles.statusDot} data-tone="ready" />
          <span>
            <strong>Ready to review</strong>
            <small>Ramen reel moved into your inbox.</small>
          </span>
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      ) : null}

      <div className={styles.inboxIntro}>
        <p className={styles.todayDate}>Monday, May 25</p>
        <span>Processing, ready, and coming up.</span>
      </div>

      <div className={styles.inboxSummary} aria-label="Inbox status summary">
        {inboxSummary.map((item) => (
          <button key={item.label} onClick={() => item.flow === "capture-detail" ? openCaptureDetail("ramen-reel") : setFlowId(item.flow)} type="button">
            <strong>{item.count}</strong>
            {item.label}
          </button>
        ))}
      </div>

      <section className={styles.plainSection}>
        <div className={styles.sectionHeaderRow}>
          <h3>Latest</h3>
          <span>3 items</span>
        </div>
        <div className={styles.inboxList}>
          {visibleInboxItems.map((item) => (
            <button
              className={styles.inboxItem}
              key={item.title}
              onClick={() => item.action === "capture-detail" ? openCaptureDetail(item.title.includes("Concert") ? "concert-poster" : "ramen-reel") : setFlowId(item.action)}
              type="button"
            >
              <span className={styles.statusDot} data-tone={item.tone} />
              <span className={styles.inboxCopy}>
                <span className={styles.inboxMeta}>
                  <span>{item.source}</span>
                  <em>{item.status}</em>
                </span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                {item.tone === "processing" ? (
                  <span className={styles.miniProgress}>
                    <span />
                  </span>
                ) : null}
              </span>
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function CaptureSheet({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.captureSheet}>
        <div className={styles.detectedLink}>
          <Link2 aria-hidden="true" size={18} />
          <div>
            <p>Copied link found</p>
            <strong>instagram.com/reel/soho-ramen</strong>
          </div>
        </div>
        <button className={styles.primaryAction} onClick={() => setFlowId("receipt")} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Save copied link</span>
        </button>
      </div>

      <div className={styles.dividerLabel}>or</div>

      <label className={styles.fieldLabel}>
        <span>Paste link or text</span>
        <textarea
          aria-label="Paste link or text"
          className={styles.textArea}
          defaultValue=""
          placeholder="https://..."
        />
      </label>

      <div className={styles.actionList}>
        <ActionButton
          icon={<StickyNote aria-hidden="true" size={17} />}
          onClick={() => setFlowId("receipt")}
        >
          Add note
        </ActionButton>
        <ActionButton
          icon={<ImageIcon aria-hidden="true" size={17} />}
          onClick={() => setFlowId("receipt")}
        >
          Upload screenshot or photo
        </ActionButton>
      </div>

      <p className={styles.helpText}>Share from Instagram, TikTok, Maps, Safari, or Photos.</p>
    </section>
  );
}

function CaptureReceipt({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.receiptHero}>
        <span className={styles.savedMark}>
          <Check aria-hidden="true" size={22} />
        </span>
        <div>
          <p>{language.states.saved} to {language.appName}</p>
          <h2>{mockCapture.title}</h2>
          <span>{mockCapture.source}</span>
        </div>
      </div>

      <section className={styles.processingPanel} aria-label="Processing status">
        <p>Analyzing in background</p>
        <h3>You can leave Sharebook.</h3>
        <span>We started a persistent notification and will update it when this save is ready.</span>
      </section>

      <button className={styles.systemNotification} onClick={() => setFlowId("notification")} type="button">
        <span className={styles.notificationAppIcon}>
          <span />
        </span>
        <span className={styles.notificationCopy}>
          <span>
            <strong>{language.appName}</strong>
            <small>now</small>
          </span>
          <b>Analyzing ramen reel</b>
          <em>Extracting place, intent, reminder, and source text.</em>
          <span className={styles.progressTrack}>
            <span />
          </span>
        </span>
      </button>

      <div className={styles.bottomActions}>
        <button className={styles.secondaryAction} onClick={() => setFlowId("zero")} type="button">
          Done
        </button>
      </div>
    </section>
  );
}

function CaptureDetail({
  captureId,
  setFlowId
}: {
  captureId: string;
  setFlowId: (flowId: FlowId) => void;
}) {
  const item = memoryObjects.find((capture) => capture.id === captureId) ?? memoryObjects[0];
  const sourceUrl = item.sourceUrl
    ? item.sourceUrl.includes("://")
      ? item.sourceUrl
      : `https://${item.sourceUrl}`
    : "";
  const [editor, setEditor] = useState<CaptureEditor | null>(null);

  if (editor) {
    return <CaptureEditView editor={editor} onBack={() => setEditor(null)} onDone={() => setEditor(null)} />;
  }

  return (
    <section className={styles.screenStack}>
      <section className={styles.captureDetailHero}>
        <CapturePreview item={item} />
        <div className={styles.captureDetailTitle}>
          <p>{item.source} · {item.sourceDetail}</p>
          <h2>{item.title}</h2>
          {item.sourceUrl ? <span>{item.sourceUrl}</span> : null}
        </div>
        <div className={styles.sourceActions}>
          {item.sourceUrl ? (
            <button aria-label="Open source link" onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")} type="button">
              <ExternalLink aria-hidden="true" size={15} />
              <span>Open</span>
            </button>
          ) : null}
          <button aria-label={item.contentKind === "text" ? "Copy captured text" : "Copy source link"} onClick={() => navigator.clipboard.writeText(item.textExcerpt ?? sourceUrl)} type="button">
            <Copy aria-hidden="true" size={15} />
            <span>{item.contentKind === "text" ? "Copy text" : "Copy link"}</span>
          </button>
          <button aria-label="Delete capture" data-danger="true" onClick={() => setFlowId("zero")} type="button">
            <Trash2 aria-hidden="true" size={17} />
            <span>Delete</span>
          </button>
        </div>
      </section>

      <section className={styles.quickSentence} aria-label="Quick edit">
        <p>
          Saved as{" "}
          <button onClick={() => setEditor("intent")} type="button">{item.intent}</button>
          {" "}in{" "}
          <button onClick={() => setEditor("collection")} type="button">{item.collection}</button>
          .
        </p>
        <p>
          Reminder suggested:{" "}
          <button data-tone="maybe" onClick={() => setEditor("reminder")} type="button">{item.reminder}</button>
          .
        </p>
        <p>
          Place:{" "}
          <button onClick={() => setEditor("place")} type="button">{item.place}</button>
          .
        </p>
      </section>

      <div className={styles.bottomActions}>
        <button className={styles.primaryAction} onClick={() => setFlowId("zero")} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Accept</span>
        </button>
        <button className={styles.secondaryAction} onClick={() => setEditor("reminder")} type="button">
          Change
        </button>
        <button className={styles.textAction} onClick={() => setFlowId("notification")} type="button">
          Dismiss
        </button>
      </div>

      <section className={styles.rationalePopover} aria-label="Why these suggestions">
        <div className={styles.rationale}>
          <Check aria-hidden="true" size={15} />
          <span>
            <strong>Intent: {language.confidence.high}</strong>
            {captureRationale(item, "intent")}
          </span>
        </div>
        <div className={styles.rationale}>
          <Folder aria-hidden="true" size={15} />
          <span>
            <strong>Collection: {language.confidence.high}</strong>
            {captureRationale(item, "collection")}
          </span>
        </div>
        <div className={styles.rationale}>
          <CalendarClock aria-hidden="true" size={15} />
          <span>
            <strong>Reminder: {language.confidence.needsReview}</strong>
            {captureRationale(item, "reminder")}
          </span>
        </div>
      </section>

      <section className={styles.captureExcerpt}>
        <div className={styles.sectionHeaderRow}>
          <h3>Content</h3>
          <span>Indexed</span>
        </div>
        <p>{item.contentKind === "text" ? item.textExcerpt : item.context}</p>
      </section>

    </section>
  );
}

function captureRationale(item: (typeof memoryObjects)[number], key: keyof typeof mockCapture.rationale) {
  if (item.id === "ramen-reel") return mockCapture.rationale[key];
  if (key === "reminder" && item.reminder === "No reminder") return "No reminder was created because no time cue was clear.";
  if (key === "collection") return `Because this save matches ${item.collection.toLowerCase()} context.`;
  if (key === "intent") return `Because the source text points to ${item.intent}.`;
  return item.context;
}

function CapturePreview({ item }: { item: (typeof memoryObjects)[number] }) {
  if (item.contentKind === "text") {
    return (
      <div className={styles.captureTextPreview}>
        <span>
          <StickyNote aria-hidden="true" size={16} />
          Text note
        </span>
        <p>{item.textExcerpt}</p>
      </div>
    );
  }

  return (
    <div className={styles.captureMedia} data-tone={item.thumbnailTone}>
      <span>{item.source.slice(0, 2)}</span>
    </div>
  );
}

function CaptureEditView({
  editor,
  onBack,
  onDone
}: {
  editor: CaptureEditor;
  onBack: () => void;
  onDone: () => void;
}) {
  const titleByEditor = {
    intent: "Intent",
    collection: "Collection",
    reminder: "Reminder",
    place: "Place"
  };

  return (
    <section className={styles.screenStack}>
      <button className={styles.editorBack} onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        <span>Capture</span>
      </button>

      <div className={styles.captureEditHeader}>
        <p>Edit</p>
        <h2>{titleByEditor[editor]}</h2>
      </div>

      {editor === "intent" ? (
        <section className={styles.choiceGrid} aria-label="Intent options">
          {["try this place", "review later", "gift idea", "reference", "book this", "share with someone"].map((intent) => (
            <button data-selected={intent === mockCapture.intent} key={intent} type="button">{intent}</button>
          ))}
        </section>
      ) : null}

      {editor === "collection" ? (
        <section className={styles.editPanel}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" size={18} />
            <input defaultValue="NYC restaurants" aria-label="Search collections" />
          </label>
          <div className={styles.collectionPicker}>
            {collections.map((collection) => (
              <button data-selected={collection.name === mockCapture.collection} key={collection.name} type="button">
                <Folder aria-hidden="true" size={17} />
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.count === 0 ? "No saves yet" : `${collection.count} saves`}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {editor === "reminder" ? (
        <section className={styles.editPanel}>
          <div className={styles.dateTimeGrid}>
            {["Today", "Tomorrow", "Sat, May 30", "Jun 14"].map((date) => (
              <button data-selected={date === "Sat, May 30"} key={date} type="button">{date}</button>
            ))}
          </div>
          <div className={styles.dateTimeGrid}>
            {["Morning", "Afternoon", "Evening", "Custom"].map((time) => (
              <button data-selected={time === "Afternoon"} key={time} type="button">{time}</button>
            ))}
          </div>
          <div className={styles.nativeDateTime}>
            <label>
              <span>Date</span>
              <input type="date" defaultValue="2026-05-30" />
            </label>
            <label>
              <span>Time</span>
              <input type="time" defaultValue="15:00" />
            </label>
          </div>
        </section>
      ) : null}

      {editor === "place" ? (
        <section className={styles.editPanel}>
          <label className={styles.searchField}>
            <MapPin aria-hidden="true" size={18} />
            <input defaultValue="SoHo ramen" aria-label="Search places" />
          </label>
          <div className={styles.placeMap} aria-label="Map preview">
            <span />
            <strong>SoHo</strong>
          </div>
          <div className={styles.placeResults}>
            {["Ramen shop in SoHo", "SoHo, New York", "Nearby saved restaurants"].map((place) => (
              <button data-selected={place === "Ramen shop in SoHo"} key={place} type="button">
                <MapPin aria-hidden="true" size={16} />
                <span>{place}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.bottomActions}>
        <button className={styles.primaryAction} onClick={onDone} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Save {titleByEditor[editor].toLowerCase()}</span>
        </button>
      </div>
    </section>
  );
}

function UpcomingReview({
  openCaptureDetail
}: {
  openCaptureDetail: (captureId?: string) => void;
}) {
  const recentObjects = memoryObjects.filter((item) => item.id !== "noodle-list");

  return (
    <section className={styles.screenStack}>
      <div className={styles.weekStrip} aria-label="Upcoming days with saved reminders">
        {calendarDays.map((item) => (
          <span data-marker={item.marker ?? "none"} key={`${item.day}-${item.date}`}>
            <span>{item.day}</span>
            <strong>{item.date}</strong>
          </span>
        ))}
      </div>

      <button className={styles.reviewModule} onClick={() => openCaptureDetail("ramen-reel")} type="button">
        <div>
          <p>2 upcoming suggestions</p>
          <span>Nothing is added to your calendar until you confirm it.</span>
        </div>
        <ChevronRight aria-hidden="true" size={19} />
      </button>

      <section className={styles.agendaPanel} aria-label="Upcoming saves">
        <div className={styles.sectionHeaderRow}>
          <h3>Suggestions</h3>
          <span>Across days</span>
        </div>
        <div className={styles.agendaTimeline}>
          {upcomingItems.map((item) => (
            <button className={styles.agendaItem} key={item.title} onClick={() => openCaptureDetail(item.title.includes("Concert") ? "concert-poster" : "ramen-reel")} type="button">
              <span className={styles.agendaTime}>
                <strong>{item.date}</strong>
                <small>{item.time}</small>
              </span>
              <span className={styles.agendaCard}>
                <span className={styles.agendaDot} data-tone={item.tone} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </span>
                <em>{item.state}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.plainSection}>
        <h3>Recently saved</h3>
        <div className={styles.memoryList}>
          {recentObjects.map((item) => (
            <MemoryObjectRow item={item} key={item.id} onClick={() => openCaptureDetail(item.id)} />
          ))}
        </div>
      </section>

      <section className={styles.placeStrip}>
        <MapPin aria-hidden="true" size={17} />
        <span>1 saved place</span>
      </section>
    </section>
  );
}

function SearchScreen({
  openCaptureDetail,
  setFlowId
}: {
  openCaptureDetail: (captureId?: string) => void;
  setFlowId: (flowId: FlowId) => void;
}) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.searchIntro}>
        <p>Find a save by place, source, date, or a fragment you remember.</p>
      </div>

      <label className={styles.searchField}>
        <Search aria-hidden="true" size={18} />
        <input defaultValue="that ramen place near soho" aria-label="Search saved captures" />
      </label>

      <div className={styles.filterRow} aria-label="Search filters">
        <button data-active="true" type="button">All memory</button>
        <button data-active="true" onClick={() => setFlowId("collection-detail")} type="button">
          NYC restaurants
        </button>
        <button type="button">Instagram</button>
      </div>

      <section className={styles.recentSearchSection} aria-label="Recent searches">
        <div className={styles.sectionHeaderRow}>
          <h3>Recent searches</h3>
          <span>3</span>
        </div>
        <div className={styles.recentSearchList}>
          {recentSearches.map((query) => (
            <button key={query} type="button">{query}</button>
          ))}
        </div>
      </section>

      <section className={styles.plainSection}>
        <div className={styles.sectionHeaderRow}>
          <h3>Results</h3>
          <span>{memoryObjects.length} indexed saves</span>
        </div>
        <div className={styles.memoryList}>
          {memoryObjects.map((item) => (
            <MemoryObjectRow item={item} key={item.id} onClick={() => openCaptureDetail(item.id)} />
          ))}
        </div>
      </section>

    </section>
  );
}

function CollectionsScreen({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <button className={styles.createCollection} onClick={() => setFlowId("new-collection")} type="button">
        <span className={styles.createCollectionIcon}>
          <FolderPlus aria-hidden="true" size={18} />
        </span>
        <span className={styles.createCollectionCopy}>
          <strong>New collection</strong>
          <small>Add a description so future saves can match.</small>
        </span>
        <span className={styles.createCollectionPlus}>
          <Plus aria-hidden="true" size={18} />
        </span>
      </button>

      <div className={styles.collectionList}>
        {collections.map((item) => (
          <button className={styles.collectionRow} key={item.name} onClick={() => setFlowId("collection-detail")} type="button">
            <span className={styles.collectionIcon}>
              <Folder aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>{item.name}</strong>
              <small>{item.count === 0 ? "No saves yet" : `${item.count} saves`} | {item.detail}</small>
            </span>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CollectionDetail({
  openCaptureDetail
}: {
  openCaptureDetail: (captureId?: string) => void;
}) {
  const collection = collections[0];

  return (
    <section className={styles.screenStack}>
      <section className={styles.collectionEditor} aria-label="Collection details">
        <label className={styles.collectionField}>
          <span>Name</span>
          <input className={styles.textInput} defaultValue={collection.name} aria-label="Collection name" />
        </label>

        <label className={styles.collectionField}>
          <span>Description</span>
          <textarea
            className={`${styles.textArea} ${styles.descriptionInput}`}
            defaultValue={collection.description}
            aria-label="Collection description"
          />
        </label>
      </section>

      <section className={styles.plainSection}>
        <div className={styles.sectionHeaderRow}>
          <h3>Saved here</h3>
          <span>{collection.count} saves</span>
        </div>
        <div className={styles.collectionCaptureList}>
          {memoryObjects.slice(0, 2).map((item) => (
            <div className={styles.collectionCaptureRow} key={item.id}>
              <button className={styles.collectionCaptureOpen} onClick={() => openCaptureDetail(item.id)} type="button">
                <SourceThumbnail item={item} />
                <span className={styles.memoryCopy}>
                  <span className={styles.memoryKicker}>
                    <span>{item.source}</span>
                    <span>{item.sourceDetail}</span>
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.matchReason}</small>
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
              <button className={styles.removeCapture} aria-label={`Remove ${item.title} from collection`} type="button">
                <X aria-hidden="true" size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function NewCollection({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <label className={styles.fieldLabel}>
        <span>Name</span>
        <input className={styles.textInput} defaultValue="Japan trip" aria-label="Collection name" />
      </label>

      <label className={styles.fieldLabel}>
        <span>Description (optional)</span>
        <textarea
          className={`${styles.textArea} ${styles.descriptionInput}`}
          defaultValue="Restaurants, hotels, train tips, tickets, and ideas for an upcoming Japan trip."
          aria-label="Collection description"
        />
      </label>

      <section className={styles.emptyCollectionPreview}>
        <FolderPlus aria-hidden="true" size={20} />
        <div>
          <h3>Japan trip</h3>
          <p>Future captures that match the description can be suggested here for review.</p>
        </div>
      </section>

      <div className={styles.bottomActions}>
        <button className={styles.primaryAction} onClick={() => setFlowId("collections")} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Create collection</span>
        </button>
        <button className={styles.textAction} onClick={() => setFlowId("collections")} type="button">
          Cancel
        </button>
      </div>
    </section>
  );
}

function SettingsScreen() {
  return (
    <section className={styles.screenStack}>
      <section className={styles.settingsGroup} aria-label="Capture settings">
        <div className={styles.sectionHeaderRow}>
          <h3>Capture</h3>
          <span>Phone first</span>
        </div>
        <button className={styles.settingsRow} type="button">
          <span>
            <strong>Native share help</strong>
            <small>Show first-run instructions until the first share capture succeeds.</small>
          </span>
          <em>On</em>
        </button>
        <button className={styles.settingsRow} type="button">
          <span>
            <strong>Clipboard detection</strong>
            <small>Offer copied links in the Capture Sheet.</small>
          </span>
          <em>On</em>
        </button>
      </section>

      <section className={styles.settingsGroup} aria-label="Trust settings">
        <div className={styles.sectionHeaderRow}>
          <h3>Trust</h3>
          <span>Quiet confidence</span>
        </div>
        <button className={styles.settingsRow} type="button">
          <span>
            <strong>Reminder suggestions</strong>
            <small>Ask before creating any future notification.</small>
          </span>
          <em>Review</em>
        </button>
        <button className={styles.settingsRow} type="button">
          <span>
            <strong>New collections</strong>
            <small>Require confirmation before Sharebook creates structure.</small>
          </span>
          <em>Ask</em>
        </button>
      </section>
    </section>
  );
}

function ActionButton({
  children,
  icon,
  onClick
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={styles.actionButton} onClick={onClick} type="button">
      {icon}
      <span>{children}</span>
    </button>
  );
}

function BottomNav({
  flowId,
  setFlowId
}: {
  flowId: FlowId;
  setFlowId: (flowId: FlowId) => void;
}) {
  const nav = [
    { label: "Upcoming", flow: "zero" as FlowId, active: flowId === "zero" || flowId === "notification" || flowId === "receipt", icon: <InboxIcon aria-hidden="true" size={17} /> },
    { label: "Search", flow: "search" as FlowId, active: flowId === "search", icon: <Search aria-hidden="true" size={17} /> },
    {
      label: "Library",
      flow: "collections" as FlowId,
      active: flowId === "collections" || flowId === "collection-detail" || flowId === "new-collection" || flowId === "today-review",
      icon: <Library aria-hidden="true" size={17} />
    },
    {
      label: "Settings",
      flow: "settings" as FlowId,
      active: flowId === "settings",
      icon: <Settings aria-hidden="true" size={17} />
    }
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Primary">
      {nav.slice(0, 2).map((item) => (
        <button
          className={styles.navButton}
          data-active={item.active}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          key={item.label}
          onClick={() => setFlowId(item.flow)}
          title={item.label}
          type="button"
        >
          {item.icon}
        </button>
      ))}
      <span className={styles.captureSlot}>
        <button
          aria-label="New capture"
          className={styles.captureNavButton}
          onClick={() => setFlowId("sheet")}
          title="New capture"
          type="button"
        >
          <Plus aria-hidden="true" size={24} />
        </button>
      </span>
      {nav.slice(2).map((item) => (
        <button
          className={styles.navButton}
          data-active={item.active}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          key={item.label}
          onClick={() => setFlowId(item.flow)}
          title={item.label}
          type="button"
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}

function MemoryObjectRow({
  item,
  onClick
}: {
  item: (typeof memoryObjects)[number];
  onClick?: () => void;
}) {
  return (
    <button className={styles.memoryObjectRow} onClick={onClick} type="button">
      <SourceThumbnail item={item} />
      <span className={styles.memoryCopy}>
        <span className={styles.memoryKicker}>
          <span>{item.source}</span>
          <span>{item.sourceDetail}</span>
        </span>
        <strong>{item.title}</strong>
        <small>{item.matchReason}</small>
      </span>
      <span className={styles.memoryMeta}>
        <em>{item.status}</em>
      </span>
    </button>
  );
}

function SourceThumbnail({ item }: { item: (typeof memoryObjects)[number] }) {
  return (
    <span aria-hidden="true" className={styles.sourceThumbnail} data-tone={item.thumbnailTone}>
      <span>{item.source.slice(0, 2)}</span>
    </span>
  );
}
