export default function ContactsLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading contacts"
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            minHeight: 142,
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            background: "linear-gradient(135deg,#fff,#f4f8ff)",
            boxShadow: "0 16px 44px rgba(15,23,42,.05)",
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
          {[0, 1, 2, 3].map((item) => (
            <div key={item} style={{ height: 94, border: "1px solid #e5e7eb", borderRadius: 15, background: "#fff" }} />
          ))}
        </div>
        <div style={{ minHeight: 480, border: "1px solid #e2e8f0", borderRadius: 18, background: "#fff" }} />
      </section>
    </main>
  );
}
