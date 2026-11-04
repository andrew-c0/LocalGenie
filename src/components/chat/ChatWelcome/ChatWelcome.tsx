import { Button, Caption1 } from "@fluentui/react-components";
import {
  AttachRegular,
  ChatRegular,
  CubeRegular,
  GaugeRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { CardTitle, Secondary, SectionTitle } from "../../ui/Typography/Typography";
import { RecentConversations } from "../RecentConversations/RecentConversations";
import "./ChatWelcome.css";

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <LockClosedRegular />,
    title: "Private by default",
    text: "Conversations and prompts stay on this device. Nothing is sent to a cloud service.",
  },
  {
    icon: <CubeRegular />,
    title: "Any installed model",
    text: "Pick a loaded model from the model selector. Every reply shows which model wrote it.",
  },
  {
    icon: <AttachRegular />,
    title: "Attach your files",
    text: "Add files to a message so answers can draw on your own documents.",
  },
  {
    icon: <GaugeRegular />,
    title: "Track the context",
    text: "The context ring in the header shows how much of the model's window the chat uses.",
  },
];

/** Empty-state landing for /chat: what the app does, server status, a new chat and every conversation. */
export function ChatWelcome({
  serverRunning,
  modelCount,
  onNewConversation,
}: {
  serverRunning: boolean;
  modelCount: number;
  onNewConversation: () => void;
}) {
  return (
    <div className="chat-welcome">
      <div className="chat-welcome__inner">
        <section className="chat-welcome__hero">
          <div className="chat-welcome__hero-text">
            <div className="chat-welcome__status">
              <StatusBadge tone={serverRunning ? "green" : "red"}>
                {serverRunning ? "Running" : "Stopped"}
              </StatusBadge>
              <Caption1>
                {serverRunning
                  ? `${modelCount} model${modelCount === 1 ? "" : "s"} loaded`
                  : "Start the server from the model selector to chat"}
              </Caption1>
            </div>
            <SectionTitle>Chat with models running on your PC</SectionTitle>
            <Secondary>
              Start a conversation below, or pick up where you left off. Nothing leaves your
              machine.
            </Secondary>
          </div>
          <Button appearance="primary" icon={<ChatRegular />} onClick={onNewConversation}>
            New conversation
          </Button>
        </section>

        <div className="chat-welcome__grid">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="chat-welcome__tile">
              <div className="chat-welcome__tile-icon">{feature.icon}</div>
              <CardTitle>{feature.title}</CardTitle>
              <Secondary>{feature.text}</Secondary>
            </div>
          ))}
        </div>

        <RecentConversations />
      </div>
    </div>
  );
}
