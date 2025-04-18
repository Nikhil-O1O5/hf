const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EMIManager", function () {
  let emiManager;
  let token;
  let lender, borrower;

  beforeEach(async () => {
    [lender, borrower] = await ethers.getSigners();

    // Deploy Mock ERC20 Token
    const Token = await ethers.getContractFactory("ERC20Mock");
    token = await Token.deploy("Test Token", "TST", lender.address, 1000000);
    
    // Deploy EMIManager
    const EMIManager = await ethers.getContractFactory("EMIManager");
    emiManager = await EMIManager.deploy();
    
    // Fund borrower with tokens
    await token.connect(lender).transfer(borrower.address, 100000);
    await token.connect(borrower).approve(emiManager.address, 100000);
  });

  it("should create agreement and process payments", async () => {
    // Create Agreement
    const startTime = (await time.latest()) + 100;
    await emiManager.connect(lender).createAgreement(
      lender.address,
      borrower.address,
      token.address,
      ethers.parseEther("1000"), // totalAmount
      1200, // 12% annual interest (in basis points)
      12,   // 12 months
      startTime
    );

    // Verify agreement creation
    const agreement = await emiManager.agreements(0);
    expect(agreement.isActive).to.be.true;
    expect(agreement.emiAmount).to.be.gt(0);

    // Fast-forward to first payment due date
    await time.increaseTo(agreement.nextPaymentDue);

    // Check and execute upkeep
    const [upkeepNeeded, performData] = await emiManager.checkUpkeep("0x");
    if (upkeepNeeded) {
      await emiManager.performUpkeep(performData);
    }

    // Verify first payment
    let updatedAgreement = await emiManager.agreements(0);
    expect(updatedAgreement.paymentsMade).to.equal(1);
    expect(updatedAgreement.nextPaymentDue).to.equal(
      agreement.nextPaymentDue + 30 * 24 * 3600
    );

    // Simulate all 12 payments
    for (let i = 1; i < 12; i++) {
      await time.increase(30 * 24 * 3600);
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
    }

    // Verify completion
    const finalAgreement = await emiManager.agreements(0);
    expect(finalAgreement.paymentsMade).to.equal(12);
    expect(finalAgreement.isActive).to.be.false;
  });

  it("should calculate EMI correctly", async () => {
    // Test calculation for 1000 principal, 12% annual, 12 months
    const emi = await emiManager.calculateEMI(
      ethers.parseEther("1000"),
      1200,
      12
    );
    // Expected EMI ~88.85 (exact value depends on calculation precision)
    expect(emi).to.be.closeTo(ethers.parseEther("88.85"), ethers.parseEther("0.1"));
  });
});