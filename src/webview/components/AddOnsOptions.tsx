type AddOnsOptionsProps = {
  autoScaleFonts: boolean;
  setAutoScaleFonts: React.Dispatch<React.SetStateAction<boolean>>;
  browserCheck: boolean;
  setBrowserCheck: React.Dispatch<React.SetStateAction<boolean>>;
  splitText: boolean;
  setSplitText: React.Dispatch<React.SetStateAction<boolean>>;
  drawSVGPlugin?: boolean;
  setDrawSVGPlugin?: React.Dispatch<React.SetStateAction<boolean>>;
  motionPathPlugin?: boolean;
  setMotionPathPlugin?: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function AddOnsOptions({
  autoScaleFonts,
  setAutoScaleFonts,
  browserCheck,
  setBrowserCheck,
  splitText,
  setSplitText,
  drawSVGPlugin,
  setDrawSVGPlugin,
  motionPathPlugin,
  setMotionPathPlugin,
}: AddOnsOptionsProps) {
  const options = [
    {
      label: "Auto-scale fonts",
      description:
        "Shrinks text marked with data-font_autoscale until it fits.",
      checked: autoScaleFonts,
      toggle: () => setAutoScaleFonts((current) => !current),
    },
    {
      label: "Browser check",
      description:
        "Adds Creative.check helpers such as mobile(), ios() and safari().",
      checked: browserCheck,
      toggle: () => setBrowserCheck((current) => !current),
    },
    {
      label: "SplitText",
      description: "Loads GSAP's SplitText plugin in index.html.",
      checked: splitText,
      toggle: () => setSplitText((current) => !current),
    },
    ...(setDrawSVGPlugin
      ? [{
          label: "DrawSVGPlugin",
          description: "Loads GSAP's DrawSVGPlugin in index.html.",
          checked: Boolean(drawSVGPlugin),
          toggle: () => setDrawSVGPlugin((current) => !current),
        }]
      : []),
    ...(setMotionPathPlugin
      ? [{
          label: "MotionPathPlugin",
          description: "Loads GSAP's MotionPathPlugin in index.html.",
          checked: Boolean(motionPathPlugin),
          toggle: () => setMotionPathPlugin((current) => !current),
        }]
      : []),
  ];

  return (
    <div className="create-card">
      {options.map((option) => (
        <div
          key={option.label}
          className="create-option"
          onClick={option.toggle}
        >
          <div className="create-checkbox-label">
            <div className="checkbox">{option.checked ? "✓" : ""}</div>
            <div>
              <span>{option.label}</span>
              <div className="create-option-description">
                {option.description}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
