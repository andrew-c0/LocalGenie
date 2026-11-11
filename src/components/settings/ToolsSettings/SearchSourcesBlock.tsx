import { Switch } from "@fluentui/react-components";
import { useToolStore } from "../../../stores/toolStore";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong, Meta, Secondary } from "../../ui/Typography/Typography";

const INTRO =
  "A search sends your query to the hosts of the sources you turn on. This is not a general web search: it covers these public sources only. Turn a source on and set the tool to On or Request approval.";

/** The search sources of `web_search`: one switch per source, with the host it contacts and what it covers. */
export function SearchSourcesBlock() {
  const sources = useToolStore((s) => s.searchSources);
  const enabled = useToolStore((s) => s.enabledSearchSources);
  const setSourceEnabled = useToolStore((s) => s.setSourceEnabled);

  return (
    <Flex direction="column" gap="s">
      <BodyStrong>Search sources</BodyStrong>
      <Secondary>{INTRO}</Secondary>
      {sources.length === 0 && <Meta>No search sources are available in this build.</Meta>}
      {sources.map((source) => (
        <Flex key={source.id} direction="column" gap="xxs">
          <Switch
            label={source.label}
            checked={enabled.includes(source.id)}
            onChange={(_, data) => void setSourceEnabled(source.id, data.checked)}
          />
          <Meta>
            Contacts {source.host}. {source.description}
          </Meta>
        </Flex>
      ))}
    </Flex>
  );
}
