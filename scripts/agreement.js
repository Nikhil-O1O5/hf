const { ethers } = require("ethers");

// CommonJS style
const { JsonRpcProvider, parseUnits } = require("ethers");

const fs = require("fs");

// Replace these with your actual values
const CONTRACT_ADDRESS = "0x1FAEF3b563821A3ADA3BaC3c3aFD48Eb3147a0dd";
const ABI = require("./EMIManagerABI.json"); // Save your ABI here
const PRIVATE_KEY =
  "0xa75c79c4aa73d8c8c31ef38cb1473a315941b6a4c78147027caf6561860ea34f"; // Only use in test/dev
const PROVIDER_URL =
  "https://sepolia.infura.io/v3/589879756e3f4ff78b2a6afbe87e1569"; // e.g., Infura or local node

// Agreement Parameters
const lender = "0x1acDAF70f1884bF3214dC7474603C457493B5748";
const borrower = "0x56a9e52576d4f9efBA8FCA359dE5D6398D58d15c";
const tokenAddress = "0x6d11b1C9f85057FC07148126F6D83A422dcc1EA2"; // ERC-20 token contract
const totalAmount = parseUnits("1000", 18);
const interestRate = 1200; // 12.00% annual interest (in basis points)
const months = 12; // 1 year
const startTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds

async function main() {
  const provider = new JsonRpcProvider(PROVIDER_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const emiManager = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  console.log("Creating agreement...");

  const tx = await emiManager.createAgreement(
    lender,
    borrower,
    tokenAddress,
    totalAmount,
    interestRate,
    months,
    startTime
  );

  console.log("Transaction submitted. Waiting for confirmation...");
  const receipt = await tx.wait();

  console.log("Agreement created in tx:", receipt.transactionHash);
}

main().catch(console.error);
