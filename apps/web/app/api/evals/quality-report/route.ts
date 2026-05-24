import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";

type FeedbackNotes = {
  kind?: string;
  looksRight?: boolean;
  issues?: string[];
  comment?: string;
};

type FixtureForReport = {
  label: string | null;
  expected_intent: string | null;
  required_entities: string[] | null;
  expected_reminders: string[] | null;
  search_queries: string[] | null;
  notes: string | null;
};

function parseNotes(notes: string | null): FeedbackNotes | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as FeedbackNotes;
    return parsed.kind === "mini_feedback" ? parsed : null;
  } catch {
    return null;
  }
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function suggestionForIssue(issue: string) {
  switch (issue) {
    case "wrong_intent":
      return {
        pattern: "Wrong save intent",
        proposed_prompt_wording:
          "When choosing default_intent, prioritize why the user saved the capture over the content format or topic. Use the user's likely next action as the deciding signal.",
        risk: "May move some genuinely passive saves away from watch/read later.",
        expected_improvement: "Fewer captures classified by content category when the save reason is action-oriented."
      };
    case "missing_entity":
    case "wrong_entity":
      return {
        pattern: "Entity extraction misses",
        proposed_prompt_wording:
          "Extract entities that make the capture findable later, including places, products, creators, events, dates, prices, organizations, and named concepts when evidence is present.",
        risk: "Can increase entity noise if the model treats every minor noun as important.",
        expected_improvement: "Better search recall and stronger reminders because key names are preserved."
      };
    case "missing_reminder":
    case "bad_reminder":
      return {
        pattern: "Reminder quality issues",
        proposed_prompt_wording:
          "Suggest reminders only when a concrete time, place, event, trip, deadline, or clear future trigger is present; otherwise leave suggested_reminders empty.",
        risk: "Some useful but implicit reminders may be omitted.",
        expected_improvement: "Fewer noisy reminders and clearer reminder rationales."
      };
    case "bad_suggested_action":
      return {
        pattern: "Suggested action quality issues",
        proposed_prompt_wording:
          "Suggested actions must be specific to the capture and useful as a next step. Avoid generic actions that duplicate normal app affordances.",
        risk: "May reduce the number of suggested actions shown.",
        expected_improvement: "Actions become less noisy and more tied to the inferred save intent."
      };
    case "search_would_fail":
      return {
        pattern: "Search expectation misses",
        proposed_prompt_wording:
          "Generate search_phrases using fuzzy memory language the user might type later, not only exact titles or visible text.",
        risk: "Can add broader phrases that need indexing discipline.",
        expected_improvement: "Captures become easier to find from imperfect human memory."
      };
    case "misleading_rationale":
      return {
        pattern: "Misleading rationale",
        proposed_prompt_wording:
          "Write default_intent.rationale as evidence-backed reasoning for the save intent. Do not explain the content when the user motivation is uncertain.",
        risk: "Rationales may become more cautious.",
        expected_improvement: "Review feedback becomes easier because rationale failures reveal uncertainty instead of sounding overconfident."
      };
    default:
      return null;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("eval_fixtures")
    .select("label, expected_intent, required_entities, expected_reminders, search_queries, notes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const issueCounts: Record<string, number> = {};
  const overusedIntents: Record<string, number> = {};
  const missingEntityExamples: string[] = [];
  const reminderIssueExamples: string[] = [];
  const searchIssueExamples: string[] = [];
  const comments: Array<{ label: string; comment: string }> = [];
  const suggestionKeys = new Set<string>();

  for (const fixture of (data ?? []) as FixtureForReport[]) {
    const notes = parseNotes(fixture.notes);
    if (!notes) continue;
    const label = fixture.label ?? "Untitled feedback";

    if (notes.comment?.trim()) {
      comments.push({ label, comment: notes.comment.trim() });
    }

    for (const issue of notes.issues ?? []) {
      increment(issueCounts, issue);
      suggestionKeys.add(issue);
      if (issue === "wrong_intent" && fixture.expected_intent) {
        increment(overusedIntents, fixture.expected_intent);
      }
      if ((issue === "missing_entity" || issue === "wrong_entity") && fixture.required_entities?.length) {
        missingEntityExamples.push(`${label}: ${fixture.required_entities.join(", ")}`);
      }
      if (
        (issue === "missing_reminder" || issue === "bad_reminder") &&
        fixture.expected_reminders?.length
      ) {
        reminderIssueExamples.push(`${label}: ${fixture.expected_reminders.join(", ")}`);
      }
      if (issue === "search_would_fail" && fixture.search_queries?.length) {
        searchIssueExamples.push(`${label}: ${fixture.search_queries.join(", ")}`);
      }
    }
  }

  const promptSuggestions = [...suggestionKeys]
    .map(suggestionForIssue)
    .filter((suggestion): suggestion is NonNullable<ReturnType<typeof suggestionForIssue>> =>
      Boolean(suggestion)
    );

  return NextResponse.json({
    report: {
      total_feedback: (data ?? []).filter((fixture: FixtureForReport) => parseNotes(fixture.notes))
        .length,
      issue_counts: issueCounts,
      overused_intents: overusedIntents,
      missing_entity_examples: missingEntityExamples.slice(0, 12),
      reminder_issue_examples: reminderIssueExamples.slice(0, 12),
      search_issue_examples: searchIssueExamples.slice(0, 12),
      comments: comments.slice(0, 20),
      prompt_suggestions: promptSuggestions
    }
  });
}
