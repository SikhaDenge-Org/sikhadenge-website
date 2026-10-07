import "./offline-experience.css";

export const metadata = {
  title: "Offline | SikhaDenge EngageOS",
};

const BRAND_MARK = "/sikhadenge-header-safe-320.png";

export default function OfflinePage() {
  return (
    <main className="offline-shell" data-phase15-offline-shell="true">
      <section className="offline-card" aria-labelledby="offline-title">
        <div className="offline-brand">
          <div className="offline-brand__surface">
            <img
              className="offline-brand__wordmark"
              src={BRAND_MARK}
              width="176"
              height="54"
              alt="SikhaDenge"
            />
          </div>
        </div>

        <p className="offline-eyebrow">SikhaDenge EngageOS</p>
        <h1 className="offline-title" id="offline-title">You are offline</h1>
        <p className="offline-copy">
          Network connectivity is unavailable. Return online to continue working in
          the WhatsApp AI Agent dashboard.
        </p>

        <p className="offline-privacy">
          Existing customer conversations are not cached for privacy. Unsent message
          drafts can be recovered from this browser when you return to the Inbox.
        </p>

        <div className="offline-actions">
          <a className="offline-retry" href="/inbox">Try again</a>
        </div>
      </section>
    </main>
  );
}
