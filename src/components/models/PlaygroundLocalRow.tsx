import { Card } from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import { formatBytes } from "../../utils/format";
import { recommendationDetail } from "../../utils/modelRecommendations";
import {
  PLAYGROUND_GROUP_LABELS,
  type PlaygroundLocalModel,
} from "../../utils/playgroundLocalModels";
import { Flex } from "../ui/Flex/Flex";
import { ItemRowMenu } from "../ui/ItemRowMenu/ItemRowMenu";
import { BodyStrong, Meta } from "../ui/Typography/Typography";

interface PlaygroundLocalRowProps {
  model: PlaygroundLocalModel;
  /** A delete of this model is running. Delete is off meanwhile. */
  isDeleteBusy: boolean;
  onDelete: (model: PlaygroundLocalModel) => void;
}

/**
 * One installed Playground model as a card: its name, then its tool and size on the muted line, and the
 * "…" menu with Delete at the right. It has no detail page, so it is not a button.
 */
export function PlaygroundLocalRow({ model, isDeleteBusy, onDelete }: PlaygroundLocalRowProps) {
  const detail = recommendationDetail([
    PLAYGROUND_GROUP_LABELS[model.kind],
    model.sizeBytes === undefined ? null : formatBytes(model.sizeBytes),
  ]);

  return (
    <Card size="small">
      <Flex align="center" gap="m">
        <Flex direction="column" gap="xxs" grow>
          <BodyStrong truncate title={model.label}>
            {model.label}
          </BodyStrong>
          <Meta truncate>{detail}</Meta>
        </Flex>
        <ItemRowMenu
          name={model.label}
          items={[
            {
              label: "Delete",
              icon: <DeleteRegular />,
              danger: true,
              disabled: isDeleteBusy,
              onClick: () => onDelete(model),
            },
          ]}
        />
      </Flex>
    </Card>
  );
}
