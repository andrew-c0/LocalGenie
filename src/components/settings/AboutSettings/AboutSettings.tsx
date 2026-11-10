import { useEffect } from "react";
import { useAppInfo } from "../../../hooks/useAppInfo";
import { useAppUpdateStore } from "../../../stores/appUpdateStore";
import { useRuntimeStore } from "../../../stores/runtimeStore";
import {
  ABOUT_NOTE,
  appSummary,
  LICENCE_TEXT,
  runtimeSources,
  SOURCE_URL,
} from "../../../utils/aboutInfo";
import { ExternalLink } from "../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../ui/Flex/Flex";
import { Body, Secondary, SectionTitle } from "../../ui/Typography/Typography";

/**
 * Settings > About: plain paragraphs, no cards. What the app is and its version, the runtimes it uses
 * with their versions and source code, and the licence.
 */
export default function AboutSettings() {
  const info = useAppInfo();
  const runtimes = useRuntimeStore((s) => s.runtimes);
  const update = useAppUpdateStore((s) => s.update);
  const summary = appSummary(info, import.meta.env.MODE);

  // The runtime list is loaded at startup; read it here only when the store is still empty.
  useEffect(() => {
    if (useRuntimeStore.getState().runtimes === null) void useRuntimeStore.getState().refresh();
  }, []);

  return (
    <Flex direction="column" gap="l">
      <Flex direction="column" gap="xs">
        <SectionTitle>LocalGenie</SectionTitle>
        <Body>{ABOUT_NOTE}</Body>
        {summary && <Secondary>{summary}</Secondary>}
        {update && (
          <Body>
            Version {update.version} is available. Open Settings &gt; Application &amp; Runtime to
            download and restart.
          </Body>
        )}
      </Flex>

      <Flex direction="column" gap="xs">
        <SectionTitle>Runtimes</SectionTitle>
        <Body>The engines LocalGenie runs models with, and where their source code lives.</Body>
        {runtimeSources(runtimes).map((runtime) => (
          <Body key={runtime.id}>
            <strong>{runtime.name}</strong> · {runtime.version} ·{" "}
            <ExternalLink url={runtime.url}>Source code</ExternalLink>
          </Body>
        ))}
      </Flex>

      <Flex direction="column" gap="xs">
        <SectionTitle>Licence and source</SectionTitle>
        <Body>
          {LICENCE_TEXT} <ExternalLink url={SOURCE_URL}>LocalGenie source code</ExternalLink>
        </Body>
      </Flex>
    </Flex>
  );
}
