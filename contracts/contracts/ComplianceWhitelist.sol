// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * ComplianceWhitelist
 * - Minimal investor allow-list + attributes
 * - In production: integrate with KYC provider + verifiable credentials
 */
contract ComplianceWhitelist is Ownable {
    struct Investor {
        bool allowed;
        uint16 jurisdiction; // ISO numeric-ish for demo
        bool accredited;
    }

    mapping(address => Investor) public investors;

    event InvestorSet(address indexed investor, bool allowed, uint16 jurisdiction, bool accredited);

    constructor(address owner_) Ownable(owner_) {}

    function setInvestor(address investor, bool allowed, uint16 jurisdiction, bool accredited) external onlyOwner {
        investors[investor] = Investor({ allowed: allowed, jurisdiction: jurisdiction, accredited: accredited });
        emit InvestorSet(investor, allowed, jurisdiction, accredited);
    }

    function isAllowed(address investor) external view returns (bool) {
        return investors[investor].allowed;
    }
}
