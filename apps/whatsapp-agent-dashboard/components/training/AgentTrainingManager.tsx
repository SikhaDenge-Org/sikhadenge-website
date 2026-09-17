"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "./AgentTrainingManager.module.css";

type TrainingTab = "bank" | "teach" | "review" | "test" | "flow";
type BankSource = "BUILT_IN" | "CUSTOM_APPROVED";

type QuestionBankEntry = {
  id: string;
  source: BankSource;
  category: string;
  intent: string;
  questions: string[];
  keywords: string[];
  answer: { en: string; hinglish: string };
  nextQuestion: { en: string | null; hinglish: string | null };
  status: "ACTIVE";
  updatedAt: string | null;
};

type BankSummary = {
  total: number;
  builtIn: number;
  customApproved: number;
};

type LearningSuggestion = {
  id: string;
  category: string;
  userQuestion: string;
  originalAnswer: string | null;
  proposedAnswer: string;
  correctionReason: string | null;
  createdAt: string;
  sourceMessageId: string | null;
  redactedPayload: unknown;
};

type PreviewDecision = {
  reply: string;
  language: string;
  intent: string;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: string | null;
  nextQuestion: string | null;
  model: string | null;
  knowledgeReferences: Array<{
    title: string;
    heading: string | null;
    score: number;
  }>;
};

type AgentTrainingManagerProps = {
  canManage: boolean;
};

const CATEGORY_OPTIONS = [
  "COURSE_DETAILS",
  "COURSE_SCHEDULE",
  "CLASS_MODE",
  "ELIGIBILITY",
  "SYLLABUS",
  "CAREER",
  "FREELANCING",
  "DEMO_CLASS",
  "ADMISSION",
  "FEES",
  "CERTIFICATE",
  "SUPPORT",
  "FAQ",
  "OTHER",
] as const;

const QUICK_TESTS = [
  "Course details",
  "Class timing kya hai?",
  "Week mein kitni classes hoti hain?",
  "Beginner join kar sakta hai?",
  "AI seekhne ke baad career scope kya hai?",
  "Demo kaise join karein?",
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sourceLabel(source: BankSource): string {
  return source === "CUSTOM_APPROVED" ? "Custom approved" : "Built-in";
}

function isAutoCaptured(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).autoCaptured === true,
  );
}

