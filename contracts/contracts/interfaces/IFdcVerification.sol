// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal interface placeholder for Flare's FdcVerification contract.
 * In Flare, contracts can verify Merkle proofs against the Relay-stored root.
 * Replace with the actual ABI from Flare docs when integrating on testnet/mainnet.
 */
interface IFdcVerification {
    function verifyAddressValidity(bytes calldata attestationResponse, bytes32[] calldata proof) external view returns (bool);
    function verifyEvmTransaction(bytes calldata attestationResponse, bytes32[] calldata proof) external view returns (bool);
    function verifyJsonApi(bytes calldata attestationResponse, bytes32[] calldata proof) external view returns (bool);
}
