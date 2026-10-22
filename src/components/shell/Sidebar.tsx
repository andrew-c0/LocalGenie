import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  Tab,
  TabList,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  ChatRegular,
  CubeRegular,
  GridRegular,
  PlayCircleRegular,
  SettingsRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as db from "../../services/database";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";

const APP_VERSION = "v0.1.0";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: ReactElement;
}[] = [
  { to: "/", label: "Overview", icon: <GridRegular /> },
  { to: "/models", label: "Models", icon: <CubeRegular /> },
  { to: "/chat", label: "Chat & Playground", icon: <ChatRegular /> },
  { to: "/prompt-benchmark", label: "Benchmarks", icon: <PlayCircleRegular /> },
  { to: "/settings", label: "Settings", icon: <SettingsRegular /> },
];

const useStyles = makeStyles({
  sidebar: {
    width: "240px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    justifyContent: "flex-start",
  },
  nav: {
    flex: 1,
    minHeight: 0,
  },
  navTab: {
    width: "100%",
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
    width: "100%",
  },
  navLabel: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    padding: `0 ${tokens.spacingHorizontalM}`,
  },
});

/** Map the current pathname to the nav item it belongs to (Tab value). */
function activeNavValue(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
  );
  return match ? match.to : "/";
}

export default function Sidebar() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
    setDeleteTarget(null);
  };

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  return (
    <aside className={styles.sidebar}>
      <Button
        appearance="subtle"
        icon={<SparkleRegular />}
        title="Go to Overview"
        className={styles.brand}
        onClick={() => navigate("/")}
      >
        LocalGenie
      </Button>
      <TabList
        vertical
        className={styles.nav}
        aria-label="Main navigation"
        selectedValue={activeNavValue(pathname)}
        onTabSelect={handleTabSelect}
      >
        {NAV_ITEMS.map((item) => (
          <Tab key={item.to} value={item.to} className={styles.navTab}>
            <span className={styles.navRow}>
              <span className={styles.navLabel}>
                {item.icon}
                {item.label}
              </span>
              {item.to === "/models" && models.length > 0 && (
                <Badge size="small" appearance="filled" color="brand">
                  {models.length}
                </Badge>
              )}
              {item.to === "/chat" && activeSessionId && (
                <Badge size="tiny" appearance="filled" color="brand" />
              )}
            </span>
          </Tab>
        ))}
      </TabList>

      <div className={styles.footer}>
        <Text size={200}>
          {serverStatus.running
            ? `Server :${serverStatus.port} · ${serverStatus.models.length} loaded`
            : "Server offline"}
        </Text>
        <Caption1>{APP_VERSION} · Local Runtime</Caption1>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogContent>
              Are you sure you want to delete this conversation? This cannot be undone.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => deleteTarget && handleDelete(deleteTarget)}
              >
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </aside>
  );
}
