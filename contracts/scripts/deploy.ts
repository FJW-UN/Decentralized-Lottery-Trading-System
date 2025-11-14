import { ethers } from "hardhat";

async function main() {
  // Deploy ERC20 Token
  const EasyBetToken = await ethers.getContractFactory("EasyBetToken");
  const betToken = await EasyBetToken.deploy();
  await betToken.deployed();
  console.log(`EasyBetToken deployed to ${betToken.address}`);

  // Deploy EasyBet contract
  const EasyBet = await ethers.getContractFactory("EasyBet");
  const easyBet = await EasyBet.deploy(betToken.address);
  await easyBet.deployed();
  console.log(`EasyBet deployed to ${easyBet.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
