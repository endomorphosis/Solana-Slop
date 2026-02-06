import dotenv from "dotenv";

dotenv.config();

export const RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() || "https://api.testnet.solana.com";

export const PUBLIC_KEY = process.env.SOLANA_PUBLIC_KEY?.trim();
