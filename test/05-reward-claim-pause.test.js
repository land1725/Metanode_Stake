const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake - Reward Distribution and Claim Pause Controls", function () {
  let metaNodeStake;
  let metaNodeToken;
  let metaNodeTokenDeployment;
  let mockERC20Token;
  let owner, user1, user2;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 初始化奖励分配与领取测试环境...");

    [owner, user1, user2] = await ethers.getSigners();
    console.log(`📝 Owner: ${owner.address}`);
    console.log(`📝 User1: ${user1.address}`);
    console.log(`📝 User2: ${user2.address}`);

    // 1. 部署所有合约
    console.log("📄 [STEP 1] 部署所有合约...");
    await deployments.fixture(["MetaNode", "MetaNodeStake"]);

    // 2. 获取 MetaNode 代币合约
    console.log("📄 [STEP 2] 获取 MetaNode 代币合约...");
    metaNodeTokenDeployment = await deployments.get("MetaNode_Proxy");
    metaNodeToken = await ethers.getContractAt(
      "MetaNode",
      metaNodeTokenDeployment.address,
      owner
    );
    console.log(
      `✅ MetaNode 代币合约获取完成: ${metaNodeTokenDeployment.address}`
    );

    // 3. 获取 MetaNodeStake 合约
    console.log("📄 [STEP 3] 获取 MetaNodeStake 合约...");
    const metaNodeStakeDeployment = await deployments.get(
      "MetaNodeStake_Proxy"
    );
    metaNodeStake = await ethers.getContractAt(
      "MetaNodeStake",
      metaNodeStakeDeployment.address,
      owner
    );
    console.log(
      `✅ MetaNodeStake 合约获取完成: ${metaNodeStakeDeployment.address}`
    );

    // 4. 部署测试用的 MockERC20 代币
    console.log("📄 [STEP 4] 部署测试用 ERC20 代币...");
    const MockERC20 = await ethers.getContractFactory("MockERC20", owner);
    mockERC20Token = await MockERC20.deploy(
      "Test Token",
      "TEST",
      ethers.utils.parseUnits("1000000", 18)
    );
    await mockERC20Token.deployed();
    console.log(`✅ MockERC20 代币部署完成: ${mockERC20Token.address}`);

    // 5. 创建ETH池和ERC20池
    console.log("📄 [STEP 5] 创建质押池...");
    
    // 添加ETH池 (池ID = 0)
    await metaNodeStake.addPool(
      ethers.constants.AddressZero, // ETH池
      100, // 池权重
      ethers.utils.parseUnits("0.01", 18), // 最小质押 0.01 ETH
      100 // 解锁周期 100 blocks
    );
    console.log("   ✅ ETH池添加完成 (Pool ID: 0)");

    // 添加ERC20池 (池ID = 1)
    await metaNodeStake.addPool(
      mockERC20Token.address, // ERC20代币
      50, // 池权重
      ethers.utils.parseUnits("100", 18), // 最小质押 100 tokens
      200 // 解锁周期 200 blocks
    );
    console.log("   ✅ ERC20池添加完成 (Pool ID: 1)");

    // 6. 为用户准备ERC20代币余额和授权
    console.log("📄 [STEP 6] 准备用户资产...");
    
    // 给user1转移ERC20代币
    const user1TokenAmount = ethers.utils.parseUnits("10000", 18);
    await mockERC20Token.transfer(user1.address, user1TokenAmount);
    console.log(`   ✅ User1 获得 ${ethers.utils.formatUnits(user1TokenAmount, 18)} TEST代币`);

    // 给user2转移ERC20代币
    const user2TokenAmount = ethers.utils.parseUnits("5000", 18);
    await mockERC20Token.transfer(user2.address, user2TokenAmount);
    console.log(`   ✅ User2 获得 ${ethers.utils.formatUnits(user2TokenAmount, 18)} TEST代币`);

    // 用户授权质押合约使用ERC20代币
    const approveAmount = ethers.utils.parseUnits("50000", 18); // 大量授权
    await mockERC20Token.connect(user1).approve(metaNodeStake.address, approveAmount);
    await mockERC20Token.connect(user2).approve(metaNodeStake.address, approveAmount);
    console.log("   ✅ 用户ERC20授权完成");

    // 7. 设置有效质押以产生奖励
    console.log("📄 [STEP 7] 设置有效质押...");
    
    // User1质押一些ERC20代币
    const user1StakeAmount = ethers.utils.parseUnits("1000", 18);
    await metaNodeStake.connect(user1).stakeERC20(1, user1StakeAmount);
    console.log(`   ✅ User1 已质押 ${ethers.utils.formatUnits(user1StakeAmount, 18)} TEST代币`);

    // User2质押一些ETH
    const user2StakeAmount = ethers.utils.parseUnits("0.5", 18);
    await metaNodeStake.connect(user2).stakeETH(0, { value: user2StakeAmount });
    console.log(`   ✅ User2 已质押 ${ethers.utils.formatUnits(user2StakeAmount, 18)} ETH`);

    // 8. 验证奖励代币充足
    console.log("📄 [STEP 8] 验证奖励代币充足...");
    const stakingContractBalance = await metaNodeToken.balanceOf(metaNodeStake.address);
    console.log(`   ✅ 质押合约 MetaNode 余额: ${ethers.utils.formatUnits(stakingContractBalance, 18)} tokens`);
    expect(stakingContractBalance).to.be.gt(0);

    // 9. 验证领奖暂停状态（应该都是false，即开放状态）
    console.log("📄 [STEP 9] 验证领奖暂停状态...");
    const stakingPaused = await metaNodeStake.stakingPaused();
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    const claimPaused = await metaNodeStake.claimPaused();
    
    expect(stakingPaused).to.be.false;
    expect(unstakingPaused).to.be.false;
    expect(withdrawPaused).to.be.false;
    expect(claimPaused).to.be.false;
    console.log("   ✅ 所有暂停开关初始为开放状态");

    console.log("✅ [SETUP] 奖励分配与领取测试环境初始化完成\n");

    console.log("✅ [SETUP] 奖励分配与领取测试环境初始化完成\n");

    // 打印当前状态信息
    console.log("📊 [INFO] 当前环境状态:");
    const poolLength = await metaNodeStake.getPoolLength();
    console.log(`   ✅ 池子数量: ${poolLength}`);
    console.log(`   ✅ ETH池最小质押: ${ethers.utils.formatUnits(ethers.utils.parseUnits("0.01", 18), 18)} ETH`);
    console.log(`   ✅ ERC20池最小质押: ${ethers.utils.formatUnits(ethers.utils.parseUnits("100", 18), 18)} TEST`);
    console.log(`   ✅ User1 ERC20质押量: ${ethers.utils.formatUnits(user1StakeAmount, 18)} TEST`);
    console.log(`   ✅ User2 ETH质押量: ${ethers.utils.formatUnits(user2StakeAmount, 18)} ETH`);
    // 打印池子的 lastRewardBlock
    const ethPoolInfo = await metaNodeStake.pool(0);
    console.log(`   ✅ ETH池 lastRewardBlock: ${ethPoolInfo.lastRewardBlock}`);
    const erc20PoolInfo = await metaNodeStake.pool(1);
    console.log(`   ✅ ERC20池 lastRewardBlock: ${erc20PoolInfo.lastRewardBlock}`);
    console.log(`   ✅ 质押合约奖励余额: ${ethers.utils.formatUnits(stakingContractBalance, 18)} META`);
  });

  // 测试用例1：奖励正确累计并发放
  it("should correctly accumulate and distribute rewards", async function () {
    console.log("🧪 [TEST 1] 测试奖励正确累计并发放...");

    // 前置条件：用户有质押资产、产生奖励
    console.log("🔍 验证前置条件...");
    const user1Info = await metaNodeStake.user(1, user1.address);
    expect(user1Info.stAmount).to.be.gt(0);
    console.log(`   ✅ User1 有质押资产: ${ethers.utils.formatUnits(user1Info.stAmount, 18)} TEST`);

    // 获取合约参数用于奖励计算
    const metaNodePerBlock = await metaNodeStake.MetaNodePerBlock();
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    const poolInfo = await metaNodeStake.pool(1); // ERC20池
    const userStakeAmount = user1Info.stAmount;
    
    console.log("📊 [奖励计算参数]:");
    console.log(`   📊 每区块奖励: ${ethers.utils.formatUnits(metaNodePerBlock, 18)} META`);
    console.log(`   📊 总池权重: ${totalPoolWeight}`);
    console.log(`   📊 ERC20池权重: ${poolInfo.poolWeight}`);
    console.log(`   📊 池中总质押量: ${ethers.utils.formatUnits(poolInfo.stTokenAmount, 18)} TEST`);
    console.log(`   📊 用户质押量: ${ethers.utils.formatUnits(userStakeAmount, 18)} TEST`);

    // 记录开始区块和初始状态
    const startBlock = await ethers.provider.getBlockNumber();
    const initialAccMetaNodePerST = poolInfo.accMetaNodePerST;
    console.log(`   📊 开始区块: ${startBlock}`);
    console.log(`   📊 初始accMetaNodePerST: ${ethers.utils.formatUnits(initialAccMetaNodePerST, 18)} META/TEST`);

    // 先挖矿生成更多奖励
    const miningBlocks = 15;
    for (let i = 0; i < miningBlocks; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    const endBlock = await ethers.provider.getBlockNumber();
    console.log(`   ✅ 已挖矿${miningBlocks}个区块，结束区块: ${endBlock}`);

    // 记录领取前状态
    const user1MetaBalanceBefore = await metaNodeToken.balanceOf(user1.address);
    const contractMetaBalanceBefore = await metaNodeToken.balanceOf(metaNodeStake.address);
    console.log(`   📊 User1 领取前 META 余额: ${ethers.utils.formatUnits(user1MetaBalanceBefore, 18)} META`);
    console.log(`   📊 合约领取前 META 余额: ${ethers.utils.formatUnits(contractMetaBalanceBefore, 18)} META`);

    // 测试步骤：用户领取奖励
    console.log("📄 执行奖励领取...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 执行交易并验证事件触发
    const tx = await metaNodeStakeAsUser1.claimReward(1);
    const receipt = await tx.wait();
    
    // 获取claimReward执行时的区块号
    const claimBlock = receipt.blockNumber;
    console.log(`   📊 claimReward执行区块: ${claimBlock}`);
    
    // 根据合约实际逻辑计算奖励：blocks = claimBlock - poolInfo.lastRewardBlock
    const actualBlocks = claimBlock - poolInfo.lastRewardBlock;
    console.log(`   📊 实际奖励区块数: ${actualBlocks} (从上次更新区块${poolInfo.lastRewardBlock}到执行区块${claimBlock})`);
    
    // 使用BigNumber进行精确计算
    // 池子总奖励 = 区块数 * 每区块奖励 * 池权重 / 总权重
    const poolTotalReward = ethers.BigNumber.from(actualBlocks)
      .mul(metaNodePerBlock)
      .mul(poolInfo.poolWeight)
      .div(totalPoolWeight);
    console.log(`   📊 池子总奖励: ${ethers.utils.formatUnits(poolTotalReward, 18)} META`);
    
    // 用户奖励 = 池子总奖励 * 用户质押量 / 池中总质押量
    const expectedUserReward = poolTotalReward
      .mul(userStakeAmount)
      .div(poolInfo.stTokenAmount);
    console.log(`   📊 预期用户奖励: ${ethers.utils.formatUnits(expectedUserReward, 18)} META`);
    
    // 使用chai的emit断言验证Claim事件
    await expect(tx)
      .to.emit(metaNodeStake, "Claim")
      .withArgs(user1.address, 1, (amount) => {
        expect(amount).to.be.gt(0);
        return true;
      });
    
    // 从receipt中获取实际领取的数量用于后续验证
    const claimEvent = receipt.events?.find(e => e.event === "Claim");
    const claimedAmount = claimEvent.args.MetaNodeReward;
    console.log(`   ✅ 奖励领取交易完成，Claim事件正确触发，领取数量: ${ethers.utils.formatUnits(claimedAmount, 18)} META`);

    // 验证奖励计算精度 (允许小数位差异，因为Solidity整数除法)
    const rewardDifference = expectedUserReward.sub(claimedAmount).abs();
    const toleranceThreshold = ethers.utils.parseUnits("0.01", 18); // 0.01 META的容差
    expect(rewardDifference).to.be.lte(toleranceThreshold);
    console.log(`   ✅ 奖励计算精度验证通过，预期: ${ethers.utils.formatUnits(expectedUserReward, 18)}, 实际: ${ethers.utils.formatUnits(claimedAmount, 18)}, 差异: ${ethers.utils.formatUnits(rewardDifference, 18)} META`);

    // 期望结果：奖励自动计算并正确发放
    console.log("🔍 验证奖励发放结果...");
    const user1MetaBalanceAfter = await metaNodeToken.balanceOf(user1.address);
    const contractMetaBalanceAfter = await metaNodeToken.balanceOf(metaNodeStake.address);

    // 验证用户META余额增加
    expect(user1MetaBalanceAfter).to.equal(user1MetaBalanceBefore.add(claimedAmount));
    console.log(`   ✅ User1 META余额正确增加: ${ethers.utils.formatUnits(user1MetaBalanceAfter, 18)} META`);

    // 验证合约META余额减少
    expect(contractMetaBalanceAfter).to.equal(contractMetaBalanceBefore.sub(claimedAmount));
    console.log(`   ✅ 合约 META余额正确减少: ${ethers.utils.formatUnits(contractMetaBalanceAfter, 18)} META`);

    console.log("✅ [TEST 1] 奖励正确累计并发放测试通过\n");
  });

  // 测试用例2：无奖励时领奖被拒绝
  it("should reject claiming when no rewards available", async function () {
    console.log("🧪 [TEST 2] 测试无奖励时领奖被拒绝...");

    // 前置条件：使用一个没有质押的新用户
    console.log("🔍 设置前置条件 - 使用无质押用户...");
    
    const [, , , , user4] = await ethers.getSigners();
    console.log(`   📊 User4: ${user4.address}`);

    // 确认user4没有任何质押
    const user4InfoERC20 = await metaNodeStake.user(1, user4.address);
    const user4InfoETH = await metaNodeStake.user(0, user4.address);
    expect(user4InfoERC20.stAmount).to.equal(0);
    expect(user4InfoETH.stAmount).to.equal(0);
    console.log("   ✅ 确认User4无任何质押");

    // 测试步骤：尝试领取不存在的奖励
    console.log("📄 尝试领取不存在的奖励...");
    const metaNodeStakeAsUser4 = metaNodeStake.connect(user4);

    // 期望结果：操作失败，提示无奖励可领取
    await expect(
      metaNodeStakeAsUser4.claimReward(1)
    ).to.be.revertedWith("no reward to claim");
    console.log("   ✅ 无奖励状态下领奖被正确拒绝");

    console.log("✅ [TEST 2] 无奖励时领奖拒绝测试通过\n");
  });

    // 测试用例3：合约余额不足领奖被拒绝
  it("should reject claiming when contract has insufficient balance", async function () {
    console.log("🧪 [TEST 3] 测试合约余额不足领奖被拒绝...");

    // 前置条件：使用新用户进行质押并产生奖励
    console.log("🔍 设置前置条件...");
    
    const [,,, user3] = await ethers.getSigners();
    console.log(`   📊 User3: ${user3.address}`);

    // 记录合约初始余额
    const initialContractBalance = await metaNodeToken.balanceOf(metaNodeStake.address);
    console.log(`   📊 合约初始余额: ${ethers.utils.formatUnits(initialContractBalance, 18)} META`);

    // 给user3准备ERC20代币和授权
    const user3TokenAmount = ethers.utils.parseUnits("1000", 18);
    await mockERC20Token.transfer(user3.address, user3TokenAmount);
    await mockERC20Token.connect(user3).approve(metaNodeStake.address, user3TokenAmount);
    console.log("   ✅ User3 资产准备完成");

    // user3进行质押
    await metaNodeStake.connect(user3).stakeERC20(1, user3TokenAmount);
    console.log("   ✅ User3 质押完成");

    // 挖矿产生奖励
    for (let i = 0; i < 10; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    console.log("   ✅ 已挖矿10个区块，产生奖励");

    // 使用管理员函数清空合约的META代币余额
    console.log("📄 管理员清空合约余额...");
    const contractBalance = await metaNodeToken.balanceOf(metaNodeStake.address);
    
    // 管理员提取所有MetaNode代币
    const tx = await metaNodeStake.connect(owner).withdrawAllMetaNodeTokens();
    
    // 验证提取事件
    await expect(tx)
      .to.emit(metaNodeStake, "AdminWithdraw")
      .withArgs(owner.address, contractBalance);
    console.log(`   ✅ 管理员已提取所有META代币: ${ethers.utils.formatUnits(contractBalance, 18)} META`);

    // 验证合约余额为0
    const newContractBalance = await metaNodeToken.balanceOf(metaNodeStake.address);
    expect(newContractBalance).to.equal(0);
    console.log(`   ✅ 确认合约余额为0: ${ethers.utils.formatUnits(newContractBalance, 18)} META`);

    // 测试步骤：user3尝试领取奖励
    console.log("📄 测试余额不足时的领奖尝试...");
    const metaNodeStakeAsUser3 = metaNodeStake.connect(user3);

    // 期望结果：因余额不足被拒绝
    await expect(
      metaNodeStakeAsUser3.claimReward(1)
    ).to.be.revertedWith("insufficient reward tokens in contract");
    console.log("   ✅ 余额不足时领奖被正确拒绝");

    console.log("✅ [TEST 3] 合约余额不足领奖拒绝测试通过\n");
  });


  // 测试用例4：暂停领奖功能领奖被拒绝
  it("should reject claiming when claim is paused", async function () {
    console.log("🧪 [TEST 4] 测试暂停领奖功能领奖被拒绝...");

    // 前置条件：确保合约有足够余额并恢复正常状态
    console.log("🔍 设置前置条件 - 恢复合约正常状态...");
    
    // 补充合约META余额
    const transferAmount = ethers.utils.parseUnits("10000", 18);
    await metaNodeToken.transfer(metaNodeStake.address, transferAmount);
    console.log("   ✅ 已补充合约META余额");

    // 挖矿产生奖励
    for (let i = 0; i < 10; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    console.log("   ✅ 已挖矿10个区块，产生奖励");

    // 管理员暂停领奖功能
    await metaNodeStake.pauseClaim(true);
    const claimPaused = await metaNodeStake.claimPaused();
    expect(claimPaused).to.be.true;
    console.log("   ✅ 领奖功能已暂停");

    // 测试步骤：用户尝试领取奖励
    console.log("📄 测试暂停状态下的领奖尝试...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);

    // 期望结果：被暂停拦截
    await expect(
      metaNodeStakeAsUser1.claimReward(1)
    ).to.be.revertedWith("claim is paused");
    console.log("   ✅ 领奖在暂停状态下被正确拒绝");

    // 恢复领奖功能以便后续测试
    console.log("📄 恢复领奖功能...");
    await metaNodeStake.pauseClaim(false);
    const claimPausedAfter = await metaNodeStake.claimPaused();
    expect(claimPausedAfter).to.be.false;
    console.log("   ✅ 领奖功能已恢复");

    // 验证恢复后可以正常领取
    console.log("📄 验证恢复后可以正常领取...");
    const tx = await metaNodeStakeAsUser1.claimReward(1);
    
    // 使用chai的emit断言验证恢复后的领奖功能
    await expect(tx)
      .to.emit(metaNodeStake, "Claim")
      .withArgs(user1.address, 1, (amount) => amount.gt(0));
    console.log("   ✅ 恢复后领奖功能正常");

    console.log("✅ [TEST 4] 暂停领奖功能拒绝测试通过\n");
  });
});
