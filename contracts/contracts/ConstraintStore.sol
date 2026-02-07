// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * ConstraintStore
 * - Stores soft/dynamic parameters (updatable by governance / timelock in production)
 * - Hard constraints should be encoded directly in execution contracts.
 */
contract ConstraintStore is Ownable {
    // Examples (expand as needed)
    uint256 public maxSlippageBps = 50;   // 0.50%
    uint256 public maxTurnoverBps = 500;  // 5.00%
    bool public defensiveMode = false;

    event ParamsUpdated(uint256 maxSlippageBps, uint256 maxTurnoverBps, bool defensiveMode);

    constructor(address owner_) Ownable(owner_) {}

    function setParams(uint256 _maxSlippageBps, uint256 _maxTurnoverBps, bool _defensiveMode) external onlyOwner {
        require(_maxSlippageBps <= 500, "slippage too high"); // hard cap example
        require(_maxTurnoverBps <= 2000, "turnover too high"); // 20% hard cap example
        maxSlippageBps = _maxSlippageBps;
        maxTurnoverBps = _maxTurnoverBps;
        defensiveMode = _defensiveMode;
        emit ParamsUpdated(_maxSlippageBps, _maxTurnoverBps, _defensiveMode);
    }
}
