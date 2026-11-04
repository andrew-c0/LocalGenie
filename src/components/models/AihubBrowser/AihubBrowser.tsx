import { SearchBox, Spinner } from "@fluentui/react-components";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSystemMemory } from "../../../hooks/useSystemMemory";
import { humanLabel } from "../../../utils/aihub";
import { ChipRow } from "../../ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { ModelCard } from "../../ui/ModelCard/ModelCard";
import { aihubCardData } from "../../ui/ModelCard/modelCardData";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { useAihubCatalog } from "./useAihubCatalog";
import "./AihubBrowser.css";

const ALL_DOMAINS = "all";

/**
 * Qualcomm AI Hub tab: the catalog as a column of model cards, with a name search and a domain filter.
 * Each card opens the model's detail page, where the assets are downloaded; nothing is downloaded here.
 */
export function AihubBrowser() {
  const { entries, error } = useAihubCatalog();
  const navigate = useNavigate();
  // Read once here for every card; each card's RAM verdict is derived from it.
  const systemMemory = useSystemMemory();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState(ALL_DOMAINS);

  const domainOptions = useMemo((): [string, string][] => {
    const domains = [...new Set((entries ?? []).map((e) => e.domain).filter(Boolean))].sort();
    return [[ALL_DOMAINS, "All"], ...domains.map((d): [string, string] => [d, humanLabel(d)])];
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) =>
        (domain === ALL_DOMAINS || e.domain === domain) &&
        (!q || e.displayName.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)),
    );
  }, [entries, query, domain]);

  return (
    <Flex direction="column" gap="m">
      <Flex gap="s" align="center" className="aihub-browser__toolbar">
        <SearchBox
          className="aihub-browser__search"
          placeholder="Filter Qualcomm AI Hub models by name"
          aria-label="Filter Qualcomm AI Hub models by name"
          value={query}
          onChange={(_, data) => setQuery(data.value)}
        />
      </Flex>

      {domainOptions.length > 2 && (
        <ChipRow
          options={domainOptions}
          value={domain}
          onChange={setDomain}
          ariaLabel="Model domain"
        />
      )}

      {error ? (
        <ErrorBanner message={error} />
      ) : entries === null ? (
        <StateBlock icon={<Spinner size="small" />} message="Loading Qualcomm AI Hub models…" />
      ) : entries.length === 0 ? (
        <StateBlock icon="📦" message="No QAIRT models in the Qualcomm AI Hub catalog." />
      ) : visible.length === 0 ? (
        <StateBlock icon="🔍" message={`No models match "${query.trim()}".`} />
      ) : (
        <Flex direction="column" gap="s">
          {visible.map((entry) => (
            <ModelCard
              key={entry.id}
              model={aihubCardData(entry, systemMemory)}
              isLoaded={false}
              isDownloading={false}
              onDetails={() => navigate(`/models/aihub/${encodeURIComponent(entry.id)}`)}
            />
          ))}
        </Flex>
      )}
    </Flex>
  );
}
