import { Text } from "@fluentui/react-components";
import { useChatStore } from "../../../stores/chatStore";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import "./SpeedList.css";

/** Derives tokens/sec from stored chat message stats and shows the top 5. */
export function SpeedList() {
  const sessions = useChatStore((s) => s.sessions);

  const speeds: { model: string; tps: number }[] = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (
        msg.role === "assistant" &&
        msg.stats &&
        msg.stats.totalTime > 0 &&
        msg.stats.tokenCount > 0 &&
        msg.modelId
      ) {
        const tps = msg.stats.tokenCount / (msg.stats.totalTime / 1000);
        speeds.push({ model: msg.modelId.split("/").pop() ?? msg.modelId, tps });
      }
    }
  }
  speeds.sort((a, b) => b.tps - a.tps);
  const top = speeds.slice(0, 5);
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
