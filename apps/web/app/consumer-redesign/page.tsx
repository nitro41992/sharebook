"use client";

import {
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  EyeOff,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Library,
  Link2,
  MapPin,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Share2,
  StickyNote
} from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./page.module.css";

const language = {
  appName: "Sharebook",
  confidence: {
    looksRight: "Looks right",
    maybe: "Maybe",
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
  { id: "zero", label: "Zero-Capture Today", shortLabel: "Today" },
  { id: "sheet", label: "Capture Sheet", shortLabel: "Capture" },
  { id: "receipt", label: "Capture Receipt", shortLabel: "Saved" },
  { id: "notification", label: "Completion Notification", shortLabel: "Ready" },
  { id: "quick-edit", label: "Quick Edit", shortLabel: "Edit" },
  { id: "today-review", label: "Today With Review", shortLabel: "Review" },
  { id: "search", label: "Search", shortLabel: "Search" },
  { id: "collections", label: "Collections", shortLabel: "Library" },
  { id: "collection-detail", label: "Collection Detail", shortLabel: "Collection" },
  { id: "new-collection", label: "Create Empty Collection", shortLabel: "Create" }
] as const;

type FlowId = (typeof flows)[number]["id"];

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
    reasons: [
      { label: "Place", value: "SoHo" },
      { label: "Intent", value: "try this place" },
      { label: "Source", value: "Instagram" }
    ]
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
    reasons: [
      { label: "Collection", value: "NYC restaurants" },
      { label: "Entity", value: "ramen" },
      { label: "Text", value: "late-night" }
    ]
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
    reasons: [
      { label: "OCR", value: "June 14" },
      { label: "Intent", value: "review later" },
      { label: "State", value: "needs review" }
    ]
  }
];

const recentSearches = ["that ramen place near soho", "gift idea from instagram", "concert poster with date"];

const collections = [
  {
    name: "NYC restaurants",
    count: 2,
    detail: "Ramen, dinner lists, places to try",
    suggestionState: "Available for future suggestions"
  },
  {
    name: "Japan trip",
    count: 0,
    detail: "Empty collection",
    suggestionState: "AI can suggest matching saves later"
  },
  {
    name: "Gift ideas",
    count: 1,
    detail: "Products and notes",
    suggestionState: "Available for future suggestions"
  }
];

const weekDays = [
  { day: "M", date: "25", active: true },
  { day: "T", date: "26" },
  { day: "W", date: "27" },
  { day: "T", date: "28" },
  { day: "F", date: "29" },
  { day: "S", date: "30" },
  { day: "S", date: "31" }
];

const agendaItems = [
  {
    time: "7:00",
    meridiem: "PM",
    title: "Ramen place in SoHo",
    meta: "Reminder suggestion from Instagram reel",
    state: "Review",
    tone: "blue"
  },
  {
    time: "8:30",
    meridiem: "PM",
    title: "Concert poster",
    meta: "Date found, reminder not added",
    state: "Maybe",
    tone: "amber"
  },
  {
    time: "Later",
    meridiem: "",
    title: "Late-night noodle list",
    meta: "Saved to NYC restaurants",
    state: "Saved",
    tone: "green"
  }
];

export default function ConsumerRedesignPage() {
  const [flowId, setFlowId] = useState<FlowId>("zero");

  const flow = useMemo(() => flows.find((item) => item.id === flowId) ?? flows[0], [flowId]);

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
              <PhoneScreen flowId={flowId} setFlowId={setFlowId} />
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
  setFlowId
}: {
  flowId: FlowId;
  setFlowId: (flowId: FlowId) => void;
}) {
  const showFab = flowId === "zero" || flowId === "today-review" || flowId === "search" || flowId === "collections";
  const showNavigation =
    flowId === "zero" ||
    flowId === "today-review" ||
    flowId === "search" ||
    flowId === "collections" ||
    flowId === "collection-detail";

  return (
    <div className={styles.appSurface}>
      <TopBar title={titleForFlow(flowId)} setFlowId={setFlowId} />
      <div className={`${styles.screenBody} ${showNavigation ? "" : styles.screenBodyFocused}`}>
        {flowId === "zero" ? <ZeroCaptureToday setFlowId={setFlowId} /> : null}
        {flowId === "sheet" ? <CaptureSheet setFlowId={setFlowId} /> : null}
        {flowId === "receipt" ? <CaptureReceipt setFlowId={setFlowId} /> : null}
        {flowId === "notification" ? <CompletionNotification setFlowId={setFlowId} /> : null}
        {flowId === "quick-edit" ? <QuickEdit setFlowId={setFlowId} /> : null}
        {flowId === "today-review" ? <TodayReview setFlowId={setFlowId} /> : null}
        {flowId === "search" ? <SearchScreen setFlowId={setFlowId} /> : null}
        {flowId === "collections" ? <CollectionsScreen setFlowId={setFlowId} /> : null}
        {flowId === "collection-detail" ? <CollectionDetail setFlowId={setFlowId} /> : null}
        {flowId === "new-collection" ? <NewCollection setFlowId={setFlowId} /> : null}
      </div>
      {showNavigation ? <BottomNav flowId={flowId} setFlowId={setFlowId} /> : null}
      {showFab ? (
        <button
          aria-label="New capture"
          className={styles.fab}
          onClick={() => setFlowId("sheet")}
          title="New capture"
          type="button"
        >
          <Plus aria-hidden="true" size={22} />
        </button>
      ) : null}
    </div>
  );
}

