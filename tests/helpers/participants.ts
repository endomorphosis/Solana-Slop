import { Keypair } from "@solana/web3.js";

export function makeKeypair(seedOffset: number): Keypair {
  const seed = new Uint8Array(32);
  seed[0] = seedOffset;
  return Keypair.fromSeed(seed);
}

export function pubkey(k: Keypair): string {
  return k.publicKey.toBase58();
}
