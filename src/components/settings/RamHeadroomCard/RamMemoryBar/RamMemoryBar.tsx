import type { MemoryBarView } from "../../../../utils/ramMemoryBar";
import { Flex } from "../../../ui/Flex/Flex";
import { Meta } from "../../../ui/Typography/Typography";
import "./RamMemoryBar.css";

interface Props {
  view: MemoryBarView;
}

/** Each segment's colour class, with the label it stands for in the legend. */
type SegmentKind = "used" | "free" | "kept";

/**
 * One horizontal bar for system RAM: in use, free, and the kept-free zone at the free end, with
 * the labels under it.
 */
export default function RamMemoryBar({ view }: Props) {
  const { segments, labels, belowHeadroom } = view;
  const legend: { kind: SegmentKind; text: string }[] = [
    { kind: "used", text: labels.inUse },
    { kind: "free", text: labels.free },
    { kind: "kept", text: labels.keptFree },
  ];

  return (
    <div className="ram-memory-bar">
      <Meta>{labels.total}</Meta>
      <div
        className="ram-memory-bar__track"
        role="img"
        aria-label={`${labels.inUse}. ${labels.free}. ${labels.keptFree}.`}
      >
        <div
          className="ram-memory-bar__segment ram-memory-bar__segment--used"
          style={{ width: `${segments.usedPercent}%` }}
        />
        <div
          className="ram-memory-bar__segment ram-memory-bar__segment--free"
          style={{ width: `${segments.freePercent}%` }}
        />
        <div
          className="ram-memory-bar__segment ram-memory-bar__segment--kept"
          style={{ width: `${segments.keptFreePercent}%` }}
        />
      </div>
      <Flex gap="m" wrap>
        {legend.map((item) => (
          <Flex key={item.kind} align="center" gap="xs">
            <span
              className={`ram-memory-bar__swatch ram-memory-bar__segment--${item.kind}`}
              aria-hidden
            />
            <Meta>{item.text}</Meta>
          </Flex>
        ))}
      </Flex>
      {belowHeadroom && (
        <Meta className="ram-memory-bar__warning">
          Already below the headroom: free RAM is less than the kept-free share.
        </Meta>
      )}
    </div>
  );
}
