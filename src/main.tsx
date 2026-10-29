import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { initializeLocaleSync } from "./locale-sync";
import "./styles.css";
import "./responsive-fixes.css";
import "./operation-fixes.css";
import "./design-system.css";
import "./calendar.css";
import "./typography.css";

// OS(Android 앱별 언어)와 앱 선택을 맞춘다. 스플래시가 떠 있는 동안 끝나므로 화면이 깜빡이지 않는다.
void initializeLocaleSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
