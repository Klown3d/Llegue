import { readdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const buildRoot = resolve("dist");
const expectedSuffix = `${sep}llegue${sep}dist`;

if (!buildRoot.endsWith(expectedSuffix)) {
  throw new Error(`Ruta de compilación inesperada: ${buildRoot}`);
}

async function removeDevVars(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);

    if (!path.startsWith(`${buildRoot}${sep}`)) {
      throw new Error(`Ruta fuera de dist: ${path}`);
    }

    if (entry.isDirectory()) {
      await removeDevVars(path);
    } else if (entry.name === ".dev.vars") {
      await rm(path, { force: true });
    }
  }
}

await removeDevVars(buildRoot);
