import { SearchBox, Spinner } from "@fluentui/react-components";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AihubCatalogEntry } from "../../../services/aihub";
import { humanLabel } from "../../../utils/aihub";
import { ChipRow } from "../../ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { ModelCard, type ModelCardData } from "../../ui/ModelCard/ModelCard";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { useAihubCatalog } from "./useAihubCatalog";
import "./AihubBrowser.css";

const ALL_DOMAINS = "all";

/** Card data for one catalog entry. Catalog entries have no Hub stats and are not installed. */
function cardOf(entry: AihubCatalogEntry): ModelCardData {
  return {
    name: entry.displayName,
    installed: false,
    description: `QAIRT · ${entry.chipsets.length} chipsets`,
  };
}

/** Qualcomm AI Hub tab (phase 1, read-only): QAIRT catalog with search and domain filter. */
export function AihubBrowser() {
  const { entries, error } = useAihubCatalog();
  const navigate = useNavigate();
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
        <div className="aihub-browser__grid">
          {visible.map((entry) => (
            <ModelCard
              key={entry.id}
              model={cardOf(entry)}
              isLoaded={false}
              isDownloading={false}
              isLocal={false}
              onDetails={() => navigate(`/models/aihub/${encodeURIComponent(entry.id)}`)}
            />
          ))}
        </div>
      )}
    </Flex>
  );
}
