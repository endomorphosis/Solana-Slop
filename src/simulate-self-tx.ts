import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { RPC_URL } from "./env.js";

type Mode = "simulate" | "send";

function getMode(): Mode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  const mode = (arg?.split("=")[1] ?? "simulate") as Mode;
  if (mode !== "simulate" && mode !== "send") {
    throw new Error("Invalid --mode. Use --mode=simulate or --mode=send");
  }
  return mode;
}

async function loadKeypair(path = ".keys/id.json"): Promise<Keypair> {
  const raw = await readFile(path, "utf8");
  const secret = JSON.parse(raw);
  if (!Array.isArray(secret)) {
    throw new Error(`Invalid keypair file at ${path} (expected JSON array)`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const mode = getMode();
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = await loadKeypair();

  const latest = await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latest.blockhash
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: 0
    })
  );

  tx.sign(payer);
  const rawTx = tx.serialize();

  console.log("RPC URL:", RPC_URL);
  console.log("Mode:", mode);
  console.log("Payer:", payer.publicKey.toBase58());
  console.log("Recent blockhash:", latest.blockhash);

  if (mode === "simulate") {
    const sim = await connection.simulateTransaction(tx);

    console.log("Simulate err:", sim.value.err);
    if (sim.value.logs) {
      console.log("Logs:");
      for (const line of sim.value.logs) console.log(line);
    }
    if (typeof sim.value.unitsConsumed === "number") {
      console.log("Units consumed:", sim.value.unitsConsumed);
    }
    return;
  }

  // Send mode requires the payer to have enough SOL for fees.
  const { sendAndConfirmRawTransaction } = await import("@solana/web3.js");
  const sig = await sendAndConfirmRawTransaction(connection, rawTx, {
    commitment: "confirmed"
  });
  console.log("Signature:", sig);
}

main().catch((err) => {
  const msg = String(err?.message ?? err);
  if (msg.includes("ENOENT") && msg.includes(".keys/id.json")) {
    console.error(
      "Missing .keys/id.json. Run: npm run gen-keypair (then optionally fund it)"
    );
  } else {
    console.error("Transaction simulate failed:", err);
  }
  process.exit(1);
});
