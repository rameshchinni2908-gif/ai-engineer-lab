/* global DOMParser, document -- page.evaluate runs in the browser. */
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDir = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", publicDir), "utf8");
await mkdir(new URL("icons/", publicDir), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [size, filename, maskable] of [
    [180, "apple-touch-icon.png", false],
    [192, "icons/icon-192.png", false],
    [512, "icons/icon-512.png", false],
    [512, "icons/icon-maskable-512.png", true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent("<html><head><style>html,body{margin:0;background:#101820}svg{display:block;width:100vw;height:100vh}</style></head><body></body></html>");
    await page.evaluate(({ svg, maskable }) => {
      const source = new DOMParser().parseFromString(svg, "image/svg+xml");
      if (maskable) source.querySelector("rect")?.setAttribute("rx", "0");
      document.body.append(document.importNode(source.documentElement, true));
    }, { svg, maskable });
    await page.screenshot({ path: fileURLToPath(new URL(filename, publicDir)) });
  }
} finally {
  await browser.close();
}
