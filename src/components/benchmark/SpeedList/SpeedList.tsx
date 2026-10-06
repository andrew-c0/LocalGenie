import { useChatStore } from "../../../stores/chatStore";
import { StateBlock } from "../../ui/primitives";
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
    <div>
      {top.map((s) => (
        <div key={`${s.model}-${s.tps}`} className="lx-speed-row">
          <div>
            <div className="lx-speed-name">{s.model}</div>
            <div className="lx-progress speed-bar">
              <div className="lx-progress-fill cyan" style={{ width: `${(s.tps / max) * 100}%` }} />
            </div>
          </div>
          <div className="lx-speed-tps">{s.tps.toFixed(1)} tok/s</div>
        </div>
      ))}
    </div>
  );
}
