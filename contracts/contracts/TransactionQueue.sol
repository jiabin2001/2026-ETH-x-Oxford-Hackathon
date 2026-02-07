// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AgentRegistry.sol";
import "./ExecutionRouter.sol";

/**
 * TransactionQueue
 * - Agents sign an action (EIP-191 hash) off-chain.
 * - Anyone can submit the action + signatures.
 * - Contract verifies weighted threshold via AgentRegistry.
 * - If COMPLIANCE agent signed "veto" offchain, it should not be submitted; keep logic offchain for MVP.
 *
 * NOTE: For production, use EIP-712 typed data, nonce management, replay protection, timelocks, etc.
 */
contract TransactionQueue is Ownable {
    using ECDSA for bytes32;

    AgentRegistry public registry;
    ExecutionRouter public router;

    // threshold weight in bps (e.g. 6700 => 67%)
    uint96 public thresholdBps = 6700;

    // replay protection
    mapping(bytes32 => bool) public executed;

    event ThresholdSet(uint96 thresholdBps);
    event ActionExecuted(bytes32 indexed actionHash, ExecutionRouter.ActionType actionType);

    constructor(address owner_, address registry_, address router_) Ownable(owner_) {
        registry = AgentRegistry(registry_);
        router = ExecutionRouter(router_);
    }

    function setThresholdBps(uint96 _thresholdBps) external onlyOwner {
        require(_thresholdBps <= 10_000, "threshold");
        thresholdBps = _thresholdBps;
        emit ThresholdSet(_thresholdBps);
    }

    function _hashAction(ExecutionRouter.ActionType actionType, bytes calldata params, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(actionType, params, nonce));
    }

    function executeWithSignatures(
        ExecutionRouter.ActionType actionType,
        bytes calldata params,
        uint256 nonce,
        bytes[] calldata sigs
    ) external {
        bytes32 actionHash = _hashAction(actionType, params, nonce);
        require(!executed[actionHash], "replay");
        executed[actionHash] = true;

        bytes32 ethHash = actionHash.toEthSignedMessageHash();

        uint256 totalWeightBps = 0;
        address last = address(0);

        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = ethHash.recover(sigs[i]);
            // naive duplicate prevention: require strict ordering
            require(signer > last, "dup/order");
            last = signer;

            AgentRegistry.Agent memory a = registry.agents(signer);
            if (!a.active) continue;
            totalWeightBps += a.weightBps;
        }

        require(totalWeightBps >= thresholdBps, "insufficient approvals");

        // For hackathon: router is owned by queue owner or queue itself.
        router.execute(actionType, params);

        emit ActionExecuted(actionHash, actionType);
    }
}
