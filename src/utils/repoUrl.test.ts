import { describe, expect, it } from "vitest";
import {
  type HastNode,
  repoFileBases,
  resolveRepoUrl,
  resolveSrcSet,
  rewriteRepoUrls,
} from "./repoUrl";

const ZIMAGE = repoFileBases("Tongyi-MAI/Z-Image-Turbo");
const RAW = "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/resolve/main/";
const PAGE = "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/blob/main/";

describe("repoFileBases", () => {
  it("builds the raw-file and file-page bases of a repo on main", () => {
    expect(ZIMAGE).toEqual({ fileBase: RAW, linkBase: PAGE });
  });
});

describe("resolveRepoUrl", () => {
  // Real forms from the Z-Image-Turbo README (`![](assets/x.png)`, `![](assets/x.webp)`).
  it("resolves a repo-relative image path (Z-Image-Turbo)", () => {
    expect(resolveRepoUrl("assets/showcase_realistic.png", RAW)).toBe(
      `${RAW}assets/showcase_realistic.png`,
    );
  });

  // Real forms from the FLUX.2-klein-4B README (`![Teaser](./realism.jpg)`).
  it("resolves a ./ image path (FLUX.2-klein-4B)", () => {
    const base = repoFileBases("black-forest-labs/FLUX.2-klein-4B").fileBase;
    expect(resolveRepoUrl("./realism.jpg", base)).toBe(
      "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/resolve/main/realism.jpg",
    );
  });

  // Real forms from the sdxl-turbo README (`![row01](output_tile.jpg)`).
  it("resolves a bare file name at the repo root (sdxl-turbo)", () => {
    expect(
      resolveRepoUrl("output_tile.jpg", repoFileBases("stabilityai/sdxl-turbo").fileBase),
    ).toBe("https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/output_tile.jpg");
  });

  it("resolves a relative link to the file's Hub page", () => {
    expect(resolveRepoUrl("assets/Z-Image-Gallery.pdf", ZIMAGE.linkBase)).toBe(
      `${PAGE}assets/Z-Image-Gallery.pdf`,
    );
  });

  it("drops ./ segments and clamps ../ at the repo root", () => {
    expect(resolveRepoUrl("./assets/./a.png", RAW)).toBe(`${RAW}assets/a.png`);
    expect(resolveRepoUrl("../a.png", RAW)).toBe(`${RAW}a.png`);
    expect(resolveRepoUrl("assets/../img/b.png", RAW)).toBe(`${RAW}img/b.png`);
  });

  it("treats a leading slash as the repo root", () => {
    expect(resolveRepoUrl("/assets/a.png", RAW)).toBe(`${RAW}assets/a.png`);
  });

  // Real form from the Z-Image-Turbo README: `https://huggingface.co/spaces/...` as a link.
  it("keeps a Hub section path on the site when it starts with /", () => {
    expect(resolveRepoUrl("/spaces/Tongyi-MAI/Z-Image", RAW)).toBe(
      "https://huggingface.co/spaces/Tongyi-MAI/Z-Image",
    );
  });

  it("gives a protocol-relative address https", () => {
    expect(resolveRepoUrl("//cdn.example.com/a.png", RAW)).toBe("https://cdn.example.com/a.png");
  });

  // Absolute forms seen in the READMEs: shields.io badges, the Hub's CDN, GitHub raw, a Hub page.
  it.each([
    "https://img.shields.io/badge/arXiv-2511.22677-b31b1b.svg",
    "https://raw.githubusercontent.com/zai-org/GLM-OCR/refs/heads/main/resources/logo.svg",
    "https://cdn-uploads.huggingface.co/production/uploads/abc/def.png",
    "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/samples/HEARME.wav",
    "http://example.com/a.png",
  ])("leaves the absolute address %s alone", (address) => {
    expect(resolveRepoUrl(address, RAW)).toBe(address);
  });

  it("leaves data URIs, mailto links and #anchors alone", () => {
    expect(resolveRepoUrl("data:image/png;base64,AAAA", RAW)).toBe("data:image/png;base64,AAAA");
    expect(resolveRepoUrl("mailto:someone@example.com", RAW)).toBe("mailto:someone@example.com");
    expect(resolveRepoUrl("#usage", PAGE)).toBe("#usage");
  });

  it("encodes spaces once and does not encode an already encoded name twice", () => {
    expect(resolveRepoUrl("my image.png", RAW)).toBe(`${RAW}my%20image.png`);
    expect(resolveRepoUrl("my%20image.png", RAW)).toBe(`${RAW}my%20image.png`);
  });

  it("keeps the query and fragment of a path", () => {
    expect(resolveRepoUrl("assets/a.png?raw=true#top", RAW)).toBe(
      `${RAW}assets/a.png?raw=true#top`,
    );
  });

  it("returns an empty address unchanged", () => {
    expect(resolveRepoUrl("", RAW)).toBe("");
  });
});

describe("resolveSrcSet", () => {
  it("resolves each candidate of a srcset string and keeps its descriptor", () => {
    expect(resolveSrcSet("a.png 1x, ./b.png 2x", RAW)).toBe(`${RAW}a.png 1x, ${RAW}b.png 2x`);
  });

  it("keeps the list form when the parser gave a list", () => {
    expect(resolveSrcSet(["a.webp 1x", "https://cdn.example.com/b.webp 2x"], RAW)).toEqual([
      `${RAW}a.webp 1x`,
      "https://cdn.example.com/b.webp 2x",
    ]);
  });

  it("drops empty candidates", () => {
    expect(resolveSrcSet("a.png 1x, ", RAW)).toBe(`${RAW}a.png 1x`);
  });
});

describe("rewriteRepoUrls", () => {
  /** A small tree shaped like the parsed README: a picture element, a Markdown image, a link and text. */
  function sampleTree(): HastNode {
    return {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "picture",
          children: [
            {
              type: "element",
              tagName: "source",
              properties: { srcSet: ["assets/dark.webp 1x", "assets/dark@2x.webp 2x"] },
            },
            {
              type: "element",
              tagName: "img",
              properties: { src: "assets/light.png", alt: "light" },
            },
          ],
        },
        {
          type: "element",
          tagName: "p",
          children: [
            {
              type: "element",
              tagName: "a",
              properties: { href: "docs/guide.md" },
              children: [{ type: "text", value: "guide" }],
            },
            {
              type: "element",
              tagName: "img",
              properties: { src: "https://img.shields.io/badge/a-b-c.svg" },
            },
          ],
        },
        { type: "text", value: "text is left alone" },
      ],
    };
  }

  it("rewrites images, sources and links, and leaves absolute addresses", () => {
    const tree = sampleTree();
    rewriteRepoUrls(tree, ZIMAGE);

    const picture = tree.children?.[0];
    const source = picture?.children?.[0];
    const img = picture?.children?.[1];
    const paragraph = tree.children?.[1];
    const link = paragraph?.children?.[0];
    const badge = paragraph?.children?.[1];

    expect(source?.properties?.srcSet).toEqual([
      `${RAW}assets/dark.webp 1x`,
      `${RAW}assets/dark@2x.webp 2x`,
    ]);
    expect(img?.properties?.src).toBe(`${RAW}assets/light.png`);
    expect(link?.properties?.href).toBe(`${PAGE}docs/guide.md`);
    expect(badge?.properties?.src).toBe("https://img.shields.io/badge/a-b-c.svg");
    expect(tree.children?.[2]).toEqual({ type: "text", value: "text is left alone" });
  });
});
