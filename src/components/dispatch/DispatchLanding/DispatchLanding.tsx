import { useDispatchStore } from "../../../stores/dispatchStore";
import { useModelStore } from "../../../stores/modelStore";
import { WelcomeLanding } from "../../ui/WelcomeLanding/WelcomeLanding";
import { DispatchLoadStatus } from "../DispatchLoadStatus/DispatchLoadStatus";
import { NewConversation } from "../NewConversation/NewConversation";
import { RecentDispatch } from "../RecentDispatch/RecentDispatch";

/**
 * The Dispatch landing on `/dispatch`, laid out as the chat's: the server status and what Dispatch does, the
 * recent conversations (or their load state), and the message field at the bottom, which starts a conversation.
 */
export function DispatchLanding() {
  const serverRunning = useModelStore((s) => s.serverStatus.running);
  const modelCount = useModelStore((s) => s.serverStatus.models.length);
  const loaded = useDispatchStore((s) => s.loaded);
  const tasks = useDispatchStore((s) => s.tasks);

  return (
    <>
      <WelcomeLanding
        serverRunning={serverRunning}
        modelCount={modelCount}
        stoppedHint="Start the server from the model selector to run conversations"
        title="Dispatch"
        text="Conversations are worked on in the background, on the model you load. They keep going while LocalGenie runs in the tray."
      >
        {loaded ? <RecentDispatch tasks={tasks} /> : <DispatchLoadStatus />}
      </WelcomeLanding>
      <NewConversation />
    </>
  );
}
