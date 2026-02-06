import { Connection, PublicKey } from "@solana/web3.js";
import { PUBLIC_KEY, RPC_URL } from "./env.js";

async function main() {
  if (!PUBLIC_KEY) {
    throw new Error(
      "Missing SOLANA_PUBLIC_KEY in .env (set it to a base58 public key)"
    );
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const pubkey = new PublicKey(PUBLIC_KEY);

  const [lamports, slot] = await Promise.all([
    connection.getBalance(pubkey, "confirmed"),
    connection.getSlot("confirmed")
  ]);

  console.log("RPC URL:", RPC_URL);
  console.log("Slot:", slot);
  console.log("Address:", pubkey.toBase58());
  console.log("Balance (lamports):", lamports);
  console.log("Balance (SOL):", lamports / 1_000_000_000);
}

main().catch((err) => {
  console.error("Balance check failed:", err);
  process.exit(1);
});
