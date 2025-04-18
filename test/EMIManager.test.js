const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EMIManager", function () {
  let emiManager;
  let token;
  let lender, borrower;
  let lenderAddress, borrowerAddress;

  beforeEach(async () => {
    try {
      [lender, borrower] = await ethers.getSigners();
      lenderAddress = await lender.getAddress();
      borrowerAddress = await borrower.getAddress();

      const Token = await ethers.getContractFactory("ERC20Mock");
      token = await Token.deploy(
        "Test Token",
        "TST",
        lenderAddress,
        ethers.parseEther("1000000")
      );
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();
      console.log(`Token deployed at: ${tokenAddress}`);

      const EMIManager = await ethers.getContractFactory("EMIManager");
      emiManager = await EMIManager.deploy();
      await emiManager.waitForDeployment();
      const emiAddress = await emiManager.getAddress();
      console.log(`EMIManager deployed at: ${emiAddress}`);

      await token
        .connect(lender)
        .transfer(borrowerAddress, ethers.parseEther("100000"));
      await token
        .connect(borrower)
        .approve(emiAddress, ethers.parseEther("100000"));
    } catch (error) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });

  it("should create agreement and process payments", async () => {
    const startTime = BigInt(await time.latest()) + BigInt(100);
    await emiManager
      .connect(lender)
      .createAgreement(
        lenderAddress,
        borrowerAddress,
        await token.getAddress(),
        ethers.parseEther("1000"),
        1200,
        12,
        startTime
      );

    const agreement = await emiManager.agreements(0);
    expect(agreement.isActive).to.be.true;
    expect(agreement.emiAmount).to.be.gt(0);

    await time.increaseTo(agreement.nextPaymentDue);

    const [upkeepNeeded, performData] = await emiManager.checkUpkeep("0x");
    if (upkeepNeeded) {
      await emiManager.performUpkeep(performData);
    }

    let updatedAgreement = await emiManager.agreements(0);
    expect(updatedAgreement.paymentsMade).to.equal(1);
    expect(updatedAgreement.nextPaymentDue).to.equal(
      BigInt(agreement.nextPaymentDue) + BigInt(30 * 24 * 3600)
    );

    for (let i = 1; i < 12; i++) {
      await time.increase(30 * 24 * 3600);
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
    }

    const finalAgreement = await emiManager.agreements(0);
    expect(finalAgreement.paymentsMade).to.equal(12);
    expect(finalAgreement.isActive).to.be.false;
  });

  it("should calculate EMI correctly", async () => {
    const principal = ethers.parseEther("1000"); // 1000 tokens
    const annualInterestRate = 1200; // 12%
    const months = 12;

    const emi = await emiManager.calculateEMI(
      principal,
      annualInterestRate,
      months
    );

    // For 1000 principal at 12% annual interest for 12 months
    // Monthly rate = 1%
    // EMI ≈ 88.8496240644 tokens
    const expectedEMI = ethers.parseEther("88.849624064405833");
    const tolerance = ethers.parseEther("0.001"); // Very small tolerance

    expect(emi).to.be.closeTo(
      expectedEMI,
      tolerance,
      "EMI calculation should match the expected value"
    );
  });
});