function titleForFlow(flowId: FlowId) {
  if (flowId === "sheet") return "Capture";
  if (flowId === "quick-edit") return "Quick Edit";
  if (flowId === "search") return "Search";
  if (flowId === "collections" || flowId === "collection-detail" || flowId === "new-collection") return "Library";
  return "Today";
}

function TopBar({ title, setFlowId }: { title: string; setFlowId: (flowId: FlowId) => void }) {
  return (
    <header className={styles.topBar}>
      <div>
        <p>{language.appName}</p>
        <h3>{title}</h3>
      </div>
      <button aria-label="Search" className={styles.iconButton} onClick={() => setFlowId("search")} title="Search" type="button">
        <Search aria-hidden="true" size={18} />
      </button>
    </header>
  );
}

function ZeroCaptureToday({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.emptyHero}>
        <p className={styles.todayDate}>Monday, May 25</p>
        <h2>Save it before the thought slips</h2>
      </div>

      <section className={styles.shareInstruction} aria-label="Native share guidance">
        <span className={styles.instructionIcon}>
          <Share2 aria-hidden="true" size={18} />
        </span>
        <div>
          <h3>Share from any app</h3>
          <p>Links, screenshots, places, posts, notes.</p>
        </div>
      </section>

      <button className={styles.primaryAction} onClick={() => setFlowId("sheet")} type="button">
        <Link2 aria-hidden="true" size={18} />
        <span>Paste copied link</span>
      </button>

      <div className={styles.actionGrid}>
        <ActionButton
          icon={<StickyNote aria-hidden="true" size={17} />}
          onClick={() => setFlowId("sheet")}
        >
          Add note
        </ActionButton>
        <ActionButton
          icon={<ImageIcon aria-hidden="true" size={17} />}
          onClick={() => setFlowId("sheet")}
        >
          Upload image
        </ActionButton>
      </div>

      <section className={styles.plainSection}>
        <h3>Recent</h3>
        <p>Your first save will appear here.</p>
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

      <div className={styles.progressBlock}>
        <div className={styles.progressLabel}>
          <span>{language.states.analyzing}</span>
          <span>You can leave now</span>
        </div>
        <div className={styles.progressTrack}>
          <span />
        </div>
      </div>

      <div className={styles.bottomActions}>
        <button className={styles.secondaryAction} onClick={() => setFlowId("zero")} type="button">
          Done
        </button>
        <button className={styles.primaryAction} onClick={() => setFlowId("notification")} type="button">
          <Bell aria-hidden="true" size={18} />
          <span>Tell me when ready</span>
        </button>
      </div>
    </section>
  );
}

function CompletionNotification({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.notificationScene}>
      <div className={styles.wallpaperTime}>3:42</div>
      <button
        className={styles.notification}
        onClick={() => setFlowId("quick-edit")}
        type="button"
      >
        <div className={styles.notificationTop}>
          <span>{language.appName}</span>
          <small>now</small>
        </div>
        <h2>{language.states.ready}: ramen place in SoHo</h2>
        <p>Intent and collection look useful. Reminder suggestion needs your say.</p>
      </button>
      <button className={styles.secondaryAction} onClick={() => setFlowId("quick-edit")} type="button">
        Open Quick Edit
      </button>
    </section>
  );
}

