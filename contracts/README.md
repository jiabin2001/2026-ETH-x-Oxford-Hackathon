# Contracts

Hardhat project for:
- AgentRegistry (permissions + weights)
- ConstraintStore (soft/dynamic parameters)
- TransactionQueue (weighted signature approvals)
- ExecutionRouter (hard constraint enforcement, bounded action types)
- PortfolioVault + ComplianceWhitelist + CircuitBreaker (skeleton)

Install:
```bash
npm i
npx hardhat compile
```

Note: requires OpenZeppelin Contracts. Hardhat toolbox includes ethers/testing; add OZ:
```bash
npm i @openzeppelin/contracts
```
