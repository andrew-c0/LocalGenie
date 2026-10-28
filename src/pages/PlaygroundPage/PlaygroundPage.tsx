import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import "./PlaygroundPage.css";

/**
 * Playground for special models: models that do more than chat and need their own tools to try.
 * Scaffold only. The model picker and the per-function panels come after the design is agreed.
 */
export default function PlaygroundPage() {
  return (
    <div className="playground-page__page">
      <div className="playground-page__inner">
        <PageHeader
          eyebrow="● PLAYGROUND"
          title="Playground"
          subtitle="Try models that do more than chat, one function at a time."
        />
        <StateBlock icon="🧪" message="The playground is not built yet." />
      </div>
    </div>
  );
}
