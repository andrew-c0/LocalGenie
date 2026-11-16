import { Text } from "@fluentui/react-components";
import { useChatStore } from "../../../stores/chatStore";
import { fastestReplies } from "../../../utils/generationSpeed";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import "./SpeedList.css";

const TOP_COUNT = 5;

/** Derives tokens/sec from the stored chat replies and shows the top 5. Dispatch conversations are not counted. */
export function SpeedList() {
  const sessions = useChatStore((s) => s.sessions);
  const top = fastestReplies(sessions, TOP_COUNT);
  const max = top.length > 0 ? top[0].tps : 1;

  if (top.length === 0) {
    return (
      <StateBlock message="No generation statistics yet — start a chat to measure throughput." />
    );
  }

  return (
    <div className="speed-list__list">
      {top.map((s) => (
        <div key={`${s.model}-${s.tps}`} className="speed-list__row">
          <div className="speed-list__body">
            <Text weight="semibold">{s.model}</Text>
            <ProgressBar value={(s.tps / max) * 100} color="cyan" />
          </div>
          <Text>{s.tps.toFixed(1)} tok/s</Text>
        </div>
      ))}
    </div>
  );
}
