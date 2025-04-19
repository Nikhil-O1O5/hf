const { ethers } = require("ethers");

// Configuration
const PROVIDER_URL =
  "https://sepolia.infura.io/v3/589879756e3f4ff78b2a6afbe87e1569";
const EMI_MANAGER_ADDRESS = "0xAA0B751E243C6859bC09ea5B86804f8B2368D47f";
const TOKEN_ADDRESS = "0x6d11b1C9f85057FC07148126F6D83A422dcc1EA2";
const BORROWER_PRIVATE_KEY =
  "0xd927e5e6f7367a3a27a48b6f35962a8e642db8f50b495c9cb44782a4ea06365e";
const AGREEMENT_ID = 0;

// Import ABIs
const EMI_MANAGER_ABI = require("./EMIManagerABI.json");
const TOKEN_ABI = require("./tokenABI.json");

async function approveEMIPayments() {
  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const wallet = new ethers.Wallet(BORROWER_PRIVATE_KEY, provider);

  // Initialize contract instances
  const emiManager = new ethers.Contract(
    EMI_MANAGER_ADDRESS,
    EMI_MANAGER_ABI,
    wallet
  );
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

  try {
    // Get agreement details
    const agreement = await emiManager.getAgreementDetails(AGREEMENT_ID);
    const emiAmount = agreement.emiAmount;
    const remainingMonths = await emiManager.getRemainingEMIs(AGREEMENT_ID);

    console.log("\nAgreement Details:");
    console.log("EMI Amount:", ethers.formatEther(emiAmount), "tokens");
    console.log("Remaining EMIs:", remainingMonths.toString());

    // Calculate total approval needed
    const totalApprovalNeeded = emiAmount * BigInt(remainingMonths) + 1n;
    console.log(
      "Total approval needed:",
      ethers.formatEther(totalApprovalNeeded),
      "tokens"
    );

    // Approve EMI Manager to spend tokens
    console.log("\nApproving EMI payments...");
    const tx = await tokenContract.approve(
      EMI_MANAGER_ADDRESS,
      totalApprovalNeeded
    );
    console.log("Approval transaction submitted:", tx.hash);

    await tx.wait();
    console.log("\nEMI payments approved successfully!");

    // Verify approval
    const allowance = await tokenContract.allowance(
      wallet.address,
      EMI_MANAGER_ADDRESS
    );
    console.log("Current allowance:", ethers.formatEther(allowance), "tokens");
  } catch (error) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Contract error message:", error.data.message);
    }
    throw error;
  }
}

async function payNextEMI() {
  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const wallet = new ethers.Wallet(BORROWER_PRIVATE_KEY, provider);

  const emiManager = new ethers.Contract(
    EMI_MANAGER_ADDRESS,
    EMI_MANAGER_ABI,
    wallet
  );
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

  try {
    // Get payment details
    const nextEMIAmount = await emiManager.getCurrentEMIAmount(AGREEMENT_ID);
    const nextDueDate = await emiManager.getNextDueDate(AGREEMENT_ID);
    const agreement = await emiManager.getAgreementDetails(AGREEMENT_ID);

    console.log("\nPayment Details:");
    console.log(
      "Next EMI Amount:",
      ethers.formatEther(nextEMIAmount),
      "tokens"
    );
    console.log(
      "Next Payment Due:",
      new Date(Number(nextDueDate) * 1000).toLocaleString()
    );

    // Check if payment is due
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime <= Number(nextDueDate)) {
      console.log(
        "\nPayment not due yet. Next payment due on:",
        new Date(Number(nextDueDate) * 1000).toLocaleString()
      );
      return;
    }

    // First, transfer the EMI amount directly to lender
    console.log("\nTransferring EMI payment to lender...");
    const transferTx = await tokenContract.transfer(
      agreement.lender,
      nextEMIAmount
    );
    await transferTx.wait();
    console.log("Token transfer successful!");

    // Then update the contract state
    console.log("\nUpdating contract payment status...");
    const updateTx = await emiManager.updatePaymentStatus(AGREEMENT_ID);
    await updateTx.wait();
    console.log("Contract updated successfully!");

    // Show updated status
    const newRemainingEMIs = await emiManager.getRemainingEMIs(AGREEMENT_ID);
    const newNextDueDate = await emiManager.getNextDueDate(AGREEMENT_ID);
    console.log("\nUpdated Status:");
    console.log("Remaining EMIs:", newRemainingEMIs.toString());
    console.log(
      "Next Payment Due:",
      new Date(Number(newNextDueDate) * 1000).toLocaleString()
    );
  } catch (error) {
    console.error("\nError:", error.message);
    if (error.data) {
      console.error("Contract error message:", error.data.message);
    }
    throw error;
  }
}

// Execute the payment
payNextEMI()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
