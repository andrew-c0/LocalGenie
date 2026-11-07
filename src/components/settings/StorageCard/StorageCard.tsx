import { Button } from "@fluentui/react-components";
import { ArrowClockwiseRegular, FolderOpenRegular } from "@fluentui/react-icons";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { getStorageUsage, openStorageFolder } from "../../../services/storage";
import type { StorageItem } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { buildStorageView, type StorageRowView } from "../../../utils/storageUsage";
import { toast } from "../../../utils/toast";
import { Flex } from "../../ui/Flex/Flex";
import { RetryBlock } from "../../ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../ui/Skeletons/SkeletonRows";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Body, BodyStrong, Meta, Secondary } from "../../ui/Typography/Typography";
import "./StorageCard.css";

const STORAGE_KEY = "storage";

/**
 * Settings > Application & Runtime: what LocalGenie keeps on this device, grouped by what the
 * uninstaller removes. Each row opens its folder. The data is read from the backend, so a failure
 * shows a retry rather than an empty list.
 */
export default function StorageCard() {
  const storage = useAsyncData(STORAGE_KEY, () => getStorageUsage());

  const handleOpen = (row: StorageRowView) => {
    openStorageFolder(row.id).catch((err: unknown) => {
      toast.error(`Could not open ${row.label}`, errorMessage(err));
    });
  };

  const refreshAction = (
    <Button
      size="small"
      appearance="secondary"
      icon={<ArrowClockwiseRegular />}
      onClick={storage.retry}
      disabled={storage.status === "loading"}
    >
      Refresh
    </Button>
  );

  return (
    <SurfaceCard title="Storage" action={refreshAction}>
      <Flex direction="column" gap="m">
        <Secondary>
          What LocalGenie keeps on this device, and what the uninstaller removes.
        </Secondary>
        {storage.status === "loading" && <SkeletonRows count={4} />}
        {storage.status === "error" && (
          <RetryBlock
            compact
            error={storage.error}
            subject="LocalGenie storage"
            lead="Could not read storage usage."
            onRetry={storage.retry}
          />
        )}
        {storage.status === "ready" && storage.data && (
          <StorageGroups items={storage.data.items} onOpen={handleOpen} />
        )}
      </Flex>
    </SurfaceCard>
  );
}

interface StorageGroupsProps {
  items: StorageItem[];
  onOpen: (row: StorageRowView) => void;
}

/** The grouped rows and the total, built from the loaded list. */
function StorageGroups({ items, onOpen }: StorageGroupsProps) {
  const view = buildStorageView(items);

  return (
    <Flex direction="column" gap="m">
      {view.groups.map((group) => (
        <Flex key={group.policy} direction="column" gap="xs">
          <Meta>{group.title}</Meta>
          {group.rows.map((row) => (
            <Flex key={row.id} align="center" gap="m" className="storage-card__row">
              <div className="flex-grow">
                <BodyStrong>{row.label}</BodyStrong>
                <Secondary>{row.description}</Secondary>
              </div>
              <Body className="storage-card__size">{row.size}</Body>
              <Button
                size="small"
                appearance="secondary"
                icon={<FolderOpenRegular />}
                onClick={() => onOpen(row)}
                title={row.path}
              >
                Open folder
              </Button>
            </Flex>
          ))}
        </Flex>
      ))}
      <Flex align="center" justify="between" className="storage-card__total">
        <BodyStrong>Total</BodyStrong>
        <BodyStrong>{view.total}</BodyStrong>
      </Flex>
    </Flex>
  );
}
