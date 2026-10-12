import AddOnsOptions from "./AddOnsOptions";

type AddOnsSectionProps = {
  autoScaleFonts: boolean;
  setAutoScaleFonts: React.Dispatch<React.SetStateAction<boolean>>;
  browserCheck: boolean;
  setBrowserCheck: React.Dispatch<React.SetStateAction<boolean>>;
  splitText: boolean;
  setSplitText: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function AddOnsSection(props: AddOnsSectionProps) {
  return (
    <section className="create-page">
      <div className="create-page-header">
        <h1>Add-ons</h1>
        <p className="description">
          Add or remove optional code in your existing project. Saving updates
          src/Creative.js, src/script.js and src/index.html. Unchecking an
          add-on deletes its code, so keep a copy of anything you changed in it.
        </p>
      </div>
      <AddOnsOptions {...props} />
    </section>
  );
}
