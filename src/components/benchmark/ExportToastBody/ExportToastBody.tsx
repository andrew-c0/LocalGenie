import { Button } from "@fluentui/react-components";
import { openBenchmarkExport } from "../../../services/benchmark";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { Meta } from "../../ui/Typography/Typography";
import "./ExportToastBody.css";

/** Body of an export toast: the saved file's name, and a button that opens it in its default app. */
export function ExportToastBody({ path }: { path: string }) {
  const name = path.split(/[\\/]/).pop() ?? path;
  return (
    <div className="export-toast">
      <Meta>{name}</Meta>
      <Button
        size="small"
        appearance="primary"
        onClick={() =>
          void openBenchmarkExport(path).catch((e) =>
            toast.error("Could not open the file", errorMessage(e)),
          )
        }
      >
        Open
      </Button>
    </div>
  );
}
