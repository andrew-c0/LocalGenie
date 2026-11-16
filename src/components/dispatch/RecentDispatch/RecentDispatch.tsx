import { useNavigate } from "react-router-dom";
import { useNow } from "../../../hooks/useNow";
import type { DispatchTask } from "../../../types";
import { isBusy } from "../../../utils/dispatchTask";
import { PagedList } from "../../ui/PagedList/PagedList";
import { TaskRow } from "./TaskRow";

interface RecentDispatchProps {
  /** Newest first. */
  tasks: DispatchTask[];
}

/** The Dispatch conversations on the landing, 10 to a page. A row opens its conversation. */
export function RecentDispatch({ tasks }: RecentDispatchProps) {
  const navigate = useNavigate();
  // The relative times refresh every second while a turn works or waits, and stay as they are otherwise.
  const now = useNow(tasks.some((task) => isBusy(task.status)));

  return (
    <PagedList
      title="Recent conversations"
      items={tasks}
      ariaLabel="Recent Dispatch conversation pages"
      getKey={(task) => task.id}
      renderItem={(task) => (
        <TaskRow task={task} now={now} onOpen={() => navigate(`/dispatch/${task.id}`)} />
      )}
    />
  );
}
