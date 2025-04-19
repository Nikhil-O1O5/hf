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
      BigInt(agreement.nextPaymentDue) + BigInt(120) // 2 minutes in seconds
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

  // Tests for the new borrower functions
  describe("Borrower functions", function () {
    beforeEach(async () => {
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
    });

    it("should return correct remaining EMIs", async () => {
      expect(await emiManager.getRemainingEMIs(0)).to.equal(12);
      
      // Process one payment
      await time.increaseTo(await emiManager.getNextDueDate(0));
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      expect(await emiManager.getRemainingEMIs(0)).to.equal(11);
    });

    it("should return correct next due date", async () => {
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getNextDueDate(0)).to.equal(agreement.nextPaymentDue);
      
      // Process one payment
      await time.increaseTo(agreement.nextPaymentDue);
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      expect(await emiManager.getNextDueDate(0)).to.equal(
        BigInt(agreement.nextPaymentDue) + BigInt(120) // 2 minutes in seconds
      );
    });

    it("should return correct current EMI amount", async () => {
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getCurrentEMIAmount(0)).to.equal(agreement.emiAmount);
    });

    it("should return correct total amount paid", async () => {
      expect(await emiManager.getTotalAmountPaid(0)).to.equal(0);
      
      // Process one payment
      await time.increaseTo(await emiManager.getNextDueDate(0));
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getTotalAmountPaid(0)).to.equal(agreement.emiAmount);
    });

    it("should return correct total amount remaining", async () => {
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getTotalAmountRemaining(0)).to.equal(
        agreement.emiAmount * BigInt(12)
      );
      
      // Process one payment
      await time.increaseTo(agreement.nextPaymentDue);
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      expect(await emiManager.getTotalAmountRemaining(0)).to.equal(
        agreement.emiAmount * BigInt(11)
      );
    });
  });

  // Tests for the new lender functions
  describe("Lender functions", function () {
    beforeEach(async () => {
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
    });

    it("should return correct total amount paid to lender", async () => {
      expect(await emiManager.getLenderTotalAmountPaid(0)).to.equal(0);
      
      // Process one payment
      await time.increaseTo(await emiManager.getNextDueDate(0));
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getLenderTotalAmountPaid(0)).to.equal(agreement.emiAmount);
    });

    it("should return correct total amount remaining to lender", async () => {
      const agreement = await emiManager.agreements(0);
      expect(await emiManager.getLenderTotalAmountRemaining(0)).to.equal(
        agreement.emiAmount * BigInt(12)
      );
      
      // Process one payment
      await time.increaseTo(agreement.nextPaymentDue);
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      expect(await emiManager.getLenderTotalAmountRemaining(0)).to.equal(
        agreement.emiAmount * BigInt(11)
      );
    });

    it("should return correct remaining months", async () => {
      expect(await emiManager.getLenderRemainingMonths(0)).to.equal(12);
      
      // Process one payment
      await time.increaseTo(await emiManager.getNextDueDate(0));
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
      
      expect(await emiManager.getLenderRemainingMonths(0)).to.equal(11);
    });
  });

  // Test full agreement details
  it("should return complete agreement details", async () => {
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
    
    const details = await emiManager.getAgreementDetails(0);
    
    expect(details.lender).to.equal(lenderAddress);
    expect(details.borrower).to.equal(borrowerAddress);
    expect(details.token).to.equal(await token.getAddress());
    expect(details.totalAmount).to.equal(ethers.parseEther("1000"));
    expect(details.interestRate).to.equal(1200);
    expect(details.months).to.equal(12);
    expect(details.startTime).to.equal(startTime);
    expect(details.isActive).to.be.true;
  });

  // Test completion of agreement
  it("should mark agreement as inactive after all payments", async () => {
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
    
    // Process all payments
    for (let i = 0; i < 12; i++) {
      await time.increaseTo(await emiManager.getNextDueDate(0));
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) await emiManager.performUpkeep(data);
    }
    
    // After all payments
    expect(await emiManager.getRemainingEMIs(0)).to.equal(0);
    expect(await emiManager.getTotalAmountRemaining(0)).to.equal(0);
    expect(await emiManager.getLenderRemainingMonths(0)).to.equal(0);
    
    const details = await emiManager.getAgreementDetails(0);
    expect(details.isActive).to.be.false;
  });

  // FIXED TEST: Process EMIs with 10-second intervals
  it("should process EMIs every 10 seconds and log details", async () => {
    // Create agreement with short payment intervals
    const startTime = BigInt(await time.latest()) + BigInt(10);
    const principal = ethers.parseEther("1000");
    const interestRate = 1200; // 12%
    const months = 12;
    
    await emiManager
      .connect(lender)
      .createAgreement(
        lenderAddress,
        borrowerAddress,
        await token.getAddress(),
        principal,
        interestRate,
        months,
        startTime
      );
    
    const agreementId = 0;
    console.log("\n=== INITIAL AGREEMENT DETAILS ===");
    
    // Get initial details
    const initialEMIAmount = await emiManager.getCurrentEMIAmount(agreementId);
    const initialTotalRemaining = await emiManager.getTotalAmountRemaining(agreementId);
    const initialRemainingEMIs = await emiManager.getRemainingEMIs(agreementId);
    const initialNextDueDate = await emiManager.getNextDueDate(agreementId);
    
    console.log(`Initial EMI Amount: ${ethers.formatEther(initialEMIAmount)} tokens`);
    console.log(`Initial Total Remaining: ${ethers.formatEther(initialTotalRemaining)} tokens`);
    console.log(`Initial Remaining EMIs: ${initialRemainingEMIs}`);
    console.log(`Initial Next Due Date: ${new Date(Number(initialNextDueDate) * 1000)}`);
    console.log(`Initial Amount Paid: ${ethers.formatEther(await emiManager.getTotalAmountPaid(agreementId))} tokens`);
    console.log(`Initial Lender Amount Paid: ${ethers.formatEther(await emiManager.getLenderTotalAmountPaid(agreementId))} tokens`);
    console.log(`Initial Lender Amount Remaining: ${ethers.formatEther(await emiManager.getLenderTotalAmountRemaining(agreementId))} tokens`);
    console.log(`Initial Lender Remaining Months: ${await emiManager.getLenderRemainingMonths(agreementId)}`);
    
    // Store initial EMI amount for later comparison
    const expectedTotalPayment = initialEMIAmount * BigInt(months);
    
    // Process each payment with 10-second intervals
    for (let i = 0; i < months; i++) {
      // Move to next payment date
      await time.increaseTo(await emiManager.getNextDueDate(agreementId));
      
      // Check and perform upkeep
      const [needed, data] = await emiManager.checkUpkeep("0x");
      if (needed) {
        await emiManager.performUpkeep(data);
        console.log(`\n=== AFTER PAYMENT ${i + 1} ===`);
        
        // Get updated details after payment
        const agreement = await emiManager.getAgreementDetails(agreementId);
        const totalPaid = await emiManager.getTotalAmountPaid(agreementId);
        const remainingEMIs = await emiManager.getRemainingEMIs(agreementId);
        const lenderPaid = await emiManager.getLenderTotalAmountPaid(agreementId);
        const lenderMonths = await emiManager.getLenderRemainingMonths(agreementId);
        
        console.log(`Total Paid: ${ethers.formatEther(totalPaid)} tokens`);
        console.log(`Remaining EMIs: ${remainingEMIs}`);
        console.log(`Lender Total Paid: ${ethers.formatEther(lenderPaid)} tokens`);
        console.log(`Lender Remaining Months: ${lenderMonths}`);
        console.log(`Agreement Active: ${agreement.isActive}`);
        
        // Display remaining info only if agreement is still active
        if (agreement.isActive) {
            const emiAmount = await emiManager.getCurrentEMIAmount(agreementId);
            const totalRemaining = await emiManager.getTotalAmountRemaining(agreementId);
            const nextDueDate = await emiManager.getNextDueDate(agreementId);
            const lenderRemaining = await emiManager.getLenderTotalAmountRemaining(agreementId);
            
            console.log(`EMI Amount: ${ethers.formatEther(emiAmount)} tokens`);
            console.log(`Total Remaining: ${ethers.formatEther(totalRemaining)} tokens`);
            console.log(`Next Due Date: ${new Date(Number(nextDueDate) * 1000)}`);
            console.log(`Lender Total Remaining: ${ethers.formatEther(lenderRemaining)} tokens`);
        } else {
            console.log(`Agreement completed - no more payments due`);
        }
        
        // Verify values are consistent
        expect(remainingEMIs).to.equal(months - (i + 1));
        expect(lenderMonths).to.equal(remainingEMIs);
        
        if (i < months - 1) {
          // Wait 10 seconds between payments
          await time.increase(10);
        }
      }
    }
    
    // Final verification
    const finalDetails = await emiManager.getAgreementDetails(agreementId);
    expect(finalDetails.isActive).to.be.false;
    expect(await emiManager.getRemainingEMIs(agreementId)).to.equal(0);
    expect(await emiManager.getTotalAmountRemaining(agreementId)).to.equal(0);
    expect(await emiManager.getLenderRemainingMonths(agreementId)).to.equal(0);
    
    // Verify total amount paid (should be close to EMI * months)
    const actualTotal = await emiManager.getTotalAmountPaid(agreementId);
    expect(actualTotal).to.equal(expectedTotalPayment);
    
    console.log("\n=== FINAL SUMMARY ===");
    console.log(`Total Principal: ${ethers.formatEther(principal)} tokens`);
    console.log(`Total Interest: ${ethers.formatEther(actualTotal - principal)} tokens`);
    console.log(`Total Paid: ${ethers.formatEther(actualTotal)} tokens`);
  });
});