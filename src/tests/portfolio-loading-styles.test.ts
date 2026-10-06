// @vitest-environment node
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { expect, it } from "vitest";
import config from "../../tailwind.config";

it("ships dark theme tokens and disables both loading animations for reduced motion", async () => {
  const source = readFileSync("src/styles/globals.css", "utf8");
  const result = await postcss([tailwindcss(config)]).process(source, { from: undefined });
  let darkTokens = false;
  result.root.walkRules(".dark", (rule) => {
    rule.walkDecls("--background", () => { darkTokens = true; });
  });
  expect(darkTokens).toBe(true);
  let barAnimation = "";
  result.root.walkRules(".portfolio-loading-bar", (rule) => {
    if (rule.parent?.type !== "atrule") rule.walkDecls("animation", (decl) => { barAnimation = decl.value; });
  });
  expect(barAnimation).toBe("portfolio-loading 2.5s ease-in-out infinite");
  let reducedMotion = false;
  result.root.walkAtRules("media", (rule) => {
    if (rule.params !== "(prefers-reduced-motion: reduce)") return;
    rule.walkRules((child) => {
      if (!child.selector.includes(".portfolio-loading-bar") || !child.selector.includes(".portfolio-skeleton .animate-pulse")) return;
      child.walkDecls("animation", (decl) => { reducedMotion = decl.value === "none"; });
    });
  });
  expect(reducedMotion).toBe(true);
});
