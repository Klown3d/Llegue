import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const buildRoot = resolve("dist");
const expectedSuffix = `${sep}llegue${sep}dist`;

if (!buildRoot.endsWith(expectedSuffix)) {
  throw new Error(`Ruta de compilación inesperada: ${buildRoot}`);
}

await rm(buildRoot, { recursive: true, force: true });
