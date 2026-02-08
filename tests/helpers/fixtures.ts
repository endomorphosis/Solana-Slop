import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadSeed(): Promise<Uint8Array> {
  const path = resolve("tests/fixtures/seed.json");
  const raw = await readFile(path, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data) || data.length !== 32) {
    throw new Error("Invalid seed fixture (expected array of 32 numbers)");
  }

  return Uint8Array.from(data);
}