function QuickEdit({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.captureSummary}>
        <p>{language.states.saved}</p>
        <h2>{mockCapture.title}</h2>
        <span>{mockCapture.source}</span>
      </div>

      <div className={styles.sentenceEditor}>
        <p>
          Saved as <Chip label="Change intent">{mockCapture.intent}</Chip> in{" "}
          <Chip label="Change collection">{mockCapture.collection}</Chip>.
        </p>
        <p>
          Reminder suggestion: <Chip label="Review reminder suggestion">{mockCapture.reminder}</Chip>.
        </p>
        <p>
          Place suggestion: <Chip label="Review place suggestion">{mockCapture.place}</Chip>.
        </p>
      </div>

      <div className={styles.rationaleList}>
        <Rationale label="Intent" text={mockCapture.rationale.intent} />
        <Rationale label="Collection" text={mockCapture.rationale.collection} />
        <Rationale label="Reminder" text={mockCapture.rationale.reminder} />
        <Rationale label="Place" text={`${mockCapture.rationale.place} Not based on device location.`} />
      </div>

      <section className={styles.suggestionBlock} aria-label="Reminder suggestion">
        <div>
          <p>{language.states.reminderSuggestion}</p>
          <strong>{mockCapture.reminder}</strong>
          <span>It stays a suggestion until you confirm it.</span>
        </div>
        <button className={styles.secondaryAction} type="button">
          Confirm
        </button>
      </section>

      <div className={styles.bottomActions}>
        <button className={styles.primaryAction} onClick={() => setFlowId("today-review")} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Keep meaning</span>
        </button>
        <button className={styles.secondaryAction} type="button">Change</button>
        <button className={styles.textAction} onClick={() => setFlowId("today-review")} type="button">
          Dismiss
        </button>
      </div>
    </section>
  );
}

