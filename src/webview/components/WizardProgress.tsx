import React from "react";

type Step = 1 | 2 | 3 | 4 | 5;

type WizardProgressProps = {
  step: Step;
  maxStepReached: number;
  setStep: React.Dispatch<React.SetStateAction<Step>>;
};

export default function WizardProgress({
  step,
  maxStepReached,
  setStep,
}: WizardProgressProps) {
  const steps = ["Name", "Dimensions", "Placeholders", "Fonts", "Create"];

  return (
    <div className="progress">
      {steps.map((label, index) => {
        const number = index + 1;
        const isCurrent = step === number;
        const isComplete = maxStepReached > number;
        const isClickable = number <= maxStepReached;

        return (
          <React.Fragment key={label}>
            <div
              className={`progress-item ${
                isCurrent ? "current" : ""
              } ${isComplete ? "complete" : ""} ${
                isClickable && !isComplete && !isCurrent ? "unlocked" : ""
              } ${!isClickable ? "disabled" : ""}`}
              onClick={() => {
                if (isClickable) {
                  setStep(number as Step);
                }
              }}
            >
              <div className="progress-step">{isComplete ? "✓" : number}</div>

              <span>{label}</span>
            </div>

            {number < steps.length && (
              <div
                className={`progress-line ${
                  maxStepReached > number ? "active" : ""
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
