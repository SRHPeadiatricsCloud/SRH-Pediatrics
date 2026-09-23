/**
 * Bundle entry for scripts/test-fluids-tab.mjs.
 *
 * Kept in the repo (not a temp dir) so esbuild resolves `node_modules` and the
 * `@/` alias the same way on every machine. The test bundles this to CJS with
 * React marked external, so the component under test shares one React instance
 * with the renderer.
 */
export { FluidsTab } from "@/components/fluids-tab";
