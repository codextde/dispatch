"use client"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF9F5",
          color: "#141414",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>Dispatch hit an unexpected error.</h1>
          {error.digest && <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#737373" }}>Reference: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 24, background: "#141414", color: "#fff", border: 0, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
