import { describe, expect, it } from "vitest";
import {
  addAllowedFolder,
  folderDraftProblem,
  isAbsoluteFolderPath,
  normalizeFolderPath,
  offeredToolNames,
  parseAllowedFolders,
  parseToolState,
  removeAllowedFolder,
  serializeAllowedFolders,
  toolAccess,
  toolStateKey,
} from "./toolAccess";

describe("parseToolState", () => {
  it("keeps the three valid states", () => {
    expect(parseToolState("off")).toBe("off");
    expect(parseToolState("ask")).toBe("ask");
    expect(parseToolState("on")).toBe("on");
  });

  it("reads anything else as off", () => {
    expect(parseToolState(null)).toBe("off");
    expect(parseToolState(undefined)).toBe("off");
    expect(parseToolState("ALWAYS")).toBe("off");
    expect(parseToolState(true)).toBe("off");
    expect(parseToolState({ state: "on" })).toBe("off");
  });
});

describe("toolStateKey", () => {
  it("prefixes the tool name", () => {
    expect(toolStateKey("read_text_file")).toBe("tool_state_read_text_file");
  });
});

describe("normalizeFolderPath", () => {
  it("trims and drops trailing separators", () => {
    expect(normalizeFolderPath("  C:\\Users\\Me\\Docs\\  ")).toBe("C:\\Users\\Me\\Docs");
    expect(normalizeFolderPath("/home/me/docs/")).toBe("/home/me/docs");
  });

  it("keeps a drive root and the POSIX root whole", () => {
    expect(normalizeFolderPath("C:\\")).toBe("C:\\");
    expect(normalizeFolderPath("C:")).toBe("C:\\");
    expect(normalizeFolderPath("/")).toBe("/");
  });

  it("reads blank input as empty", () => {
    expect(normalizeFolderPath("   ")).toBe("");
  });
});

describe("isAbsoluteFolderPath", () => {
  it("accepts drive, share and POSIX paths", () => {
    expect(isAbsoluteFolderPath("C:\\Users\\Me")).toBe(true);
    expect(isAbsoluteFolderPath("D:/data")).toBe(true);
    expect(isAbsoluteFolderPath("\\\\server\\share\\docs")).toBe(true);
    expect(isAbsoluteFolderPath("/home/me")).toBe(true);
  });

  it("refuses relative paths and blanks", () => {
    expect(isAbsoluteFolderPath("docs")).toBe(false);
    expect(isAbsoluteFolderPath("..\\docs")).toBe(false);
    expect(isAbsoluteFolderPath("./docs")).toBe(false);
    expect(isAbsoluteFolderPath("")).toBe(false);
  });
});

describe("addAllowedFolder", () => {
  it("adds a trimmed absolute folder", () => {
    expect(addAllowedFolder([], "  C:\\Users\\Me\\Docs\\ ")).toEqual(["C:\\Users\\Me\\Docs"]);
  });

  it("ignores blank and relative paths, returning the same list", () => {
    const list = ["C:\\a"];
    expect(addAllowedFolder(list, "   ")).toBe(list);
    expect(addAllowedFolder(list, "relative\\folder")).toBe(list);
  });

  it("does not add a Windows folder twice, whatever its case or separators", () => {
    const list = ["C:\\Users\\Me\\Docs"];
    expect(addAllowedFolder(list, "c:\\users\\me\\docs")).toBe(list);
    expect(addAllowedFolder(list, "C:/Users/Me/Docs/")).toBe(list);
  });

  it("keeps the case of POSIX folders, so two spellings are two folders", () => {
    expect(addAllowedFolder(["/home/me"], "/home/Me")).toEqual(["/home/me", "/home/Me"]);
  });

  it("does not change the list it was given", () => {
    const list = ["C:\\a"];
    addAllowedFolder(list, "C:\\b");
    expect(list).toEqual(["C:\\a"]);
  });
});

describe("removeAllowedFolder", () => {
  it("removes the folder, matching as addAllowedFolder does", () => {
    const list = ["C:\\Users\\Me", "C:\\Work"];
    expect(removeAllowedFolder(list, "c:\\users\\me\\")).toEqual(["C:\\Work"]);
  });

  it("returns the list unchanged when the folder is not there", () => {
    expect(removeAllowedFolder(["C:\\Work"], "C:\\Other")).toEqual(["C:\\Work"]);
  });
});

describe("folderDraftProblem", () => {
  it("is null for an empty draft, so nothing is flagged before typing", () => {
    expect(folderDraftProblem([], "   ")).toBeNull();
  });

  it("flags a relative path", () => {
    expect(folderDraftProblem([], "Documents")).toBe("relative");
  });

  it("flags a folder already allowed", () => {
    expect(folderDraftProblem(["C:\\Work"], "c:\\work\\")).toBe("duplicate");
  });

  it("is null for a new absolute folder", () => {
    expect(folderDraftProblem(["C:\\Work"], "C:\\Notes")).toBeNull();
  });
});

describe("parseAllowedFolders", () => {
  it("reads the stored JSON text", () => {
    expect(parseAllowedFolders('["C:\\\\Work","/home/me"]')).toEqual(["C:\\Work", "/home/me"]);
  });

  it("accepts an array that is already parsed", () => {
    expect(parseAllowedFolders(["C:\\Work"])).toEqual(["C:\\Work"]);
  });

  it("reads missing or broken values as no folders", () => {
    expect(parseAllowedFolders(null)).toEqual([]);
    expect(parseAllowedFolders(undefined)).toEqual([]);
    expect(parseAllowedFolders("not json")).toEqual([]);
    expect(parseAllowedFolders('{"path":"C:\\\\Work"}')).toEqual([]);
    expect(parseAllowedFolders(42)).toEqual([]);
  });

  it("drops entries that are not absolute strings and removes duplicates", () => {
    const raw = ["C:\\Work", 7, null, "docs", "c:\\work\\", "", "/home/me"];
    expect(parseAllowedFolders(raw)).toEqual(["C:\\Work", "/home/me"]);
  });
});

describe("serializeAllowedFolders", () => {
  it("round-trips through parseAllowedFolders", () => {
    const list = ["C:\\Users\\Me\\Docs", "/home/me"];
    expect(parseAllowedFolders(serializeAllowedFolders(list))).toEqual(list);
  });

  it("writes an empty list as an empty JSON array", () => {
    expect(serializeAllowedFolders([])).toBe("[]");
  });
});

describe("toolAccess", () => {
  it("skips an off tool, whatever the chat was granted", () => {
    expect(toolAccess("off", false)).toBe("skip");
    expect(toolAccess("off", true)).toBe("skip");
  });

  it("runs an on tool without asking", () => {
    expect(toolAccess("on", false)).toBe("run");
    expect(toolAccess("on", true)).toBe("run");
  });

  it("asks for a request-approval tool until the chat grants it", () => {
    expect(toolAccess("ask", false)).toBe("ask");
    expect(toolAccess("ask", true)).toBe("run");
  });
});

describe("offeredToolNames", () => {
  it("offers every tool that is not off, in order", () => {
    expect(
      offeredToolNames({ list_directory: "on", read_text_file: "off", web_search: "ask" }),
    ).toEqual(["list_directory", "web_search"]);
  });

  it("offers nothing when every tool is off or nothing is saved", () => {
    expect(offeredToolNames({ read_text_file: "off" })).toEqual([]);
    expect(offeredToolNames({})).toEqual([]);
  });
});
