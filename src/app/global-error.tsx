"use client"

import { useEffect, useState } from "react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [italian, setItalian] = useState(false)
  useEffect(() => {
    setItalian(document.cookie.split(";").some((cookie) => cookie.trim() === "dispatch-locale=it") || navigator.language.toLowerCase().startsWith("it"))
  }, [])
  return (
    <html lang={italian ? "it" : "en"}>
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
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>{italian ? "Dispatch ha riscontrato un errore imprevisto." : "Dispatch hit an unexpected error."}</h1>
          {error.digest && <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#737373" }}>{italian ? "Riferimento" : "Reference"}: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 24, background: "#141414", color: "#fff", border: 0, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
          >
            {italian ? "Riprova" : "Try again"}
          </button>
        </div>
      </body>
    </html>
  )
}
