import { useMemo, useState } from "react";
import { Flex } from "../../../components/ui/Flex/Flex";
import {
  type DropdownOption,
  OptionDropdown,
} from "../../../components/ui/OptionDropdown/OptionDropdown";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { BodyStrong, Secondary } from "../../../components/ui/Typography/Typography";
import type { AihubModelDetail } from "../../../services/aihub";
import { chipsetsOf, filterAssetsByChipset, groupByPrecision } from "../../../utils/aihub";
import { AihubAssetRow } from "./AihubAssetRow";
import "./AihubModelDetail.css";

/** Dropdown value for "every chipset" (the state holds null for it). */
const ALL_CHIPSETS = "__all__";

/** QAIRT assets grouped by precision, with a chipset filter that starts on all chipsets. */
export function AihubAssetList({ model }: { model: AihubModelDetail }) {
  const [chipset, setChipset] = useState<string | null>(null);
  const assets = useMemo(() => model.assets ?? [], [model.assets]);
  const chipsets = useMemo(() => chipsetsOf(assets), [assets]);
  const shown = filterAssetsByChipset(assets, chipset);
  const groups = groupByPrecision(shown);

  if (model.assets === null) {
    return <StateBlock icon="⚠️" message="Assets unavailable" />;
  }
  if (assets.length === 0) {
    return <StateBlock icon="📦" message="No QAIRT assets for this model." />;
  }

  const options: DropdownOption<string>[] = [
    { value: ALL_CHIPSETS, label: "All chipsets" },
    ...chipsets.map((c) => ({ value: c, label: c })),
  ];

  return (
    <Flex direction="column" gap="s">
      <OptionDropdown
        label="Chipset"
        options={options}
        value={chipset ?? ALL_CHIPSETS}
        onChange={(v) => setChipset(v === ALL_CHIPSETS ? null : v)}
        fullWidth
      />
      <Secondary>
        {chipset === null
          ? "Showing assets for every chipset. Choose one to narrow the list."
          : `Showing ${shown.length} of ${assets.length} assets for ${chipset}.`}
      </Secondary>
      {groups.length === 0 ? (
        <StateBlock icon="🔍" message="No assets for this chipset." />
      ) : (
        groups.map(([precision, list]) => (
          <div key={precision} className="aihub-detail__precision">
            <BodyStrong>{precision}</BodyStrong>
            {list.map((a) => (
              <AihubAssetRow key={`${a.chipset ?? ""}-${a.downloadUrl}`} model={model} asset={a} />
            ))}
          </div>
        ))
      )}
    </Flex>
  );
}
