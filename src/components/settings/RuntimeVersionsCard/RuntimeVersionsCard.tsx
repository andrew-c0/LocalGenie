import { Caption1, Card, Subtitle1 } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import * as geniex from "../../../services/geniex";
import type { RuntimeVersions } from "../../../types";
import { Body } from "../../ui/Typography/Typography";
import "./RuntimeVersionsCard.css";

/** Shows the llama.cpp runtime hash and QAIRT version the installed GenieX CLI runs with. */
export default function RuntimeVersionsCard() {
  const [versions, setVersions] = useState<RuntimeVersions | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    geniex
      .getRuntimeVersions()
      .then(setVersions)
      .catch(() => setFailed(true));
  }, []);

  return (
    <Card>
      <div className="runtime-versions-card__stack">
        <Subtitle1>Runtimes</Subtitle1>
        {failed ? (
          <Caption1>Could not read runtime versions. Is the GenieX CLI installed?</Caption1>
        ) : (
          <>
            <div className="runtime-versions-card__row">
              <Caption1>llama.cpp</Caption1>
              <Body>{versions?.llamaCpp ?? "…"}</Body>
            </div>
            <div className="runtime-versions-card__row">
              <Caption1>QAIRT</Caption1>
              <Body>{versions?.qairt ?? "…"}</Body>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
