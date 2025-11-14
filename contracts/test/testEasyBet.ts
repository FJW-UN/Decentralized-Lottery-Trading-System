import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("EasyBet", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const EasyBetToken = await ethers.getContractFactory("EasyBetToken");
    const betToken = await EasyBetToken.deploy();
    await betToken.deployed();

    const EasyBet = await ethers.getContractFactory("EasyBet");
    const easyBet = await EasyBet.deploy(betToken.address);
    await easyBet.deployed();

    // Mint tokens to users for testing
    await betToken.mint(user1.address, ethers.utils.parseEther("1000"));
    await betToken.mint(user2.address, ethers.utils.parseEther("1000"));

    return { easyBet, betToken, owner, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should deploy ERC20 and EasyBet", async function () {
      const { easyBet, betToken } = await loadFixture(deployFixture);
      expect(await betToken.totalSupply()).to.equal(ethers.utils.parseEther("1000000"));
      expect(await easyBet.owner()).to.not.be.null;
    });
  });

  describe("Activity Creation", function () {
    it("Should create an activity", async function () {
      const { easyBet, owner } = await loadFixture(deployFixture);
      const choices = ["Team A", "Team B"];
      const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await easyBet.connect(owner).createActivity(choices, endTime, { value: ethers.utils.parseEther("1") });
      const activity = await easyBet.activities(1);
      expect(activity.creator).to.equal(owner.address);
      expect(activity.poolAmount).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("Buy Ticket", function () {
    it("Should buy a ticket with ETH", async function () {
      const { easyBet, user1 } = await loadFixture(deployFixture);
      const choices = ["Team A", "Team B"];
      const endTime = Math.floor(Date.now() / 1000) + 3600;
      await easyBet.createActivity(choices, endTime, { value: ethers.utils.parseEther("1") });
      await easyBet.connect(user1).buyTicket(1, "Team A", { value: ethers.utils.parseEther("0.01") });
      expect(await easyBet.ownerOf(1)).to.equal(user1.address);
    });

    it("Should buy a ticket with ERC20", async function () {
      const { easyBet, betToken, user1 } = await loadFixture(deployFixture);
      const choices = ["Team A", "Team B"];
      const endTime = Math.floor(Date.now() / 1000) + 3600;
      await easyBet.createActivity(choices, endTime, { value: ethers.utils.parseEther("1") });
      await easyBet.setUseToken(true);
      await betToken.connect(user1).approve(easyBet.address, ethers.utils.parseEther("0.01"));
      await easyBet.connect(user1).buyTicket(1, "Team A");
      expect(await easyBet.ownerOf(1)).to.equal(user1.address);
    });
  });

  describe("Token Trading", function () {
    it("Should list and buy token with ETH", async function () {
      const { easyBet, user1, user2 } = await loadFixture(deployFixture);
      const choices = ["Team A", "Team B"];
      const endTime = Math.floor(Date.now() / 1000) + 3600;
      await easyBet.createActivity(choices, endTime, { value: ethers.utils.parseEther("1") });
      await easyBet.connect(user1).buyTicket(1, "Team A", { value: ethers.utils.parseEther("0.01") });
      await easyBet.connect(user1).listTokenForSaleETH(1, ethers.utils.parseEther("0.02"));
      await easyBet.connect(user2).buyTokenETH(1, { value: ethers.utils.parseEther("0.02") });
      expect(await easyBet.ownerOf(1)).to.equal(user2.address);
    });
  });

  describe("Settle Activity", function () {
    it("Should settle activity and distribute prizes", async function () {
      const { easyBet, user1, user2 } = await loadFixture(deployFixture);
      const choices = ["Team A", "Team B"];
      const endTime = Math.floor(Date.now() / 1000) + 3600;
      await easyBet.createActivity(choices, endTime, { value: ethers.utils.parseEther("1") });
      await easyBet.connect(user1).buyTicket(1, "Team A", { value: ethers.utils.parseEther("0.01") });
      await easyBet.connect(user2).buyTicket(1, "Team A", { value: ethers.utils.parseEther("0.01") });
      // Fast-forward time
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await easyBet.settleActivity(1, "Team A");
      const activity = await easyBet.activities(1);
      expect(activity.isSettled).to.be.true;
    });
  });
});
