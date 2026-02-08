import { describe, expect, it } from "vitest";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { loadSeed } from "./helpers/fixtures.js";

describe("transaction construction", () => {
  it("builds a 0-lamport self-transfer", async () => {
    const seed = await loadSeed();
    const payer = Keypair.fromSeed(seed);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports: 0
      })
    );

    const ix = tx.instructions[0];
    expect(ix.programId.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(ix.keys[0].pubkey.toBase58()).toBe(payer.publicKey.toBase58());
    expect(ix.keys[1].pubkey.toBase58()).toBe(payer.publicKey.toBase58());
    expect(ix.data.length).toBeGreaterThan(0);
  });
});
