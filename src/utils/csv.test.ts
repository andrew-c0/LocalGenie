import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("writes the header and rows with CRLF line ends and a byte order mark", () => {
    const csv = buildCsv(["a", "b"], [[1, "x"]]);
    expect(csv).toBe("﻿a,b\r\n1,x\r\n");
  });

  it("quotes fields with commas, quotes or line breaks", () => {
    const csv = buildCsv(["name"], [['say "hi", twice\nnow']]);
    expect(csv).toBe('﻿name\r\n"say ""hi"", twice\nnow"\r\n');
  });

  it("leaves missing values blank", () => {
    const csv = buildCsv(["x", "y", "z"], [[null, undefined, false]]);
    expect(csv).toBe("﻿x,y,z\r\n,,false\r\n");
  });
});
