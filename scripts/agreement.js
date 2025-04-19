const { ethers } = require("ethers");
const { JsonRpcProvider, parseUnits } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration
const CONTRACT_ADDRESS = "0xAA0B751E243C6859bC09ea5B86804f8B2368D47f";
const ABI = require("./EMIManagerABI.json");
const TOKEN_ABI = require("./tokenABI.json");

const PRIVATE_KEY =
  "0xa75c79c4aa73d8c8c31ef38cb1473a315941b6a4c78147027caf6561860ea34f";
const PROVIDER_URL =
  "https://sepolia.infura.io/v3/589879756e3f4ff78b2a6afbe87e1569";

// Agreement Parameters
const lender = "0x1acDAF70f1884bF3214dC7474603C457493B5748";
const borrower = "0x56a9e52576d4f9efBA8FCA359dE5D6398D58d15c";
const tokenAddress = "0x6d11b1C9f85057FC07148126F6D83A422dcc1EA2";
const totalAmount = parseUnits("1000", 18);
const interestRate = 1200;
const months = 12;
const startTime = Math.floor(Date.now() / 1000) + 60; // Start in 5 minutes

async function main() {
  const provider = new JsonRpcProvider(PROVIDER_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, wallet);
  const emiManager = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  try {
    // Check initial balances
    console.log("\nChecking initial balances...");
    const initialLenderBalance = await token.balanceOf(lender);
    const initialBorrowerBalance = await token.balanceOf(borrower);
    console.log(
      "Lender:",
      ethers.formatUnits(initialLenderBalance, 18),
      "tokens"
    );
    console.log(
      "Borrower:",
      ethers.formatUnits(initialBorrowerBalance, 18),
      "tokens"
    );

    // First handle the token transfer
    console.log("\nInitiating token transfer...");
    console.log(
      "Amount to transfer:",
      ethers.formatUnits(totalAmount, 18),
      "tokens"
    );

    // Transfer tokens first
    const transferTx = await token.transfer(borrower, totalAmount);
    console.log("Transfer transaction submitted:", transferTx.hash);
    await transferTx.wait();
    console.log("Token transfer completed successfully!");

    // Verify the transfer
    const postTransferLenderBalance = await token.balanceOf(lender);
    const postTransferBorrowerBalance = await token.balanceOf(borrower);
    console.log("\nPost-transfer balances:");
    console.log(
      "Lender:",
      ethers.formatUnits(postTransferLenderBalance, 18),
      "tokens"
    );
    console.log(
      "Borrower:",
      ethers.formatUnits(postTransferBorrowerBalance, 18),
      "tokens"
    );

    // Create agreement only after successful transfer
    console.log("\nCreating EMI agreement...");
    const createTx = await emiManager.createAgreement(
      lender,
      borrower,
      tokenAddress,
      totalAmount,
      interestRate,
      months,
      startTime
    );
    console.log("Agreement transaction submitted:", createTx.hash);
    const receipt = await createTx.wait();

    // Extract agreementId from event data
    const agreementId = parseInt(receipt.logs[0].data, 16);

    const receiptData = {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: new Date().toISOString(),
      agreement: {
        id: agreementId, // Add the agreement ID here
        principal: ethers.formatUnits(totalAmount, 18),
        interestRate: interestRate / 100,
        duration: months,
        startTime: new Date(startTime * 1000).toISOString(),
      },
      receipt: JSON.parse(JSON.stringify(receipt)), // Clean receipt for JSON
    };

    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    // Write to file with timestamp in filename
    const filename = `agreement_${Date.now()}.json`;
    const filepath = path.join(logsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(receiptData, null, 2));
    console.log(`\nReceipt logged to: ${filepath}`);

    // Show agreement details
    console.log("\nAgreement created successfully!");
    console.log("Agreement Details:");
    console.log("-----------------");
    console.log("Agreement ID:", agreementId);
    console.log("Principal:", ethers.formatUnits(totalAmount, 18), "tokens");
    console.log("Interest Rate:", interestRate / 100, "%");
    console.log("Duration:", months, "months");
    console.log("Start Time:", new Date(startTime * 1000).toLocaleString());
  } catch (error) {
    console.error("\nError occurred:", error.message);
    if (error.transaction) {
      console.error("Failed transaction hash:", error.transaction.hash);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
