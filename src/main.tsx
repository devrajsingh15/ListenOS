import { createRoot } from "react-dom/client";
import App from "./App";
import "./app/globals.css";

if (process.env.NODE_ENV === "development" && window.location.protocol.startsWith("http")) {
  const updates = new EventSource("/__rspack_events");
  updates.addEventListener("reload", () => window.location.reload());
}

const root = document.getElementById("root");
if (!root) throw new Error("ListenOS root element was not found");

createRoot(root).render(<App />);
