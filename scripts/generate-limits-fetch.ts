import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(SCRIPT_DIR, "limits-fetch.entry.ts");
const DEFAULT_OUT = resolve(SCRIPT_DIR, "limits-fetch.mjs");

function parseOut(argv: string[]) {
  const index = argv.indexOf("--out");
  if (index === -1) return DEFAULT_OUT;
  const value = argv[index + 1];
  if (!value) throw new Error("--out requires a path");
  return resolve(value);
}

async function generate(outFile: string) {
  const tempOut = `${outFile}.${process.pid}.tmp`;
  await rm(tempOut, { force: true });
  const result = await Bun.build({
    entrypoints: [ENTRY],
    outfile: tempOut,
    target: "node",
    format: "esm",
    packages: "bundle",
    banner: "#!/usr/bin/env node\n",
    sourcemap: "none",
    minify: false,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log.message);
    throw new Error("failed to generate limits-fetch.mjs");
  }

  const output = result.outputs[0];
  if (!output) throw new Error("Bun.build produced no output");
  await writeFile(tempOut, await output.text());
  await chmod(tempOut, 0o755);
  await rename(tempOut, outFile);
}

await generate(parseOut(process.argv.slice(2)));
