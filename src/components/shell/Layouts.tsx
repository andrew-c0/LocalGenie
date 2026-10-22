import { makeStyles, tokens } from "@fluentui/react-components";
import { Outlet } from "react-router-dom";
import CliMissingBanner from "./CliMissingBanner";
import CloseGuard from "./CloseGuard";
import Header from "./Header";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";

const useStyles = makeStyles({
  frame: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  shell: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },
});

/**
 * Main application layout: custom title bar, sidebar navigation, CLI banner, header
 * and the routed page content. Rendered inside the router so pages appear via <Outlet />.
 * `CloseGuard` sits here too, so the close confirmation works on every page.
 */
export function MainLayout() {
  const styles = useStyles();
  return (
    <div className={styles.frame}>
      <TitleBar />
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.main}>
          <CliMissingBanner />
          <Header />
          <Outlet />
        </div>
      </div>
      <CloseGuard />
    </div>
  );
}
