"use client";

import {
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Library,
  Link2,
  MapPin,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
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

const directions = [
  {
    id: "native-calm",
    name: "Native Calm",
    note: "Warm, familiar, low-friction.",
    accent: "Quiet green"
  },
  {
    id: "personal-archive",
    name: "Personal Archive",
    note: "Tactile saved-memory rows.",
    accent: "Soft amber"
  },
  {
    id: "fast-utility",
    name: "Fast Utility",
    note: "Dense, direct, dogfood-ready.",
    accent: "Clear blue"
  }
] as const;

const flows = [
  { id: "zero", label: "Today", shortLabel: "Today" },
  { id: "sheet", label: "Capture Sheet", shortLabel: "Capture" },
  { id: "receipt", label: "Capture Receipt", shortLabel: "Saved" },
  { id: "notification", label: "Completion Notification", shortLabel: "Ready" },
  { id: "quick-edit", label: "Quick Edit", shortLabel: "Edit" },
  { id: "today-review", label: "Today with Review", shortLabel: "Review" }
] as const;

type DirectionId = (typeof directions)[number]["id"];
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

const nearbyCaptures = [
  { title: "Ramen reel", meta: "try this place | reminder suggested | NYC restaurants" },
  { title: "Concert poster", meta: "date found | needs review" }
];

export default function ConsumerRedesignPage() {
  const [directionId, setDirectionId] = useState<DirectionId>("native-calm");
  const [flowId, setFlowId] = useState<FlowId>("zero");

  const direction = useMemo(
    () => directions.find((item) => item.id === directionId) ?? directions[0],
    [directionId]
  );
  const flow = useMemo(() => flows.find((item) => item.id === flowId) ?? flows[0], [flowId]);

  return (
    <main className={styles.page} data-direction={directionId}>
      <section className={styles.workspace} aria-labelledby="prototype-title">
        <div className={styles.leftRail}>
          <p className={styles.eyebrow}>Consumer loop prototype</p>
          <h1 id="prototype-title">{language.appName}</h1>
          <p className={styles.lede}>
            Compare the first save-to-review loop without changing the dogfood mobile app.
          </p>

          <div className={styles.controlGroup} aria-label="Visual direction">
            <p className={styles.controlLabel}>Direction</p>
            <div className={styles.directionList}>
              {directions.map((item) => (
                <button
                  className={styles.directionButton}
                  data-active={item.id === directionId}
                  key={item.id}
                  onClick={() => setDirectionId(item.id)}
                  type="button"
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.note}</small>
                  </span>
                  <span className={styles.directionAccent}>{item.accent}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.previewStage}>
          <div className={styles.stageHeader}>
            <div>
              <p className={styles.eyebrow}>{direction.name}</p>
              <h2>{flow.label}</h2>
            </div>
            <div className={styles.stageStatus}>
              <Sparkles aria-hidden="true" size={16} />
              <span>{language.confidence.maybe}</span>
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

          <div className={styles.checklist}>
            <p className={styles.controlLabel}>Guardrails</p>
            <CheckLine>Capture saves before analysis.</CheckLine>
            <CheckLine>Reminder stays a suggestion.</CheckLine>
            <CheckLine>Quick Edit is sentence-like.</CheckLine>
          </div>
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
  return (
    <div className={styles.appSurface}>
      <TopBar title={flowId === "sheet" ? "Capture" : "Today"} />
      <div className={styles.screenBody}>
        {flowId === "zero" ? <ZeroCaptureToday setFlowId={setFlowId} /> : null}
        {flowId === "sheet" ? <CaptureSheet setFlowId={setFlowId} /> : null}
        {flowId === "receipt" ? <CaptureReceipt setFlowId={setFlowId} /> : null}
        {flowId === "notification" ? <CompletionNotification setFlowId={setFlowId} /> : null}
        {flowId === "quick-edit" ? <QuickEdit setFlowId={setFlowId} /> : null}
        {flowId === "today-review" ? <TodayReview setFlowId={setFlowId} /> : null}
      </div>
      <BottomNav />
      <button
        aria-label="New capture"
        className={styles.fab}
        onClick={() => setFlowId("sheet")}
        title="New capture"
        type="button"
      >
        <Plus aria-hidden="true" size={22} />
      </button>
    </div>
  );
}

function TopBar({ title }: { title: string }) {
  return (
    <header className={styles.topBar}>
      <div>
        <p>{language.appName}</p>
        <h3>{title}</h3>
      </div>
      <button aria-label="Search" className={styles.iconButton} title="Search" type="button">
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
        <h2>Save something you want to remember</h2>
        <button className={styles.primaryAction} type="button">
          <Share2 aria-hidden="true" size={18} />
          <span>Share from another app</span>
        </button>
      </div>

      <div className={styles.actionGrid}>
        <ActionButton icon={<Link2 aria-hidden="true" size={17} />} onClick={() => setFlowId("sheet")}>
          Paste link
        </ActionButton>
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
        <p>No captures yet</p>
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
          <span>about 20 sec</span>
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
          <span>Notify me</span>
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
        <p>Try place, NYC restaurants, reminder suggested</p>
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
      </div>

      <div className={styles.sentenceEditor}>
        <p>
          Saved as <Chip>{mockCapture.intent}</Chip> in <Chip>{mockCapture.collection}</Chip>.
        </p>
        <p>
          Reminder suggested: <Chip>{mockCapture.reminder}</Chip>.
        </p>
      </div>

      <div className={styles.rationaleList}>
        <Rationale label="Intent" text={mockCapture.rationale.intent} />
        <Rationale label="Collection" text={mockCapture.rationale.collection} />
        <Rationale label="Reminder" text={mockCapture.rationale.reminder} />
        <Rationale label="Place" text={mockCapture.rationale.place} />
      </div>

      <div className={styles.chipPicker}>
        <p>Saved as</p>
        <div>
          <Chip selected>try this place</Chip>
          <Chip>send/share</Chip>
          <Chip>plan trip</Chip>
          <Chip>review later</Chip>
        </div>
      </div>

      <div className={styles.bottomActions}>
        <button className={styles.primaryAction} onClick={() => setFlowId("today-review")} type="button">
          <Check aria-hidden="true" size={18} />
          <span>Accept</span>
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
  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>Monday, May 25</p>
        <h2>Today</h2>
      </div>

      <button className={styles.reviewModule} onClick={() => setFlowId("quick-edit")} type="button">
        <div>
          <p>{language.states.reviewNeeds}</p>
          <span>{language.confidence.maybe} suggestions waiting</span>
        </div>
        <ChevronRight aria-hidden="true" size={19} />
      </button>

      <section className={styles.plainSection}>
        <h3>Recently saved</h3>
        <div className={styles.captureRows}>
          {nearbyCaptures.map((item) => (
            <button className={styles.captureRow} key={item.title} type="button">
              <span>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
          ))}
        </div>
      </section>

      <section className={styles.plainSection}>
        <h3>Coming up</h3>
        <p>Nothing coming up</p>
      </section>

      <section className={styles.placeStrip}>
        <MapPin aria-hidden="true" size={17} />
        <span>1 saved place</span>
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

function BottomNav() {
  const nav = [
    { label: "Today", icon: <CalendarClock aria-hidden="true" size={17} /> },
    { label: "Search", icon: <Search aria-hidden="true" size={17} /> },
    { label: "Library", icon: <Library aria-hidden="true" size={17} /> },
    { label: "Settings", icon: <Settings aria-hidden="true" size={17} /> }
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Primary">
      {nav.map((item) => (
        <button className={styles.navButton} data-active={item.label === "Today"} key={item.label} type="button">
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Chip({
  children,
  selected = false
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <button className={styles.editorChip} data-selected={selected} type="button">
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

function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.checkLine}>
      <Check aria-hidden="true" size={15} />
      <span>{children}</span>
    </p>
  );
}
