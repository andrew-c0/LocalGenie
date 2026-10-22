import { makeStyles, tokens } from "@fluentui/react-components";
import type { UpdateInfo } from "../types";
import CliUpdateCard from "./settings/CliUpdateCard";
import ServerPortCard from "./settings/ServerPortCard";

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
});

interface AppSettingsProps {
  updateInfo: UpdateInfo | null;
}

/** Settings sections: the GenieX server port and the GenieX CLI version. */
export default function AppSettings({ updateInfo }: AppSettingsProps) {
  const styles = useStyles();
  return (
    <div className={styles.section}>
      <ServerPortCard />
      <CliUpdateCard updateInfo={updateInfo} />
    </div>
  );
}
