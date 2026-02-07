// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CircuitBreaker.sol";
import "./ComplianceWhitelist.sol";

/**
 * PortfolioVault (skeleton)
 * - Holds assets (ERC20 tokens representing RWAs)
 * - ExecutionRouter performs swaps/bridges; Vault grants allowance to router.
 * - This contract is intentionally minimal for hackathon demo.
 */
contract PortfolioVault is Ownable, CircuitBreaker {
    ComplianceWhitelist public whitelist;
    address public router; // ExecutionRouter

    event RouterSet(address indexed router);
    event Swept(address indexed token, address indexed to, uint256 amount);

    constructor(address owner_, address whitelist_) Ownable(owner_) CircuitBreaker(owner_) {
        whitelist = ComplianceWhitelist(whitelist_);
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterSet(_router);
    }

    function approveToRouter(address token, uint256 amount) external onlyOwner {
        IERC20(token).approve(router, amount);
    }

    // Emergency: sweep tokens
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
        emit Swept(token, to, amount);
    }

    // Gate redemption example
    function redeem(address to, address token, uint256 amount) external whenNotPaused {
        require(whitelist.isAllowed(to), "not allowed");
        IERC20(token).transfer(to, amount);
    }
}
