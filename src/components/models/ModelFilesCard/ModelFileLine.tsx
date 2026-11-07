import { ExternalLink } from "../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";

/** One file of a model: its name, its size and, when it comes from another page, where it is read. */
export interface ModelFileRow {
  key: string;
  name: string;
  sizeLabel: string;
  source?: { label: string; url: string };
}

/** One row of the Files card: the name on the left, the size and source link on the right. */
export function ModelFileLine({ row }: { row: ModelFileRow }) {
  return (
    <Flex align="center" justify="between" gap="s" wrap>
      <Meta className="flex-grow model-files-card__name">{row.name}</Meta>
      <Flex align="center" gap="m">
        <Meta>{row.sizeLabel}</Meta>
        {row.source && <ExternalLink url={row.source.url}>{row.source.label}</ExternalLink>}
      </Flex>
    </Flex>
  );
}
