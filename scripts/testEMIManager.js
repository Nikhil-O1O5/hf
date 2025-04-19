const hre = require("hardhat");
const { ethers } = require("hardhat"); // Correct import from Hardhat

async function main() {
  const emiAddress = "0x1FAEF3b563821A3ADA3BaC3c3aFD48Eb3147a0dd";
  const tokenAddress = "0x6d11b1C9f85057FC07148126F6D83A422dcc1EA2"; // ERC20Mock

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const EMIManager = await hre.ethers.getContractAt("EMIManager", emiAddress);
  const Token = await hre.ethers.getContractAt("ERC20Mock", tokenAddress);

  const now = Math.floor(Date.now() / 1000);
  const totalAmount = ethers.utils.parseUnits("1000", 18);

  console.log("Creating agreement...");
  const tx1 = await EMIManager.createAgreement(
    deployer.address,
    deployer.address,
    tokenAddress,
    totalAmount,
    1200,
    12,
    now
  );
  await tx1.wait();

  const agreementCount = await EMIManager.agreementCount();
  console.log("Agreement created. Total agreements:", agreementCount.toString());

  console.log("Approving EMIManager to spend tokens...");
  const approveTx = await Token.approve(emiAddress, totalAmount);
  await approveTx.wait();
  console.log("Approval complete.");

  console.log("Fetching EMI amount...");
  const emiAmount = await EMIManager.getCurrentEMIAmount(0);
  console.log("EMI Amount:", hre.ethers.utils.formatUnits(emiAmount, 18));

  console.log("Performing upkeep manually...");
  const encoded = hre.ethers.utils.defaultAbiCoder.encode(["uint"], [0]);
  const upkeepTx = await EMIManager.performUpkeep(encoded);
  await upkeepTx.wait();
  console.log("Upkeep done. First EMI paid.");

  const remainingEMIs = await EMIManager.getRemainingEMIs(0);
  const totalPaid = await EMIManager.getTotalAmountPaid(0);
  const totalRemaining = await EMIManager.getTotalAmountRemaining(0);

  console.log("Remaining EMIs:", remainingEMIs.toString());
  console.log("Total Paid:", hre.ethers.utils.formatUnits(totalPaid, 18));
  console.log("Total Remaining:", hre.ethers.utils.formatUnits(totalRemaining, 18));

  const details = await EMIManager.getAgreementDetails(0);
  console.log("\n--- Agreement Details ---");
  console.log("Lender:", details.lender);
  console.log("Borrower:", details.borrower);
  console.log("Token:", details.token);
  console.log("Total Amount:", hre.ethers.utils.formatUnits(details.totalAmount, 18));
  console.log("EMI Amount:", hre.ethers.utils.formatUnits(details.emiAmount, 18));
  console.log("Interest Rate:", details.interestRate.toString());
  console.log("Months:", details.months.toString());
  console.log("Start Time:", new Date(details.startTime.toNumber() * 1000));
  console.log("Next Due:", new Date(details.nextPaymentDue.toNumber() * 1000));
  console.log("Payments Made:", details.paymentsMade.toString());
  console.log("Active:", details.isActive);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
