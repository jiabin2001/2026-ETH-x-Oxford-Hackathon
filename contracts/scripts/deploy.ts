import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Whitelist = await ethers.getContractFactory("ComplianceWhitelist");
  const whitelist = await Whitelist.deploy(deployer.address);
  await whitelist.waitForDeployment();

  const Registry = await ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const Constraints = await ethers.getContractFactory("ConstraintStore");
  const constraints = await Constraints.deploy(deployer.address);
  await constraints.waitForDeployment();

  const Vault = await ethers.getContractFactory("PortfolioVault");
  const vault = await Vault.deploy(deployer.address, await whitelist.getAddress());
  await vault.waitForDeployment();

  const Router = await ethers.getContractFactory("ExecutionRouter");
  const router = await Router.deploy(deployer.address, await constraints.getAddress(), await vault.getAddress());
  await router.waitForDeployment();

  const MockDex = await ethers.getContractFactory("MockDex");
  const dex = await MockDex.deploy();
  await dex.waitForDeployment();

  const Queue = await ethers.getContractFactory("TransactionQueue");
  const queue = await Queue.deploy(deployer.address, await registry.getAddress(), await router.getAddress());
  await queue.waitForDeployment();

  // Minimal registry config for demo: deployer is an active EXECUTION agent (enum index 6 in AgentRegistry).
  await (await registry.setAgent(deployer.address, 6, 10000, true)).wait();

  // Threshold to 67% (with deployer weight=10000 this passes)
  await (await queue.setThresholdBps(6700)).wait();

  // Wire router so ONLY the queue can execute.
  await (await router.setQueue(await queue.getAddress())).wait();
  await (await router.setDex(await dex.getAddress())).wait();

  console.log({
    whitelist: await whitelist.getAddress(),
    registry: await registry.getAddress(),
    constraints: await constraints.getAddress(),
    vault: await vault.getAddress(),
    router: await router.getAddress(),
    queue: await queue.getAddress(),
    dex: await dex.getAddress(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
