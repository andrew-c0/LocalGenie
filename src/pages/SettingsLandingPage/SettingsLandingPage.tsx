import { CubeRegular, DesktopRegular, DocumentBulletListRegular } from "@fluentui/react-icons";
import {
  type SectionInfoCard,
  SectionLanding,
} from "../../components/ui/SectionLanding/SectionLanding";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { runtimesWarningOf } from "../../utils/runtimeWarning";

const INFO_CARDS: SectionInfoCard[] = [
  {
    icon: <DesktopRegular />,
    title: "Server and memory",
    body: "Set the GenieX server port and the RAM headroom kept free for the rest of the system, under Application & Runtime.",
  },
  {
    icon: <CubeRegular />,
    title: "Runtimes",
    body: "Install, update or remove the GenieX CLI and the optional Playground runtimes. A missing runtime locks the areas that need it.",
  },
  {
    icon: <DocumentBulletListRegular />,
    title: "Preferences and logs",
    body: "Preferences are stored on this device and apply on the next server start where applicable. Logs show the live GenieX server output.",
  },
];

const RUNTIMES_ROUTE_ID = "settings-runtimes";

/** Settings landing: what the area holds, then one row per section. The Runtimes row carries the warning. */
export default function SettingsLandingPage() {
  const runtimes = useRuntimeStore((s) => s.runtimes);
  const updatesById = useRuntimeStore((s) => s.updatesById);
  const runtimesWarning = runtimesWarningOf(runtimes, updatesById);

  return (
    <SectionLanding
      sectionId="settings"
      title="Settings"
      subtitle="Configure the GenieX runtimes, the local server, model inference and app preferences."
      infoCards={INFO_CARDS}
      facts={runtimesWarning ? { [RUNTIMES_ROUTE_ID]: runtimesWarning } : {}}
      warnedFactIds={runtimesWarning ? [RUNTIMES_ROUTE_ID] : []}
    />
  );
}
