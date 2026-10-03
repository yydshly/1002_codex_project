import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { useSystemReducedMotion } from "./motion-preference";
import "./styles.css";

function ResearchApp() {
  const reduced = useSystemReducedMotion();
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <App />
    </MotionConfig>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ResearchApp />
  </React.StrictMode>,
);
