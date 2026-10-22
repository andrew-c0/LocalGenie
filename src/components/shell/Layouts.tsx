import { makeStyles, tokens } from "@fluentui/react-components";
import { Outlet } from "react-router-dom";
import CliMissingBanner from "./CliMissingBanner";
import Header from "./Header";
import Sidebar from "./Sidebar";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    height: "100vh",
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
 * Main application layout: sidebar navigation, CLI banner, header and the
 * routed page content. Rendered inside the router so pages appear via <Outlet />.
 */
export function MainLayout() {
  const styles = useStyles();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <CliMissingBanner />
        <Header />
        <Outlet />
      </div>
    </div>
  );
}