function TodayReview({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  const recentObjects = memoryObjects.filter((item) => item.id !== "noodle-list");

  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>Monday, May 25</p>
        <h2>Today</h2>
      </div>

      <div className={styles.weekStrip} aria-label="Week">
        {weekDays.map((item) => (
          <button data-active={item.active} key={`${item.day}-${item.date}`} type="button">
            <span>{item.day}</span>
            <strong>{item.date}</strong>
          </button>
        ))}
      </div>

      <button className={styles.reviewModule} onClick={() => setFlowId("quick-edit")} type="button">
        <div>
          <p>{language.states.reviewNeeds}</p>
          <span>Suggestions waiting, no reminders added yet</span>
        </div>
        <ChevronRight aria-hidden="true" size={19} />
      </button>

      <section className={styles.agendaPanel} aria-label="Today agenda">
        <div className={styles.sectionHeaderRow}>
          <h3>Agenda</h3>
          <span>Suggestions only</span>
        </div>
        <div className={styles.agendaTimeline}>
          {agendaItems.map((item) => (
            <button className={styles.agendaItem} key={item.title} onClick={() => setFlowId("quick-edit")} type="button">
              <span className={styles.agendaTime}>
                <strong>{item.time}</strong>
                {item.meridiem ? <small>{item.meridiem}</small> : null}
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
            <MemoryObjectRow item={item} key={item.id} onClick={() => setFlowId("collection-detail")} />
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

function SearchScreen({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  return (
    <section className={styles.screenStack}>
      <div className={styles.searchIntro}>
        <h2>Search by what you remember</h2>
        <p>Places, screenshots, links, notes, and fuzzy fragments.</p>
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
        <button type="button">Place</button>
        <button type="button">Time</button>
      </div>

      <section className={styles.privacyBlock} aria-label="Recent searches privacy">
        <button
          aria-expanded={showRecentSearches}
          className={styles.privacyToggle}
          onClick={() => setShowRecentSearches((current) => !current)}
          type="button"
        >
          <EyeOff aria-hidden="true" size={16} />
          <span>{showRecentSearches ? "Hide recent searches" : "Recent searches hidden"}</span>
          <ChevronRight aria-hidden="true" data-open={showRecentSearches} size={16} />
        </button>
        {showRecentSearches ? (
          <div className={styles.recentSearchList}>
            {recentSearches.map((query) => (
              <button key={query} type="button">{query}</button>
            ))}
          </div>
        ) : (
          <p>Queries stay collapsed by default because saved-memory searches can be personal.</p>
        )}
      </section>

      <section className={styles.plainSection}>
        <div className={styles.sectionHeaderRow}>
          <h3>Results</h3>
          <span>3 indexed saves</span>
        </div>
        <div className={styles.memoryList}>
          {memoryObjects.map((item) => (
            <MemoryObjectRow item={item} key={item.id} onClick={() => setFlowId("collection-detail")} />
          ))}
        </div>
      </section>

    </section>
  );
}

function CollectionsScreen({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>Library lens</p>
        <h2>Collections</h2>
      </div>

      <button className={styles.createCollection} onClick={() => setFlowId("new-collection")} type="button">
        <FolderPlus aria-hidden="true" size={18} />
        <span>Create empty collection</span>
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
              <em>{item.suggestionState}</em>
            </span>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CollectionDetail({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.collectionHeader}>
        <p className={styles.todayDate}>Collection</p>
        <h2>NYC restaurants</h2>
        <span>2 saves. Sharebook can suggest future captures here, but nothing new is created without review.</span>
      </div>

      <button className={styles.reviewModule} onClick={() => setFlowId("quick-edit")} type="button">
        <div>
          <p>{language.states.collectionSuggestion}</p>
          <span>Ramen reel may belong here</span>
        </div>
        <ChevronRight aria-hidden="true" size={19} />
      </button>

      <section className={styles.plainSection}>
        <h3>All in this collection</h3>
        <div className={styles.memoryList}>
          {memoryObjects.slice(0, 2).map((item) => (
            <MemoryObjectRow item={item} key={item.id} />
          ))}
        </div>
      </section>
    </section>
  );
}

function NewCollection({ setFlowId }: { setFlowId: (flowId: FlowId) => void }) {
  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>New collection</p>
        <h2>Create before you need it</h2>
      </div>

      <label className={styles.fieldLabel}>
        <span>Name</span>
        <input className={styles.textInput} defaultValue="Japan trip" aria-label="Collection name" />
      </label>

      <section className={styles.emptyCollectionPreview}>
        <FolderPlus aria-hidden="true" size={20} />
        <div>
          <h3>Japan trip</h3>
          <p>No saves yet. Sharebook can suggest matching captures here after analysis.</p>
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
    { label: "Today", flow: "today-review" as FlowId, active: flowId === "zero" || flowId === "today-review", icon: <CalendarClock aria-hidden="true" size={17} /> },
    { label: "Search", flow: "search" as FlowId, active: flowId === "search", icon: <Search aria-hidden="true" size={17} /> },
    {
      label: "Library",
      flow: "collections" as FlowId,
      active: flowId === "collections" || flowId === "collection-detail" || flowId === "new-collection",
      icon: <Library aria-hidden="true" size={17} />
    },
    { label: "Settings", flow: "zero" as FlowId, active: false, icon: <Settings aria-hidden="true" size={17} /> }
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Primary">
      {nav.map((item) => (
        <button
          className={styles.navButton}
          data-active={item.active}
          key={item.label}
          onClick={() => setFlowId(item.flow)}
          type="button"
        >
          {item.icon}
          <span>{item.label}</span>
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
        <small>{item.context}</small>
        <EvidenceChips reasons={item.reasons} />
      </span>
      <span className={styles.memoryMeta}>
        <span className={styles.collectionBadge}>{item.collection}</span>
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

function EvidenceChips({ reasons }: { reasons: (typeof memoryObjects)[number]["reasons"] }) {
  return (
    <span className={styles.evidenceChips} aria-label="Match reasons">
      {reasons.map((reason) => (
        <span className={styles.evidenceChip} key={`${reason.label}-${reason.value}`}>
          <b>{reason.label}</b>
          {reason.value}
        </span>
      ))}
    </span>
  );
}

function Chip({
  children,
  label,
  selected = false
}: {
  children: React.ReactNode;
  label?: string;
  selected?: boolean;
}) {
  return (
    <button aria-label={label} className={styles.editorChip} data-selected={selected} type="button">
      {children}
    </button>
  );
}

function Rationale({ label, text }: { label: string; text: string }) {
  return (
    <div className={styles.rationale}>
      <MessageSquareText aria-hidden="true" size={15} />
      <p>
        <strong>{label}</strong>
        <span>{text}</span>
      </p>
    </div>
  );
}
