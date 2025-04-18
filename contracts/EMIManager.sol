// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;  // Keep this at 0.8.0 for Chainlink compatibility
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EMIManager is AutomationCompatibleInterface {
    struct Agreement {
        address lender;
        address borrower;
        address token;
        uint totalAmount;
        uint emiAmount;
        uint interestRate;
        uint months;
        uint startTime;
        uint nextPaymentDue;
        uint paymentsMade;
        bool isActive;
    }

    Agreement[] public agreements;
    uint public agreementCount;
    
    event AgreementCreated(uint agreementId);
    event PaymentExecuted(uint agreementId, uint amount);
    event AgreementCompleted(uint agreementId);

    function createAgreement(
        address lender,
        address borrower,
        address token,
        uint totalAmount,
        uint interestRate,
        uint months,
        uint startTime
    ) external {
        uint emi = calculateEMI(totalAmount, interestRate, months);
        
        agreements.push(Agreement({
            lender: lender,
            borrower: borrower,
            token: token,
            totalAmount: totalAmount,
            emiAmount: emi,
            interestRate: interestRate,
            months: months,
            startTime: startTime,
            nextPaymentDue: startTime + 30 days,
            paymentsMade: 0,
            isActive: true
        }));
        
        emit AgreementCreated(agreementCount);
        agreementCount++;
    }

    function calculateEMI(uint256 principal, uint256 annualInterestRate, uint256 months) 
        public pure returns (uint256) {
        // Using higher precision for calculations (1e27)
        uint256 PRECISION = 1e27;
        
        // Convert annual rate to monthly rate with precision
        // For 12% annual, monthly rate = 0.12 / 12 = 0.01
        uint256 monthlyRate = (annualInterestRate * PRECISION) / (12 * 10000);
        
        // Calculate (1 + r)^n
        uint256 onePlusR = PRECISION + monthlyRate;
        uint256 powFactor = onePlusR;
        for(uint256 i = 1; i < months; i++) {
            powFactor = (powFactor * onePlusR) / PRECISION;
        }
        
        // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
        uint256 numerator = principal * monthlyRate * powFactor;
        uint256 denominator = (powFactor - PRECISION) * PRECISION;
        
        return numerator / denominator;
    }

    function checkUpkeep(bytes calldata) external view override 
        returns (bool upkeepNeeded, bytes memory) {
        for (uint i = 0; i < agreements.length; i++) {
            if (agreements[i].isActive && 
                block.timestamp >= agreements[i].nextPaymentDue) {
                return (true, abi.encode(i));
            }
        }
        return (false, "");
    }

    function performUpkeep(bytes calldata performData) external override {
        uint agreementId = abi.decode(performData, (uint));
        Agreement storage agreement = agreements[agreementId];
        
        require(agreement.isActive, "Agreement inactive");
        require(block.timestamp >= agreement.nextPaymentDue, "Payment not due");
        
        IERC20 token = IERC20(agreement.token);
        require(token.allowance(agreement.borrower, address(this)) >= agreement.emiAmount,
            "Insufficient allowance");
        
        token.transferFrom(agreement.borrower, agreement.lender, agreement.emiAmount);
        
        agreement.paymentsMade++;
        agreement.nextPaymentDue += 30 days;
        
        if(agreement.paymentsMade >= agreement.months) {
            agreement.isActive = false;
            emit AgreementCompleted(agreementId);
        }
        
        emit PaymentExecuted(agreementId, agreement.emiAmount);
    }
}