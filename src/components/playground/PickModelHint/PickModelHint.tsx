import { StateBlock } from "../../ui/StateBlock/StateBlock";

/** Shown at the top of a tool page while no model is chosen. The models are picked in the header's selector. */
export function PickModelHint() {
  return <StateBlock message="Pick a model in the selector above" />;
}
