const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake", function () {
  let metaNodeStake, metaNodeToken;
  let owner, user1, user2;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 部署合约并初始化测试环境...");

    // 获取测试账户
    [owner, user1, user2] = await ethers.getSigners();
    console.log(`📝 Owner: ${owner.address}`);

    // 使用fixture重新部署合约，确保每次测试都有干净的状态
    await deployments.fixture(["MetaNodeStake"]);

    // 获取已部署的 MetaNodeToken 合约
    const metaNodeTokenDeployment = await deployments.get("MetaNodeToken");
    metaNodeToken = await ethers.getContractAt(
      "MetaNodeToken",
      metaNodeTokenDeployment.address,
      owner
    );
    console.log(`📄 [CONTRACT] MetaNodeToken at: ${metaNodeToken.address}`);

    // 获取已部署的 MetaNodeStake 代理合约
    const metaNodeStakeDeployment = await deployments.get("MetaNodeStake_Proxy");
    metaNodeStake = await ethers.getContractAt(
      "MetaNodeStake",
      metaNodeStakeDeployment.address,
      owner
    );
    console.log(`📄 [CONTRACT] MetaNodeStake at: ${metaNodeStake.address}`);

    console.log("✅ [SETUP] 合约部署完成，测试环境就绪");
  });

  describe("添加质押池子", function () {
    it("应该成功添加 ETH 质押池", async function () {
      console.log("🧪 [TEST] 测试管理员添加ETH质押池...");

      // 验证初始状态：没有池子
      const initialPoolLength = await metaNodeStake.poolLength();
      console.log(`🔍 初始池子数量: ${initialPoolLength}`);
      expect(initialPoolLength).to.equal(0);

      // 管理员添加ETH质押池
      const ethPoolWeight = 1; // 权重 1
      const ethMinDeposit = ethers.utils.parseEther("1"); // 最小质押 1 ETH
      const ethUnstakeBlocks = 200; // 解锁需要 200 个区块

      const tx = await metaNodeStake.connect(owner).addPool(
        "0x0000000000000000000000000000000000000000", // ETH 地址
        ethPoolWeight,
        ethMinDeposit,
        ethUnstakeBlocks,
        false // 不需要更新其他池子
      );
      await tx.wait();

      console.log("✅ ETH质押池添加成功");

      // 验证池子已添加
      const newPoolLength = await metaNodeStake.poolLength();
      expect(newPoolLength).to.equal(1);
      console.log(`🔍 新的池子数量: ${newPoolLength}`);

      // 验证总权重更新
      const totalPoolWeight = await metaNodeStake.totalPoolWeight();
      expect(totalPoolWeight).to.equal(ethPoolWeight);
      console.log(`🔍 总权重: ${totalPoolWeight}`);

      // 获取并验证ETH池子信息
      const ethPool = await metaNodeStake.pool(0);
      console.log(`🔍 ETH池子信息:`);
      console.log(`   - 代币地址: ${ethPool.stTokenAddress}`);
      console.log(`   - 权重: ${ethPool.poolWeight}`);
      console.log(`   - 最小质押: ${ethers.utils.formatEther(ethPool.minDepositAmount)} ETH`);
      console.log(`   - 解锁区块: ${ethPool.unstakeLockedBlocks}`);

      // 验证ETH池子配置
      expect(ethPool.stTokenAddress).to.equal("0x0000000000000000000000000000000000000000");
      expect(ethPool.poolWeight).to.equal(ethPoolWeight);
      expect(ethPool.minDepositAmount).to.equal(ethMinDeposit);
      expect(ethPool.unstakeLockedBlocks).to.equal(ethUnstakeBlocks);
      expect(ethPool.stTokenAmount).to.equal(0);
      expect(ethPool.accMetaNodePerST).to.equal(0);

      console.log("✅ ETH质押池验证通过");
      
      // 用户1第一次质押10ETH
      console.log("\n🧪 [TEST] 用户1【第一次质押】10ETH...");
      await metaNodeStake.connect(user1).depositETH({ value: ethers.utils.parseEther("10") });
      
      // 获取用户1的质押信息
      const user1StakingBalance = await metaNodeStake.stakingBalance(0, user1.address);
      const user1UserInfo = await metaNodeStake.user(0, user1.address);
      expect(user1StakingBalance).to.equal(ethers.utils.parseEther("10"));
      console.log(`✅ 用户1【第一次质押】成功质押 10 ETH. 当前质押总额: ${ethers.utils.formatEther(user1StakingBalance)} ETH`);
      
      // 打印池子信息和用户质押信息
      const poolAfterDeposit = await metaNodeStake.pool(0);
      console.log(`🔍 【第一次质押后】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(poolAfterDeposit.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${poolAfterDeposit.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${poolAfterDeposit.accMetaNodePerST}`);
      console.log(`🔍 用户1【第一次质押后】信息:`);
      console.log(`   - 地址: ${user1.address}`);
      console.log(`   - 质押总额: ${ethers.utils.formatEther(user1UserInfo.stAmount)} ETH`);
      console.log(`   - 已完成奖励: ${ethers.utils.formatEther(user1UserInfo.finishedMetaNode)} META`);
      console.log(`   - 待领取奖励: ${ethers.utils.formatEther(user1UserInfo.pendingMetaNode)} META`);

      // 模拟经过了100个区块
      console.log("\n⏰ [TEST] 模拟经过100个区块...");
      const currentBlock = await ethers.provider.getBlockNumber();
      console.log(`当前区块: ${currentBlock}`);

      // 推进100个区块
      for (let i = 0; i < 99; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      const newBlock = await ethers.provider.getBlockNumber();
      console.log(`新区块: ${newBlock}, 推进了 ${newBlock - currentBlock} 个区块`);

      // 用户1第二次质押10ETH
      console.log("\n🧪 [TEST] 用户1【第二次质押】10ETH...");
      await metaNodeStake.connect(user1).depositETH({ value: ethers.utils.parseEther("10") });
      
      // 获取用户1的最新质押信息
      const user1FinalStakingBalance = await metaNodeStake.stakingBalance(0, user1.address);
      const user1FinalUserInfo = await metaNodeStake.user(0, user1.address);
      expect(user1FinalStakingBalance).to.equal(ethers.utils.parseEther("20")); // 10 + 10 = 20
      
      // 打印最终的池子信息和用户质押信息
      const finalPool = await metaNodeStake.pool(0);
      console.log(`🔍 【第二次质押后】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(finalPool.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${finalPool.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${finalPool.accMetaNodePerST}`);
      console.log(`🔍 用户1【第二次质押后】信息:`);
      console.log(`   - 地址: ${user1.address}`);
      console.log(`   - 质押总额: ${ethers.utils.formatEther(user1FinalUserInfo.stAmount)} ETH`);
      console.log(`   - 已完成奖励: ${ethers.utils.formatEther(user1FinalUserInfo.finishedMetaNode)} META`);
      console.log(`   - 待领取奖励: ${ethers.utils.formatEther(user1FinalUserInfo.pendingMetaNode)} META`);
      
      
      // 模拟经过了100个区块
      console.log("\n⏰ [TEST] 模拟经过100个区块...");
      let currentBlock2 = await ethers.provider.getBlockNumber();
      console.log(`当前区块: ${currentBlock2}`);

      // 推进100个区块
      for (let i = 0; i < 99; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      let newBlock2 = await ethers.provider.getBlockNumber();
      console.log(`新区块: ${newBlock2}, 推进了 ${newBlock2 - currentBlock2} 个区块`);


     let finalPool2Before = await metaNodeStake.pool(0);
      console.log(`🔍 【第三次质押前】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(finalPool2Before.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${finalPool2Before.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${finalPool2Before.accMetaNodePerST}`);
      // 用户1第一次解抵押10ETH
      console.log("\n🧪 [TEST] 用户1【第一次解抵押】10ETH...");
      await metaNodeStake.connect(user1).unstake(0, ethers.utils.parseEther("10"));
      
      // 获取用户1的最新质押信息
      const user1AfterWithdrawStakingBalance = await metaNodeStake.stakingBalance(0, user1.address);
      const user1AfterWithdrawUserInfo = await metaNodeStake.user(0, user1.address);
      expect(user1AfterWithdrawStakingBalance).to.equal(ethers.utils.parseEther("10")); // 20 - 10 = 10
      
      // 打印最终的池子信息和用户质押信息
      const finalPool2 = await metaNodeStake.pool(0);
      console.log(`🔍 【第一次解抵押后】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(finalPool2.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${finalPool2.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${finalPool2.accMetaNodePerST}`);
      console.log(`🔍 用户1【第一次解抵押后】信息:`);
      console.log(`   - 地址: ${user1.address}`);
      console.log(`   - 质押总额: ${ethers.utils.formatEther(user1AfterWithdrawUserInfo.stAmount)} ETH`);
      console.log(`   - 已完成奖励: ${ethers.utils.formatEther(user1AfterWithdrawUserInfo.finishedMetaNode)} META`);
      console.log(`   - 待领取奖励: ${ethers.utils.formatEther(user1AfterWithdrawUserInfo.pendingMetaNode)} META`);

      // 模拟经过了300个区块，用户1提取已解锁赎回
      console.log("\n⏰ [TEST] 模拟经过300个区块...");
      currentBlock2 = await ethers.provider.getBlockNumber();
      console.log(`当前区块: ${currentBlock2}`);

      // 推进300个区块
      for (let i = 0; i < 299; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      newBlock2 = await ethers.provider.getBlockNumber();
      console.log(`新区块: ${newBlock2}, 推进了 ${newBlock2 - currentBlock2} 个区块`);

      finalPool2Before = await metaNodeStake.pool(0);
      console.log(`🔍 【领取奖励前】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(finalPool2Before.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${finalPool2Before.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${finalPool2Before.accMetaNodePerST}`);

      // 提取已解锁赎回
      console.log("\n🧪 [TEST] 用户1【提取已解锁赎回】...");
      await metaNodeStake.connect(user1).withdraw(0);
      // 获取用户1的最新质押信息
      const user1AfterWithdraw2StakingBalance = await metaNodeStake.stakingBalance(0, user1.address);
      const user1AfterWithdraw2UserInfo = await metaNodeStake.user(0, user1.address);
      expect(user1AfterWithdraw2StakingBalance).to.equal(ethers.utils.parseEther("10")); // 质押总额不变，仍为10ETH
      
      // 打印最终的池子信息和用户质押信息
      const finalPool3 = await metaNodeStake.pool(0);
      console.log(`🔍 【提取已解锁赎回后】ETH池子信息:`);
      console.log(`   - 当前质押总额: ${ethers.utils.formatEther(finalPool3.stTokenAmount)} ETH`);
      console.log(`   - 最后奖励区块: ${finalPool3.lastRewardBlock}`);
      console.log(`   - 累积奖励per Token: ${finalPool3.accMetaNodePerST}`);
      console.log(`🔍 用户1【提取已解锁赎回后】信息:`);
      console.log(`   - 地址: ${user1.address}`);
      console.log(`   - 质押总额: ${ethers.utils.formatEther(user1AfterWithdraw2UserInfo.stAmount)} ETH`);
      console.log(`   - 已完成奖励: ${ethers.utils.formatEther(user1AfterWithdraw2UserInfo.finishedMetaNode)} META`);
      console.log(`   - 待领取奖励: ${ethers.utils.formatEther(user1AfterWithdraw2UserInfo.pendingMetaNode)} META`);

      console.log("✅ 用户1质押、解抵押、领取奖励流程验证通过");

    });

    // it("应该成功添加 ERC20 代币质押池", async function () {
    //   console.log("🧪 [TEST] 测试管理员添加ERC20代币质押池...");

    //   // 先添加ETH池子
    //   await metaNodeStake.connect(owner).addPool(
    //     "0x0000000000000000000000000000000000000000",
    //     100,
    //     ethers.utils.parseEther("0.01"),
    //     200,
    //     false
    //   );

    //   // 部署一个测试ERC20代币
    //   const TestToken = await ethers.getContractFactory("MetaNodeToken");
    //   const testToken = await TestToken.deploy();
    //   await testToken.deployed();

    //   console.log(`📄 测试代币部署: ${testToken.address}`);

    //   // 添加ERC20代币质押池
    //   const tokenPoolWeight = 50; // 权重 50
    //   const tokenMinDeposit = ethers.utils.parseEther("10"); // 最小质押 10 代币
    //   const tokenUnstakeBlocks = 100; // 解锁需要 100 个区块

    //   const tx = await metaNodeStake.connect(owner).addPool(
    //     testToken.address,
    //     tokenPoolWeight,
    //     tokenMinDeposit,
    //     tokenUnstakeBlocks,
    //     false
    //   );
    //   await tx.wait();

    //   console.log("✅ ERC20代币质押池添加成功");

    //   // 验证池子数量
    //   const poolLength = await metaNodeStake.poolLength();
    //   expect(poolLength).to.equal(2);
    //   console.log(`🔍 总池子数量: ${poolLength}`);

    //   // 验证总权重更新
    //   const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    //   expect(totalPoolWeight).to.equal(150); // 100 + 50
    //   console.log(`🔍 总权重: ${totalPoolWeight}`);

    //   // 获取并验证ERC20池子信息（池子ID 1）
    //   const tokenPool = await metaNodeStake.pool(1);
    //   console.log(`🔍 ERC20代币池子信息:`);
    //   console.log(`   - 代币地址: ${tokenPool.stTokenAddress}`);
    //   console.log(`   - 权重: ${tokenPool.poolWeight}`);
    //   console.log(`   - 最小质押: ${ethers.utils.formatEther(tokenPool.minDepositAmount)} 代币`);
    //   console.log(`   - 解锁区块: ${tokenPool.unstakeLockedBlocks}`);

    //   // 验证ERC20池子配置
    //   expect(tokenPool.stTokenAddress).to.equal(testToken.address);
    //   expect(tokenPool.poolWeight).to.equal(tokenPoolWeight);
    //   expect(tokenPool.minDepositAmount).to.equal(tokenMinDeposit);
    //   expect(tokenPool.unstakeLockedBlocks).to.equal(tokenUnstakeBlocks);
    //   expect(tokenPool.stTokenAmount).to.equal(0);
    //   expect(tokenPool.accMetaNodePerST).to.equal(0);

    //   // 验证代币合约信息
    //   const tokenName = await testToken.name();
    //   const tokenSymbol = await testToken.symbol();
    //   console.log(`🔍 代币信息: ${tokenName} (${tokenSymbol})`);

    //   console.log("✅ ERC20代币质押池验证通过");
    // });
  });
});
