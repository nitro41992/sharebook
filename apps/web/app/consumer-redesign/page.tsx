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
  { id: "today-review", label: "Today With Review", shortLabel: "Review" }
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

const nearbyCaptures = [
  { title: "Ramen reel", meta: "try this place | reminder suggestion | NYC restaurants" },
  { title: "Concert poster", meta: "date found | needs review" }
];

const reviewItems = [
  {
    title: "Ramen reel",
    state: language.confidence.maybe,
    detail: "Reminder suggestion needs confirmation"
  },
  {
    title: "Concert poster",
    state: language.confidence.notSure,
    detail: "Date found, intent needs a quick look"
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
            A phone-native save-to-review loop: instant capture, quiet analysis, and fast meaning
            correction.
          </p>

          <div className={styles.directionPanel} aria-label="Canonical design direction">
            <p className={styles.controlLabel}>Direction</p>
            <h2>Native Calm, Personal Memory</h2>
            <p>
              Warm paper surfaces, graphite text, muted green actions, amber review cues. The
              interface earns trust by saving first and asking only when a suggestion creates an
              obligation.
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

          <div className={styles.checklist}>
            <p className={styles.controlLabel}>Guardrails</p>
            <CheckLine>Capture saves before analysis.</CheckLine>
            <CheckLine>Reminder stays a suggestion.</CheckLine>
            <CheckLine>Quick Edit asks only for meaningful corrections.</CheckLine>
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
  const showFab = flowId === "zero" || flowId === "today-review";
  const showNavigation = flowId === "zero" || flowId === "today-review";

  return (
    <div className={styles.appSurface}>
      <TopBar title={flowId === "sheet" ? "Capture" : flowId === "quick-edit" ? "Quick Edit" : "Today"} />
      <div className={`${styles.screenBody} ${showNavigation ? "" : styles.screenBodyFocused}`}>
        {flowId === "zero" ? <ZeroCaptureToday setFlowId={setFlowId} /> : null}
        {flowId === "sheet" ? <CaptureSheet setFlowId={setFlowId} /> : null}
        {flowId === "receipt" ? <CaptureReceipt setFlowId={setFlowId} /> : null}
        {flowId === "notification" ? <CompletionNotification setFlowId={setFlowId} /> : null}
        {flowId === "quick-edit" ? <QuickEdit setFlowId={setFlowId} /> : null}
        {flowId === "today-review" ? <TodayReview setFlowId={setFlowId} /> : null}
      </div>
      {showNavigation ? <BottomNav /> : null}
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
      </div>

      <section className={styles.shareInstruction} aria-label="Native share guidance">
        <span className={styles.instructionIcon}>
          <Share2 aria-hidden="true" size={18} />
        </span>
        <div>
          <h3>Best first save: use Sharebook from another app</h3>
          <p>Use the share button in Safari, Instagram, Maps, or Photos.</p>
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
        <p>No captures yet. Your first save will appear here immediately.</p>
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
      </div>

      <div className={styles.rationaleList}>
        <Rationale label="Intent" text={mockCapture.rationale.intent} />
        <Rationale label="Collection" text={mockCapture.rationale.collection} />
        <Rationale label="Reminder" text={mockCapture.rationale.reminder} />
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
  return (
    <section className={styles.screenStack}>
      <div className={styles.todayHeader}>
        <p className={styles.todayDate}>Monday, May 25</p>
        <h2>Today</h2>
      </div>

      <button className={styles.reviewModule} onClick={() => setFlowId("quick-edit")} type="button">
        <div>
          <p>{language.states.reviewNeeds}</p>
          <span>Suggestions waiting, no reminders added yet</span>
        </div>
        <ChevronRight aria-hidden="true" size={19} />
      </button>

      <section className={styles.reviewQueue} aria-label="Review queue">
        {reviewItems.map((item) => (
          <button className={styles.reviewItem} key={item.title} onClick={() => setFlowId("quick-edit")} type="button">
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <em>{item.state}</em>
          </button>
        ))}
      </section>

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

function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.checkLine}>
      <Check aria-hidden="true" size={15} />
      <span>{children}</span>
    </p>
  );
}
