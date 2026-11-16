import React, { useEffect, useState } from "react";
import PsdMappingReview from "./PsdMappingReview";
import type { PsdMappingReview as Review } from "../../psd-mapping";
import { vscode } from "../vscode-api";

/** Mapping review on its own, used when regenerating an existing PSD project. */
export default function MappingReviewPage() {
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "psdMappingReview") {
        setReview(event.data.review);
      }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "psdMappingReady" });
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!review) {
    return <p className="description">Loading the PSD and feed…</p>;
  }
  return (
    <PsdMappingReview
      review={review}
      onConfirm={(decisions) =>
        vscode.postMessage({ type: "psdMappingConfirmed", reviewId: review.reviewId, decisions })
      }
      onCancel={() => vscode.postMessage({ type: "psdMappingCancelled", reviewId: review.reviewId })}
    />
  );
}
