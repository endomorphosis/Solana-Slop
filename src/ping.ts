import { Connection } from "@solana/web3.js";
import { RPC_URL } from "./env.js";

async function main() {
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000
  });

  const [version, genesisHash, blockHeight, latestBlockhash] = await Promise.all([
    connection.getVersion(),
    connection.getGenesisHash(),
    connection.getBlockHeight("confirmed"),
    connection.getLatestBlockhash("confirmed")
  ]);

  console.log("RPC URL:", RPC_URL);
  console.log("Solana version:", version["solana-core"] ?? version);
  console.log("Genesis hash:", genesisHash);
  console.log("Block height:", blockHeight);
  console.log("Latest blockhash:", latestBlockhash.blockhash);
}

main().catch((err) => {
  console.error("Ping failed:", err);
  process.exit(1);
});
