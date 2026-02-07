// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Agent Registry
 * - Maps agent roles to addresses + weights
 * - Used for weighted approval in TransactionQueue / Orchestrator
 */
contract AgentRegistry is Ownable {
    enum Role {
        DATA_PROVENANCE,
        VALUATION_ORACLE,
        LIQUIDITY,
        CREDIT,
        COMPLIANCE,
        STRATEGY,
        EXECUTION,
        ORCHESTRATOR,
        RISK_SENTINEL,
        ANALYST
    }

    struct Agent {
        Role role;
        uint96 weightBps;   // 0..10000
        bool active;
    }

    mapping(address => Agent) public agents;

    event AgentSet(address indexed agent, Role role, uint96 weightBps, bool active);

    constructor(address owner_) Ownable(owner_) {}

    function setAgent(address agent, Role role, uint96 weightBps, bool active) external onlyOwner {
        require(weightBps <= 10_000, "weightBps");
        agents[agent] = Agent({ role: role, weightBps: weightBps, active: active });
        emit AgentSet(agent, role, weightBps, active);
    }

    function isActive(address agent) external view returns (bool) {
        return agents[agent].active;
    }

    function weight(address agent) external view returns (uint96) {
        return agents[agent].weightBps;
    }

    function roleOf(address agent) external view returns (Role) {
        return agents[agent].role;
    }
}
