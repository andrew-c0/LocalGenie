import { Badge, Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import type { ModelInfo } from "../../types";
import { shortName } from "../../utils/format";

const useStyles = makeStyles({
  option: {
    justifyContent: "flex-start",
    width: "100%",
    height: "auto",
    paddingBlock: tokens.spacingVerticalXS,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    marginLeft: "auto",
  },
});

interface ModelOptionButtonProps {
  model: ModelInfo;
  isActive: boolean;
  loadedHere: boolean;
  /** True while this model is being loaded. */
  loading: boolean;
  /** True while any other action is in progress. */
  disabled: boolean;
  onSelect: (name: string) => void;
}

/** One selectable installed model in the model selector popover. */
export function ModelOptionButton({
  model,
  isActive,
  loadedHere,
  loading,
  disabled,
  onSelect,
}: ModelOptionButtonProps) {
  const styles = useStyles();
  const precision = model.precisions.length > 0 ? model.precisions[0] : null;

  return (
    <Button
      appearance="subtle"
      className={styles.option}
      disabled={disabled}
      onClick={() => onSelect(model.name)}
    >
      <span className={styles.main}>
        <Text weight="semibold">
          {shortName(model.name)}
          {precision && ` · ${precision}`}
        </Text>
        <Text size={200}>
          {loadedHere ? "Loaded on server" : "Ready to load"} • {model.size}
        </Text>
      </span>
      <span className={styles.trailing}>
        {loading ? (
          <Spinner size="tiny" />
        ) : isActive ? (
          <>
            <Badge appearance="tint" color="brand" size="small">
              Active
            </Badge>
            <CheckmarkRegular />
          </>
        ) : (
          <Badge appearance="outline" color="informative" size="small">
            Switch
          </Badge>
        )}
        <Badge size="tiny" color={loadedHere ? "success" : "subtle"} />
      </span>
    </Button>
  );
}
