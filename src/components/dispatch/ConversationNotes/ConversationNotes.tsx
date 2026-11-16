import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from "@fluentui/react-components";
import { Body, Meta } from "../../ui/Typography/Typography";
import "./ConversationNotes.css";

/** The conversation's notes: the plan the assistant keeps for itself. Read-only, collapsed until opened. */
export function ConversationNotes({ notes }: { notes: string }) {
  return (
    <Accordion collapsible>
      <AccordionItem value="notes">
        <AccordionHeader>Plan and notes</AccordionHeader>
        <AccordionPanel>
          {notes.trim() === "" ? (
            <Meta>The conversation has not written any notes yet.</Meta>
          ) : (
            <Body className="conversation-notes">{notes}</Body>
          )}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
