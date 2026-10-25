const SVG_NS = "http://www.w3.org/2000/svg";

/** Style properties copied from the page onto the image, so colours do not depend on page CSS variables. */
const STYLE_PROPS = [
  "fill",
  "stroke",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "opacity",
];

/** Copy the resolved styles of `source` onto `target`, element by element. The trees must match. */
function inlineStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  for (const prop of STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) target.setAttribute(prop, value);
  }
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, index) => {
    const match = targetChildren[index];
    if (match) inlineStyles(child, match);
  });
}

/**
 * A PNG of an SVG chart, as base64 without the data URL prefix. The image is drawn at twice the
 * on-screen size, on `background`.
 */
export async function svgToPngBase64(svg: SVGSVGElement, background: string): Promise<string> {
  const rect = svg.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  const copy = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, copy);
  copy.setAttribute("xmlns", SVG_NS);
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  const markup = new XMLSerializer().serializeToString(copy);

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("the image canvas is not available");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  const png = canvas.toDataURL("image/png");
  return png.slice(png.indexOf(",") + 1);
}
