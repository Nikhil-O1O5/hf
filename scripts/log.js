const { ethers } = require("ethers");

// Connect to Sepolia network
const provider = new ethers.JsonRpcProvider(
  "https://sepolia.infura.io/v3/589879756e3f4ff78b2a6afbe87e1569"
);

// Contract Address and ABI
const contractAddress = "0xAA0B751E243C6859bC09ea5B86804f8B2368D47f";
const ABI = require("./EMIManagerABI.json");

const contract = new ethers.Contract(contractAddress, ABI, provider);

async function getTransactions() {
  console.log("Fetching contract events...");

  // Create filters for each event type
  const agreementFilter = contract.filters.AgreementCreated();
  const paymentFilter = contract.filters.PaymentExecuted();
  const completedFilter = contract.filters.AgreementCompleted();

  // Fetch all events
  const [agreements, payments, completed] = await Promise.all([
    contract.queryFilter(agreementFilter),
    contract.queryFilter(paymentFilter),
    contract.queryFilter(completedFilter),
  ]);

  console.log("\nAgreement Creation Events:");
  console.log("-------------------------");
  for (const event of agreements) {
    const agreementId = parseInt(event.args[0]);
    console.log(`Agreement ID: ${agreementId}`);
    console.log(`Transaction Hash: ${event.transactionHash}`);
    console.log(`Block Number: ${event.blockNumber}\n`);
  }

  console.log("\nPayment Execution Events:");
  console.log("------------------------");
  for (const event of payments) {
    const [agreementId, amount] = event.args;
    console.log(`Agreement ID: ${agreementId}`);
    console.log(`Amount Paid: ${ethers.formatEther(amount)} tokens`);
    console.log(`Transaction Hash: ${event.transactionHash}`);
    console.log(`Block Number: ${event.blockNumber}\n`);
  }

  console.log("\nCompleted Agreements:");
  console.log("--------------------");
  for (const event of completed) {
    const agreementId = parseInt(event.args[0]);
    console.log(`Agreement ID: ${agreementId}`);
    console.log(`Transaction Hash: ${event.transactionHash}`);
    console.log(`Block Number: ${event.blockNumber}\n`);
  }
}

getTransactions().catch((error) => {
  console.error("Error fetching events:", error);
  process.exit(1);
});
