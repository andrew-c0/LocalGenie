import { Caption1 } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { Secondary, SectionTitle } from "../Typography/Typography";
import "./WelcomeLanding.css";

interface WelcomeLandingProps {
  serverRunning: boolean;
  modelCount: number;
  /** The status line when the server is stopped: what to do to use this page. */
  stoppedHint: string;
  title: string;
  text: string;
  /** The hero's button, when the page has one. */
  action?: ReactNode;
  /** The page's content under the hero: feature tiles, the recent list. */
  children?: ReactNode;
}

/**
 * The landing of a conversation page: a hero with the server status, a title, a sentence and an optional button,
 * then the page's own content. It scrolls; a message field under it stays put.
 */
export function WelcomeLanding({
  serverRunning,
  modelCount,
  stoppedHint,
  title,
  text,
  action,
  children,
}: WelcomeLandingProps) {
  return (
    <div className="welcome-landing">
      <div className="welcome-landing__inner">
        <section className="welcome-landing__hero">
          <div className="welcome-landing__hero-text">
            <div className="welcome-landing__status">
              <StatusBadge tone={serverRunning ? "green" : "red"}>
                {serverRunning ? "Running" : "Stopped"}
              </StatusBadge>
              <Caption1>
                {serverRunning
                  ? `${modelCount} model${modelCount === 1 ? "" : "s"} loaded`
                  : stoppedHint}
              </Caption1>
            </div>
            <SectionTitle>{title}</SectionTitle>
            <Secondary>{text}</Secondary>
          </div>
          {action}
        </section>

        {children}
      </div>
    </div>
  );
}
