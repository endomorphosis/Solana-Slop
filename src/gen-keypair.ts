import { Keypair } from "@solana/web3.js";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

async function main() {
  const dir = ".keys";
  const path = `${dir}/id.json`;

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const keypair = Keypair.generate();
  const secret = Array.from(keypair.secretKey);

  await writeFile(path, JSON.stringify(secret), { encoding: "utf8", flag: "wx" });

  console.log("Wrote keypair:", path);
  console.log("Public key:", keypair.publicKey.toBase58());
}

main().catch((err) => {
  if ((err as any)?.code === "EEXIST") {
    console.error("Keypair already exists at .keys/id.json (delete it to regenerate)");
    process.exit(2);
  }
  console.error("Keypair generation failed:", err);
  process.exit(1);
});
