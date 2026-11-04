import { Card } from "@fluentui/react-components";
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useRuntimeLocks } from "../../../hooks/useRuntimeLocks";
import { childrenOf } from "../../../navigation/routeUtils";
import { Flex } from "../Flex/Flex";
import { PageHeader } from "../PageHeader/PageHeader";
import { BodyStrong, Meta } from "../Typography/Typography";
import { SectionRouteCard } from "./SectionRouteCard/SectionRouteCard";
import "./SectionLanding.css";

/** A short info card at the top of a landing: an icon, a heading and a line or two of text. */
export interface SectionInfoCard {
  icon: ReactElement;
  title: string;
  body: string;
}

interface SectionLandingProps {
  /** Route id of the section. Its children in the route table become the rows below the info cards. */
  sectionId: string;
  title: string;
  subtitle: string;
  infoCards: SectionInfoCard[];
  /** A live line per sub-page, keyed by the sub-page's route id (for example "3 installed"). */
  facts?: Record<string, string>;
  /** Route ids whose fact is a warning, shown tinted with an icon. */
  warnedFactIds?: string[];
}

/**
 * Gateway page of a main section: a title, a few info cards that explain the area, then one row per
 * sub-page. A sub-page whose runtime is missing is shown disabled, with the reason.
 */
export function SectionLanding({
  sectionId,
  title,
  subtitle,
  infoCards,
  facts = {},
  warnedFactIds = [],
}: SectionLandingProps) {
  const navigate = useNavigate();
  const lockReasonOf = useRuntimeLocks();
  const subPages = childrenOf(sectionId);

  return (
    <div className="section-landing__page">
      <div className="section-landing__inner">
        <PageHeader title={title} subtitle={subtitle} />

        <div className="section-landing__info">
          {infoCards.map((card) => (
            <Card key={card.title} size="small">
              <Flex gap="s" align="start">
                <span className="section-landing__info-icon">{card.icon}</span>
                <Flex direction="column" gap="xxs">
                  <BodyStrong>{card.title}</BodyStrong>
                  <Meta>{card.body}</Meta>
                </Flex>
              </Flex>
            </Card>
          ))}
        </div>

        <div className="section-landing__rows">
          {subPages.map((route) => (
            <SectionRouteCard
              key={route.id}
              route={route}
              fact={facts[route.id]}
              warning={warnedFactIds.includes(route.id)}
              lockedReason={route.needs ? lockReasonOf(route.needs) : null}
              onOpen={() => navigate(route.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
