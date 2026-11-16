import React from "react";
import ReactDOM from "react-dom/client";
import Wizard from "./Wizard";
import MappingReviewPage from "./components/MappingReviewPage";
import "./styles.css";

// Set by the extension when this page only reviews the mapping of an existing PSD project.
const reviewOnly = Boolean((window as { __MAPPING_REVIEW_ONLY__?: boolean }).__MAPPING_REVIEW_ONLY__);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {reviewOnly ? <MappingReviewPage /> : <Wizard />}
  </React.StrictMode>,
);
