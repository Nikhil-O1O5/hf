const hre = require("hardhat");

async function main() {
  // First deploy the ERC20 token (if needed)
  const Token = await hre.ethers.getContractFactory("ERC20Mock");
  const token = await Token.deploy(
    "INR Coin",
    "INRC",
    "0x1acDAF70f1884bF3214dC7474603C457493B5748", // Replace with your wallet address
    hre.ethers.parseEther("1000000")
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`Token deployed to: ${tokenAddress}`);

  // Then deploy the EMIManager
  const EMIManager = await hre.ethers.getContractFactory("EMIManager");
  const emiManager = await EMIManager.deploy();
  await emiManager.waitForDeployment();
  const emiAddress = await emiManager.getAddress();
  console.log(`EMIManager deployed to: ${emiAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });