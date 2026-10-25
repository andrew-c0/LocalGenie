import { Button, Spinner } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import "./LibraryPanel.css";

export interface LibraryPanelItem {
  id: string;
  name: string;
  /** One line under the name, e.g. counts. */
  detail: string;
}

interface LibraryPanelProps {
  title: string;
  /** Label of the New button. Leave out for screens that only select existing items. */
  newLabel?: string;
  /** Null while loading. */
  items: LibraryPanelItem[] | null;
  error: string | null;
  selectedId: string | null;
  /** The editor, or null to show `idleMessage` instead. */
  editor: ReactNode | null;
  emptyMessage: string;
  idleMessage: string;
  onNew?: () => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

/** A library screen: the saved items on the left, the editor for the selected one on the right. */
export function LibraryPanel({
  title,
  newLabel,
  items,
  error,
  selectedId,
  editor,
  emptyMessage,
  idleMessage,
  onNew,
  onSelect,
  onRetry,
}: LibraryPanelProps) {
  return (
    <div className="library-panel">
      <aside className="library-panel__list">
        <div className="library-panel__header">
          <BodyStrong>{title}</BodyStrong>
          {newLabel && onNew && (
            <Button appearance="primary" size="small" icon={<AddRegular />} onClick={onNew}>
              {newLabel}
            </Button>
          )}
        </div>

        {error && (
          <>
            <ErrorBanner message={error} />
            <Button appearance="secondary" onClick={onRetry}>
              Try again
            </Button>
          </>
        )}

        {!error && items === null && (
          <div className="library-panel__loading">
            <Spinner size="tiny" label="Loading" />
          </div>
        )}

        {items !== null && items.length === 0 && <StateBlock message={emptyMessage} />}

        {items !== null && items.length > 0 && (
          <ul className="library-panel__items">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="library-panel__item"
                  aria-current={item.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="library-panel__item-name">{item.name}</span>
                  <Meta>{item.detail}</Meta>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="library-panel__editor">
        {editor ?? <StateBlock message={idleMessage} />}
      </section>
    </div>
  );
}
