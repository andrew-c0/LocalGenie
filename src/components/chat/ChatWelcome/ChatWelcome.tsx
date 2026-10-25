import { Button, Caption1 } from "@fluentui/react-components";
import {
  AttachRegular,
  ChatRegular,
  ChevronRightRegular,
  CubeRegular,
  GaugeRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { ChatSession } from "../../../types";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { Body, CardTitle, Meta, Secondary, SectionTitle } from "../../ui/Typography/Typography";
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

/** Empty-state landing for /chat: what the app does, server status and recent conversations. */
export function ChatWelcome({
  serverRunning,
  modelCount,
  recentSessions,
  onNewConversation,
  onOpenSession,
}: {
  serverRunning: boolean;
  modelCount: number;
  recentSessions: ChatSession[];
  onNewConversation: () => void;
  onOpenSession: (id: string) => void;
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

        {recentSessions.length > 0 && (
          <section className="chat-welcome__recent">
            <SectionTitle>Recent conversations</SectionTitle>
            <div className="chat-welcome__recent-list">
              {recentSessions.map((session) => (
                <Button
                  key={session.id}
                  appearance="subtle"
                  className="chat-welcome__recent-item"
                  onClick={() => onOpenSession(session.id)}
                >
                  <span className="chat-welcome__recent-text">
                    <Body className="chat-welcome__recent-title">{session.title}</Body>
                    <Meta>
                      {new Date(session.updatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Meta>
                  </span>
                  <ChevronRightRegular className="chat-welcome__recent-chevron" />
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
