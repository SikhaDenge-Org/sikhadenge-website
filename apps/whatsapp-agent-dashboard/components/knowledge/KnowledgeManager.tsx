"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type KnowledgeStatus = "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";

type KnowledgeDocument = {
  id: string;
  title: string;
  category: string;
  sourceType: string;
  sourceUrl: string | null;
  version: number;
  status: KnowledgeStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { chunks: number };
};

type KnowledgeManagerProps = {
  canManage: boolean;
};

const CATEGORY_OPTIONS = [
  ["course", "Course information"],
  ["fees", "Fees and offers"],
  ["schedule", "Class schedule"],
  ["admission", "Admission process"],
  ["certificate", "Certificate policy"],
  ["policy", "Policies and rules"],
  ["faq", "Frequently asked questions"],
  ["other", "Other approved information"],
] as const;

const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function KnowledgeManager({ canManage }: KnowledgeManagerProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | KnowledgeStatus>("ALL");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("course");
  const [sourceUrl, setSourceUrl] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [content, setContent] = useState("");

  const loadDocuments = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);

    try {
      const response = await fetch("/api/knowledge/documents?limit=250", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        documents?: KnowledgeDocument[];
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || "Knowledge documents could not be loaded.");
      setDocuments(payload.documents || []);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Knowledge documents could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const counts = useMemo(() => {
    return documents.reduce(
      (summary, document) => {
        summary.total += 1;
        summary.chunks += document._count.chunks;
        summary[document.status] += 1;
        return summary;
      },
      {
        total: 0,
        chunks: 0,
        IN_REVIEW: 0,
        APPROVED: 0,
        REJECTED: 0,
        ARCHIVED: 0,
      },
    );
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesStatus = statusFilter === "ALL" || document.status === statusFilter;
      const matchesQuery =
        !query ||
        document.title.toLowerCase().includes(query) ||
        document.category.toLowerCase().includes(query) ||
        document.sourceType.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [documents, search, statusFilter]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || submitting) return;

    setNotice(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/knowledge/documents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          sourceType: "manual",
          sourceUrl: sourceUrl.trim() || null,
          effectiveFrom: effectiveFrom || null,
          effectiveTo: effectiveTo || null,
          content,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Knowledge could not be saved.");

      setTitle("");
      setSourceUrl("");
      setEffectiveFrom("");
      setEffectiveTo("");
      setContent("");
      setStatusFilter("IN_REVIEW");
      setNotice({
        type: "success",
        text: "Knowledge saved for review. Approve it from the document list before the AI can use it.",
      });
      await loadDocuments();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Knowledge could not be saved.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewDocument(documentId: string, action: "APPROVE" | "REJECT" | "ARCHIVE") {
    if (!canManage || reviewingId) return;

    const actionLabel = action === "APPROVE" ? "approve" : action === "REJECT" ? "reject" : "archive";
    if (!window.confirm(`Are you sure you want to ${actionLabel} this knowledge document?`)) return;

    setReviewingId(documentId);
    setNotice(null);

    try {
      const response = await fetch(`/api/knowledge/documents/${documentId}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: `Reviewed from Knowledge Base dashboard: ${actionLabel}.`,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Knowledge review failed.");

      setNotice({
        type: "success",
        text:
          action === "APPROVE"
            ? "Knowledge approved. The AI can now retrieve it for grounded replies."
            : `Knowledge document ${actionLabel}d successfully.`,
      });
      await loadDocuments();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Knowledge review failed.",
      });
    } finally {
      setReviewingId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="knowledge-access-card">
        <span className="knowledge-access-icon" aria-hidden="true" />
        <div>
          <strong>Manager access required</strong>
          <p>Only administrators and managers can add, approve, reject or archive AI knowledge.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-manager">
      <div className="knowledge-summary-row" aria-label="Knowledge summary">
        <article className="knowledge-summary-card is-total">
          <span>Total documents</span>
          <strong>{counts.total}</strong>
          <small>All saved versions</small>
        </article>
        <article className="knowledge-summary-card is-approved">
          <span>Approved</span>
          <strong>{counts.APPROVED}</strong>
          <small>Available to the AI</small>
        </article>
        <article className="knowledge-summary-card is-review">
          <span>In review</span>
          <strong>{counts.IN_REVIEW}</strong>
          <small>Waiting for approval</small>
        </article>
        <article className="knowledge-summary-card is-chunks">
          <span>Search chunks</span>
          <strong>{counts.chunks}</strong>
          <small>Retrievable passages</small>
        </article>
      </div>

      {notice ? (
        <div className={`knowledge-notice is-${notice.type}`} role="status">
          {notice.text}
        </div>
      ) : null}

      <div className="knowledge-workspace-grid">
        <section className="knowledge-panel knowledge-form-panel">
          <header className="knowledge-panel-header">
            <span className="knowledge-panel-icon is-add" aria-hidden="true" />
            <div>
              <p>Manual entry</p>
              <h3>Add approved business knowledge</h3>
              <span>Create one clear source document at a time. New entries start in review.</span>
            </div>
          </header>

          <form className="knowledge-form" onSubmit={handleSubmit}>
            <div className="knowledge-form-row">
              <label className="knowledge-field">
                <span>Document title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  placeholder="Example: Become AI Expert fees and timing"
                  required
                />
              </label>

              <label className="knowledge-field">
                <span>Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="knowledge-field">
              <span>Source URL <small>Optional</small></span>
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://sikhadenge.in/course-page"
              />
            </label>

            <div className="knowledge-form-row">
              <label className="knowledge-field">
                <span>Effective from <small>Optional</small></span>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </label>

              <label className="knowledge-field">
                <span>Effective until <small>Optional</small></span>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                />
              </label>
            </div>

            <label className="knowledge-field knowledge-content-field">
              <span>Knowledge content</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                minLength={20}
                maxLength={300000}
                rows={11}
                placeholder={
                  "Write the exact information the AI should use.\n\nExample:\nCourse: Become AI Expert\nDuration: 10 weeks\nClasses: 3 per week\nTiming: 8:00 PM to 10:00 PM IST"
                }
                required
              />
              <small>{content.length.toLocaleString("en-IN")} / 300,000 characters</small>
            </label>

            <div className="knowledge-form-footer">
              <p>Saved content is versioned, chunked and kept unavailable to the AI until approval.</p>
              <button className="knowledge-primary-button" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save for review"}
              </button>
            </div>
          </form>
        </section>

        <section className="knowledge-panel knowledge-library-panel">
          <header className="knowledge-panel-header">
            <span className="knowledge-panel-icon is-library" aria-hidden="true" />
            <div>
              <p>Document library</p>
              <h3>Review and approval queue</h3>
              <span>Only approved documents are eligible for AI retrieval.</span>
            </div>
          </header>

          <div className="knowledge-library-controls">
            <label className="knowledge-search-field">
              <span className="sr-only">Search knowledge</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or category"
              />
            </label>
            <label className="knowledge-filter-field">
              <span className="sr-only">Filter status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | KnowledgeStatus)}
              >
                <option value="ALL">All statuses</option>
                <option value="IN_REVIEW">In review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
          </div>

          <div className="knowledge-document-list">
            {loading ? <div className="knowledge-empty-state">Loading knowledge documents…</div> : null}
            {!loading && filteredDocuments.length === 0 ? (
              <div className="knowledge-empty-state">
                <strong>No matching documents</strong>
                <span>Add the first manual knowledge document or change the current filters.</span>
              </div>
            ) : null}

            {filteredDocuments.map((document) => (
              <article className="knowledge-document-card" key={document.id}>
                <div className="knowledge-document-main">
                  <div className="knowledge-document-heading">
                    <div>
                      <h4>{document.title}</h4>
                      <p>{document.category.replaceAll("_", " ")} · Version {document.version}</p>
                    </div>
                    <span className={`knowledge-status is-${document.status.toLowerCase()}`}>
                      {STATUS_LABELS[document.status]}
                    </span>
                  </div>

                  <div className="knowledge-document-meta">
                    <span>{document._count.chunks} chunks</span>
                    <span>Updated {formatDate(document.updatedAt)}</span>
                    <span>
                      Active {formatDate(document.effectiveFrom)} – {formatDate(document.effectiveTo)}
                    </span>
                  </div>

                  {document.sourceUrl ? (
                    <a href={document.sourceUrl} target="_blank" rel="noreferrer">
                      Open source reference
                    </a>
                  ) : (
                    <span className="knowledge-manual-source">Manual source</span>
                  )}
                </div>

                <div className="knowledge-document-actions">
                  {document.status === "IN_REVIEW" ? (
                    <>
                      <button
                        className="knowledge-action-button is-approve"
                        type="button"
                        disabled={reviewingId === document.id}
                        onClick={() => void reviewDocument(document.id, "APPROVE")}
                      >
                        Approve
                      </button>
                      <button
                        className="knowledge-action-button is-reject"
                        type="button"
                        disabled={reviewingId === document.id}
                        onClick={() => void reviewDocument(document.id, "REJECT")}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  {document.status === "APPROVED" || document.status === "REJECTED" ? (
                    <button
                      className="knowledge-action-button is-archive"
                      type="button"
                      disabled={reviewingId === document.id}
                      onClick={() => void reviewDocument(document.id, "ARCHIVE")}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="module-note knowledge-safety-note">
        The AI answers from approved knowledge only. Manual entries, counselor corrections and customer chats never become reusable knowledge without review.
      </div>
    </div>
  );
}
