import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapSession } from "./lib/session";
import "./styles/tokens.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

// Set the httpOnly session cookie before the UI becomes interactive so the
// first chat request is authorized (§9). `bootstrapSession` never throws, so a
// missing/unreachable server still renders the shell.
void bootstrapSession().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