export default function AgentTrainingManager({ canManage }: AgentTrainingManagerProps) {
  const [activeTab, setActiveTab] = useState<TrainingTab>("bank");
  const [entries, setEntries] = useState<QuestionBankEntry[]>([]);
  const [bankSummary, setBankSummary] = useState<BankSummary>({
    total: 0,
    builtIn: 0,
    customApproved: 0,
  });
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [loadingBank, setLoadingBank] = useState(canManage);
  const [loadingReview, setLoadingReview] = useState(canManage);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [bankSearch, setBankSearch] = useState("");
  const [bankSource, setBankSource] = useState<"ALL" | BankSource>("ALL");
  const [bankCategory, setBankCategory] = useState("ALL");

  const [category, setCategory] = useState("COURSE_DETAILS");
  const [mainQuestion, setMainQuestion] = useState("");
  const [alternativeQuestions, setAlternativeQuestions] = useState("");
  const [approvedAnswer, setApprovedAnswer] = useState("");
  const [trainingReason, setTrainingReason] = useState("");
  const [savingTraining, setSavingTraining] = useState(false);

  const [reviewAnswers, setReviewAnswers] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [testMessage, setTestMessage] = useState("Course details");
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<PreviewDecision | null>(null);

  const loadQuestionBank = useCallback(async () => {
    if (!canManage) return;
    setLoadingBank(true);
    try {
      const response = await fetch("/api/agent-training/question-bank", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        entries?: QuestionBankEntry[];
        summary?: BankSummary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Question bank could not be loaded.");
      setEntries(payload.entries || []);
      setBankSummary(
        payload.summary || { total: 0, builtIn: 0, customApproved: 0 },
      );
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Question bank could not be loaded.",
      });
    } finally {
      setLoadingBank(false);
    }
  }, [canManage]);

  const loadSuggestions = useCallback(async () => {
    if (!canManage) return;
    setLoadingReview(true);
    try {
      const response = await fetch("/api/learning?limit=100", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        suggestions?: LearningSuggestion[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Review queue could not be loaded.");
      const nextSuggestions = payload.suggestions || [];
      setSuggestions(nextSuggestions);
      setReviewAnswers((current) => {
        const next = { ...current };
        for (const suggestion of nextSuggestions) {
          if (!(suggestion.id in next)) {
            next[suggestion.id] = isAutoCaptured(suggestion.redactedPayload)
              ? ""
              : suggestion.proposedAnswer;
          }
        }
        return next;
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Review queue could not be loaded.",
      });
    } finally {
      setLoadingReview(false);
    }
  }, [canManage]);

  useEffect(() => {
    void Promise.all([loadQuestionBank(), loadSuggestions()]);
  }, [loadQuestionBank, loadSuggestions]);

  const categories = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.category))).sort(),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase("en-IN");
    return entries.filter((entry) => {
      if (bankSource !== "ALL" && entry.source !== bankSource) return false;
      if (bankCategory !== "ALL" && entry.category !== bankCategory) return false;
      if (!query) return true;
      const haystack = [
        entry.category,
        entry.intent,
        ...entry.questions,
        ...entry.keywords,
        entry.answer.en,
        entry.answer.hinglish,
      ]
        .join(" ")
        .toLocaleLowerCase("en-IN");
      return haystack.includes(query);
    });
  }, [bankCategory, bankSearch, bankSource, entries]);

  async function submitTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || savingTraining) return;
    setNotice(null);
    setSavingTraining(true);

    const alternatives = alternativeQuestions
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const questionBlock = [
      `Main question: ${mainQuestion.trim()}`,
      alternatives.length > 0
        ? `Alternative questions:\n${alternatives.map((value) => `- ${value}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          userQuestion: questionBlock,
          proposedAnswer: approvedAnswer,
          correctionReason:
            trainingReason.trim() || "Manual Agent Training dashboard entry.",
        }),
      });
      const payload = (await response.json()) as {
        result?: { suggestionId: string; duplicate: boolean };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Training entry could not be saved.");

      setMainQuestion("");
      setAlternativeQuestions("");
      setApprovedAnswer("");
      setTrainingReason("");
      setNotice({
        type: "success",
        text: payload.result?.duplicate
          ? "This training entry already exists in the review queue."
          : "Training entry saved. Review and approve it before the agent can use it.",
      });
      await loadSuggestions();
      setActiveTab("review");
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Training entry could not be saved.",
      });
    } finally {
      setSavingTraining(false);
    }
  }

  async function reviewSuggestion(
    suggestion: LearningSuggestion,
    decision: "APPROVE" | "REJECT",
  ) {
    if (!canManage || reviewingId) return;
    const correctedAnswer = reviewAnswers[suggestion.id]?.trim() || "";
    if (decision === "APPROVE" && correctedAnswer.length < 5) {
      setNotice({ type: "error", text: "Approved reply is required before training." });
      return;
    }

    setReviewingId(suggestion.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/learning/${suggestion.id}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          correctedAnswer: decision === "APPROVE" ? correctedAnswer : null,
          reason:
            decision === "APPROVE"
              ? "Approved from Agent Training dashboard."
              : "Rejected from Agent Training dashboard.",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Training review failed.");

      setNotice({
        type: "success",
        text:
          decision === "APPROVE"
            ? "Approved and trained. The answer is now available to the agent."
            : "Training suggestion rejected.",
      });
      await Promise.all([loadSuggestions(), loadQuestionBank()]);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Training review failed.",
      });
    } finally {
      setReviewingId(null);
    }
  }

  async function testAgent(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!testMessage.trim() || testing) return;
    setTesting(true);
    setNotice(null);
    setPreview(null);
    try {
      const response = await fetch("/api/agent/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage.trim() }),
      });
      const payload = (await response.json()) as {
        decision?: PreviewDecision;
        error?: string;
      };
      if (!response.ok || !payload.decision) {
        throw new Error(payload.error || "Agent preview could not be generated.");
      }
      setPreview(payload.decision);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Agent preview could not be generated.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (!canManage) {
    return (
      <div className={styles.accessCard}>
        <strong>Admin or Manager access required</strong>
        <p>Only authorised users can view, approve and train the WhatsApp agent.</p>
      </div>
    );
  }

  return (
    <div className={styles.trainingManager}>
      <section className={styles.summaryGrid} aria-label="Agent training summary">
        <article>
          <span>Total active answers</span>
          <strong>{bankSummary.total}</strong>
          <small>Built-in + approved custom</small>
        </article>
        <article>
          <span>Built-in question bank</span>
          <strong>{bankSummary.builtIn}</strong>
          <small>Protected system answers</small>
        </article>
        <article>
          <span>Custom trained answers</span>
          <strong>{bankSummary.customApproved}</strong>
          <small>Human approved knowledge</small>
        </article>
        <article>
          <span>Waiting for review</span>
          <strong>{suggestions.length}</strong>
          <small>Approve before AI use</small>
        </article>
      </section>

      <section className={styles.courseLock}>
        <div>
          <span>Student-facing course lock</span>
          <strong>Become AI Expert Program</strong>
        </div>
        <p>
          10 weeks · Live online · 8 PM–10 PM IST · 2-hour class · 3 classes per
          week on alternate days
        </p>
      </section>

      {notice ? (
        <div className={`${styles.notice} ${styles[notice.type]}`} role="status">
          {notice.text}
        </div>
      ) : null}

      <nav className={styles.tabs} aria-label="Agent training sections">
        {[
          ["bank", "Question Bank", bankSummary.total],
          ["teach", "Teach Agent", null],
          ["review", "Review Queue", suggestions.length],
          ["test", "Test Agent", null],
          ["flow", "Chat Flow", null],
        ].map(([value, label, count]) => (
          <button
            key={String(value)}
            type="button"
            className={activeTab === value ? styles.activeTab : ""}
            onClick={() => setActiveTab(value as TrainingTab)}
          >
            {label}
            {typeof count === "number" ? <span>{count}</span> : null}
          </button>
        ))}
      </nav>

      {activeTab === "bank" ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Active answer library</p>
              <h3>Question Bank</h3>
              <span>See exactly which customer questions map to which approved replies.</span>
            </div>
            <button type="button" onClick={() => void loadQuestionBank()}>
              Refresh
            </button>
          </header>

          <div className={styles.filters}>
            <input
              value={bankSearch}
              onChange={(event) => setBankSearch(event.target.value)}
              placeholder="Search question, keyword or answer"
            />
            <select
              value={bankSource}
              onChange={(event) =>
                setBankSource(event.target.value as "ALL" | BankSource)
              }
            >
              <option value="ALL">All sources</option>
              <option value="BUILT_IN">Built-in</option>
              <option value="CUSTOM_APPROVED">Custom approved</option>
            </select>
            <select
              value={bankCategory}
              onChange={(event) => setBankCategory(event.target.value)}
            >
              <option value="ALL">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.bankMeta}>
            Showing <strong>{filteredEntries.length}</strong> of {entries.length} active answers
          </div>

          <div className={styles.bankList}>
            {loadingBank ? <div className={styles.empty}>Loading question bank…</div> : null}
            {!loadingBank && filteredEntries.length === 0 ? (
              <div className={styles.empty}>No matching question-bank entry found.</div>
            ) : null}
            {filteredEntries.map((entry) => (
              <article className={styles.bankCard} key={entry.id}>
                <div className={styles.bankCardTop}>
                  <div>
                    <span className={styles.sourceBadge}>{sourceLabel(entry.source)}</span>
                    <span className={styles.categoryBadge}>
                      {entry.category.replaceAll("_", " ")}
                    </span>
                  </div>
                  <small>{entry.intent.replaceAll("_", " ")}</small>
                </div>

                <div className={styles.questionBlock}>
                  <label>Customer questions</label>
                  <strong>{entry.questions[0]}</strong>
                  {entry.questions.slice(1).map((question) => (
                    <span key={question}>• {question}</span>
                  ))}
                </div>

                <div className={styles.answerGrid}>
                  <div>
                    <label>Approved Hinglish reply</label>
                    <p>{entry.answer.hinglish}</p>
                  </div>
                  <div>
                    <label>Approved English reply</label>
                    <p>{entry.answer.en}</p>
                  </div>
                </div>

                {entry.keywords.length > 0 ? (
                  <div className={styles.keywordRow}>
                    {entry.keywords.map((keyword) => (
                      <span key={keyword}>{keyword}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "teach" ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Manual training</p>
              <h3>Teach the Agent</h3>
              <span>Add a question, common variants and the exact approved WhatsApp reply.</span>
            </div>
          </header>

          <form className={styles.trainingForm} onSubmit={submitTraining}>
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Main customer question</span>
              <input
                value={mainQuestion}
                onChange={(event) => setMainQuestion(event.target.value)}
                placeholder="Example: Class timing kya hai?"
                minLength={3}
                maxLength={500}
                required
              />
            </label>

            <label>
              <span>Alternative questions <small>One per line</small></span>
              <textarea
                value={alternativeQuestions}
                onChange={(event) => setAlternativeQuestions(event.target.value)}
                rows={5}
                maxLength={4_000}
                placeholder={"Batch kitne baje hai?\nClass ka schedule batao\nWeek mein kitni classes hoti hain?"}
              />
            </label>

            <label>
              <span>Exact approved WhatsApp reply</span>
              <textarea
                value={approvedAnswer}
                onChange={(event) => setApprovedAnswer(event.target.value)}
                rows={8}
                minLength={5}
                maxLength={4_000}
                placeholder={"💻 Become AI Expert ki live-online classes 8 PM se 10 PM IST hoti hain...\n\n🎓 Free masterclass link ke liye DEMO reply kijiye."}
                required
              />
              <small>{approvedAnswer.length.toLocaleString("en-IN")} / 4,000 characters</small>
            </label>

            <label>
              <span>Training note <small>Optional</small></span>
              <input
                value={trainingReason}
                onChange={(event) => setTrainingReason(event.target.value)}
                placeholder="Why this answer is correct or what old reply it replaces"
                maxLength={2_000}
              />
            </label>

            <div className={styles.formFooter}>
              <p>
                Saving does not immediately change live replies. Approve the entry from the
                Review Queue first.
              </p>
              <button type="submit" disabled={savingTraining}>
                {savingTraining ? "Saving…" : "Save for Review"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === "review" ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Supervised learning</p>
              <h3>Review Queue</h3>
              <span>Approve only accurate replies. Approved entries become reusable knowledge.</span>
            </div>
            <button type="button" onClick={() => void loadSuggestions()}>
              Refresh
            </button>
          </header>

          <div className={styles.reviewList}>
            {loadingReview ? <div className={styles.empty}>Loading review queue…</div> : null}
            {!loadingReview && suggestions.length === 0 ? (
              <div className={styles.empty}>
                <strong>Review queue is clear</strong>
                <span>New manual training and unknown questions will appear here.</span>
              </div>
            ) : null}
            {suggestions.map((suggestion) => (
              <article className={styles.reviewCard} key={suggestion.id}>
                <div className={styles.reviewCardHeader}>
                  <div>
                    <span>{suggestion.category.replaceAll("_", " ")}</span>
                    {isAutoCaptured(suggestion.redactedPayload) ? (
                      <strong>Unknown question captured automatically</strong>
                    ) : (
                      <strong>Manual training entry</strong>
                    )}
                  </div>
                  <small>{formatDate(suggestion.createdAt)}</small>
                </div>

                <div className={styles.reviewQuestion}>
                  <label>Customer question</label>
                  <p>{suggestion.userQuestion}</p>
                </div>

                {suggestion.originalAnswer ? (
                  <div className={styles.originalReply}>
                    <label>Previous agent reply</label>
                    <p>{suggestion.originalAnswer}</p>
                  </div>
                ) : null}

                <label className={styles.reviewAnswer}>
                  <span>Approved reply to train</span>
                  <textarea
                    value={reviewAnswers[suggestion.id] || ""}
                    onChange={(event) =>
                      setReviewAnswers((current) => ({
                        ...current,
                        [suggestion.id]: event.target.value,
                      }))
                    }
                    rows={6}
                    maxLength={4_000}
                    placeholder="Write the final approved reply here."
                  />
                </label>

                {suggestion.correctionReason ? (
                  <p className={styles.reason}>Reason: {suggestion.correctionReason}</p>
                ) : null}

                <div className={styles.reviewActions}>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    disabled={reviewingId === suggestion.id}
                    onClick={() => void reviewSuggestion(suggestion, "REJECT")}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className={styles.approveButton}
                    disabled={reviewingId === suggestion.id}
                    onClick={() => void reviewSuggestion(suggestion, "APPROVE")}
                  >
                    {reviewingId === suggestion.id ? "Processing…" : "Approve & Train"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "test" ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Safe preview</p>
              <h3>Test Agent</h3>
              <span>Preview the final reply without sending any WhatsApp message.</span>
            </div>
          </header>

          <div className={styles.quickTests}>
            {QUICK_TESTS.map((message) => (
              <button key={message} type="button" onClick={() => setTestMessage(message)}>
                {message}
              </button>
            ))}
          </div>

          <form className={styles.testForm} onSubmit={testAgent}>
            <label>
              <span>Customer message</span>
              <textarea
                value={testMessage}
                onChange={(event) => setTestMessage(event.target.value)}
                rows={4}
                maxLength={4_000}
                placeholder="Type a customer question"
                required
              />
            </label>
            <button type="submit" disabled={testing}>
              {testing ? "Testing…" : "Generate Safe Preview"}
            </button>
          </form>

          {preview ? (
            <div className={styles.previewGrid}>
              <article className={styles.previewMeta}>
                <h4>Decision analysis</h4>
                <dl>
                  <div><dt>Intent</dt><dd>{preview.intent.replaceAll("_", " ")}</dd></div>
                  <div><dt>Language</dt><dd>{preview.language}</dd></div>
                  <div><dt>Confidence</dt><dd>{(preview.confidence * 100).toFixed(1)}%</dd></div>
                  <div><dt>Engine</dt><dd>{preview.model || "Rule engine"}</dd></div>
                  <div><dt>Human handoff</dt><dd>{preview.requiresHuman ? "Yes" : "No"}</dd></div>
                </dl>
                <p>{preview.decisionSummary}</p>
              </article>

              <article className={styles.whatsappPreview}>
                <div className={styles.phoneHeader}>
                  <span>S</span>
                  <div>
                    <strong>SikhaDenge API</strong>
                    <small>Agent preview · not sent</small>
                  </div>
                </div>
                <div className={styles.chatCanvas}>
                  <div className={styles.customerBubble}>{testMessage}</div>
                  <div className={styles.agentBubble}>{preview.reply}</div>
                </div>
              </article>

              <article className={styles.references}>
                <h4>Matched knowledge</h4>
                {preview.knowledgeReferences.length === 0 ? (
                  <p>No approved knowledge reference was attached.</p>
                ) : (
                  preview.knowledgeReferences.map((reference, index) => (
                    <div key={`${reference.title}-${index}`}>
                      <strong>{reference.heading || reference.title}</strong>
                      <span>{reference.title}</span>
                      <small>{(reference.score * 100).toFixed(1)}% match</small>
                    </div>
                  ))
                )}
              </article>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "flow" ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Conversation architecture</p>
              <h3>Student Chat Flow</h3>
              <span>The agent stays focused on Become AI Expert and moves naturally toward DEMO.</span>
            </div>
          </header>

          <div className={styles.flowTrack}>
            {[
              ["01", "Greeting", "Time-based greeting, asks how the learner is and introduces Become AI Expert."],
              ["02", "Understand question", "Detects timing, syllabus, eligibility, career, fees, demo or admission intent."],
              ["03", "Approved answer", "Uses fixed course rules first, then approved Question Bank and custom training."],
              ["04", "Natural qualification", "Asks background or goal only when it helps; never asks which course."],
              ["05", "Conversion", "Guides the learner to the free masterclass using the DEMO action."],
              ["06", "Human handover", "Payment, refund, complaint or explicit call requests go to the team safely."],
              ["07", "Supervised learning", "Unknown or weak answers enter Review Queue and require human approval."],
            ].map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.flowRules}>
            <h4>Locked agent rules</h4>
            <div>
              <span>✓ Only Become AI Expert is student-facing</span>
              <span>✓ Never ask “Which course?”</span>
              <span>✓ Fixed timing: 8 PM–10 PM IST</span>
              <span>✓ 3 alternate-day classes every week</span>
              <span>✓ No unverified fees, job or income promises</span>
              <span>✓ Unknown answers require review</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
