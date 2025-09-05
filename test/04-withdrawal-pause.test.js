const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake - Withdrawal and Fine-grained Pause Controls", function () {
  let metaNodeStake;
  let metaNodeToken;
  let metaNodeTokenDeployment;
  let mockERC20Token;
  let owner, user1, user2;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 初始化提现功能测试环境...");

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
    
    // 添加ETH池 (池ID = 0)，设置较短的解锁周期用于测试
    await metaNodeStake.addPool(
      ethers.constants.AddressZero, // ETH池
      100, // 池权重
      ethers.utils.parseUnits("0.01", 18), // 最小质押 0.01 ETH
      5 // 解锁周期 5 blocks (较短，便于测试)
    );
    console.log("   ✅ ETH池添加完成 (Pool ID: 0, 解锁周期: 5 blocks)");

    // 添加ERC20池 (池ID = 1)，设置较短的解锁周期用于测试
    await metaNodeStake.addPool(
      mockERC20Token.address, // ERC20代币
      50, // 池权重
      ethers.utils.parseUnits("100", 18), // 最小质押 100 tokens
      3 // 解锁周期 3 blocks (更短，便于测试)
    );
    console.log("   ✅ ERC20池添加完成 (Pool ID: 1, 解锁周期: 3 blocks)");

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

    // 7. 创建已质押资产与解除质押请求
    console.log("📄 [STEP 7] 创建已质押资产与解除质押请求...");
    
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    const metaNodeStakeAsUser2 = metaNodeStake.connect(user2);

    // User1在ERC20池进行质押
    const user1StakeAmount = ethers.utils.parseUnits("2000", 18);
    await metaNodeStakeAsUser1.stakeERC20(1, user1StakeAmount);
    console.log(`   ✅ User1 已质押 ${ethers.utils.formatUnits(user1StakeAmount, 18)} TEST到ERC20池`);

    // User2在ETH池进行质押
    const user2StakeAmount = ethers.utils.parseUnits("0.5", 18);
    await metaNodeStakeAsUser2.stakeETH(0, { value: user2StakeAmount });
    console.log(`   ✅ User2 已质押 ${ethers.utils.formatUnits(user2StakeAmount, 18)} ETH到ETH池`);

    // User1发起部分解除质押请求
    const user1UnstakeAmount1 = ethers.utils.parseUnits("500", 18);
    await metaNodeStakeAsUser1.unStake(1, user1UnstakeAmount1);
    console.log(`   ✅ User1 发起第一次解除质押请求: ${ethers.utils.formatUnits(user1UnstakeAmount1, 18)} TEST`);

    const user1UnstakeAmount2 = ethers.utils.parseUnits("300", 18);
    await metaNodeStakeAsUser1.unStake(1, user1UnstakeAmount2);
    console.log(`   ✅ User1 发起第二次解除质押请求: ${ethers.utils.formatUnits(user1UnstakeAmount2, 18)} TEST`);

    // User2发起ETH解除质押请求
    const user2UnstakeAmount = ethers.utils.parseUnits("0.2", 18);
    await metaNodeStakeAsUser2.unStake(0, user2UnstakeAmount);
    console.log(`   ✅ User2 发起解除质押请求: ${ethers.utils.formatUnits(user2UnstakeAmount, 18)} ETH`);

    // 8. 验证暂停状态（应该都是false，即开放状态）
    console.log("📄 [STEP 8] 验证暂停状态...");
    const stakingPaused = await metaNodeStake.stakingPaused();
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    const claimPaused = await metaNodeStake.claimPaused();
    
    expect(stakingPaused).to.be.false;
    expect(unstakingPaused).to.be.false;
    expect(withdrawPaused).to.be.false;
    expect(claimPaused).to.be.false;
    console.log("   ✅ 所有暂停开关初始为开放状态");

    console.log("✅ [SETUP] 提现功能测试环境初始化完成\n");

    // 打印当前状态信息
    console.log("📊 [INFO] 当前环境状态:");
    const poolLength = await metaNodeStake.getPoolLength();
    const currentBlock = await ethers.provider.getBlockNumber();
    console.log(`   ✅ 池子数量: ${poolLength}`);
    console.log(`   ✅ 当前区块: ${currentBlock}`);
    console.log(`   ✅ ETH池解锁周期: 5 blocks`);
    console.log(`   ✅ ERC20池解锁周期: 3 blocks`);
    console.log(`   ✅ User1 剩余质押: ${ethers.utils.formatUnits((await metaNodeStake.user(1, user1.address)).stAmount, 18)} TEST`);
    console.log(`   ✅ User2 剩余质押: ${ethers.utils.formatUnits((await metaNodeStake.user(0, user2.address)).stAmount, 18)} ETH`);
  });

  // 测试用例1：有到期请求时提现成功
  it("should successfully withdraw when requests are matured", async function () {
    console.log("🧪 [TEST 1] 测试有到期请求时提现成功...");

    // 前置条件：等待解除质押请求到期
    console.log("🔍 设置前置条件 - 等待解除质押请求到期...");
    const currentBlock = await ethers.provider.getBlockNumber();
    console.log(`   📊 当前区块: ${currentBlock}`);

    // 挖掘足够的区块使ERC20池的解除质押请求到期 (需要3个区块)
    for (let i = 0; i < 4; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    
    const newBlock = await ethers.provider.getBlockNumber();
    console.log(`   📊 挖掘后区块: ${newBlock}`);
    console.log("   ✅ ERC20池解除质押请求已到期 (3 blocks已过)");

    // 记录提现前状态
    const user1BalanceBefore = await mockERC20Token.balanceOf(user1.address);
    console.log(`   📊 提现前User1 ERC20余额: ${ethers.utils.formatUnits(user1BalanceBefore, 18)} TEST`);

    // 测试步骤：User1执行提现
    console.log("📄 执行提现操作...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 执行交易并断言事件被触发 (Ethers v5 语法)
    const withdrawTx = await metaNodeStakeAsUser1.withdraw(1);
    const receipt = await withdrawTx.wait();
    
    // 验证提现事件 - 应该包含两次解除质押请求的金额
    const expectedWithdrawAmount = ethers.utils.parseUnits("800", 18); // 500 + 300
    await expect(withdrawTx)
      .to.emit(metaNodeStake, "Withdraw")
      .withArgs(user1.address, 1, expectedWithdrawAmount, receipt.blockNumber);
    
    console.log(`   ✅ 提现交易完成，Withdraw事件正确触发，金额: ${ethers.utils.formatUnits(expectedWithdrawAmount, 18)} TEST`);

    // 期望结果：用户收到正确提现金额
    console.log("🔍 验证提现结果...");
    const user1BalanceAfter = await mockERC20Token.balanceOf(user1.address);
    
    // 验证用户代币余额增加
    expect(user1BalanceAfter).to.equal(user1BalanceBefore.add(expectedWithdrawAmount));
    console.log(`   ✅ User1 ERC20余额正确增加: ${ethers.utils.formatUnits(user1BalanceAfter, 18)} TEST`);
    console.log(`   ✅ 增加金额: ${ethers.utils.formatUnits(expectedWithdrawAmount, 18)} TEST`);

    console.log("✅ [TEST 1] 有到期请求时提现成功测试通过\n");
  });

  // 测试用例2：仅未到期不能提现
  it("should reject withdrawal when requests are not matured", async function () {
    console.log("🧪 [TEST 2] 测试仅未到期不能提现...");

    // 前置条件：解除质押请求尚未到期
    console.log("🔍 验证前置条件 - 解除质押请求尚未到期...");
    const currentBlock = await ethers.provider.getBlockNumber();
    console.log(`   📊 当前区块: ${currentBlock}`);
    console.log("   ✅ ETH池解锁周期: 5 blocks，请求尚未到期");

    // 记录提现尝试前的ETH余额
    const user2ETHBalanceBefore = await ethers.provider.getBalance(user2.address);
    console.log(`   📊 提现前User2 ETH余额: ${ethers.utils.formatUnits(user2ETHBalanceBefore, 18)} ETH`);

    // 测试步骤：User2尝试提现ETH（请求未到期）
    console.log("📄 尝试提现未到期的请求...");
    const metaNodeStakeAsUser2 = metaNodeStake.connect(user2);

    // 期望结果：提现失败
    await expect(
      metaNodeStakeAsUser2.withdraw(0)
    ).to.be.revertedWith("no withdrawable amount");
    console.log("   ✅ 未到期提现被正确拒绝");

    // 验证用户ETH余额未变
    const user2ETHBalanceAfter = await ethers.provider.getBalance(user2.address);
    console.log(`   📊 提现后User2 ETH余额: ${ethers.utils.formatUnits(user2ETHBalanceAfter, 18)} ETH`);
    
    // 由于失败的交易仍会消耗gas费，余额会稍微减少，但不应该有大幅变化（超过合理的gas费用）
    const gasCostThreshold = ethers.utils.parseUnits("0.01", 18); // 0.01 ETH作为gas费阈值
    const balanceDiff = user2ETHBalanceBefore.sub(user2ETHBalanceAfter);
    expect(balanceDiff).to.be.lt(gasCostThreshold); // 余额减少应该小于gas费阈值
    expect(balanceDiff).to.be.gte(0); // 余额不应该增加
    console.log(`   ✅ User2 ETH余额仅因gas费稍微减少: ${ethers.utils.formatUnits(balanceDiff, 18)} ETH (在合理范围内)`);

    console.log("✅ [TEST 2] 仅未到期不能提现测试通过\n");
  });

  // 测试用例3：多次请求全部提现后清空状态
  it("should clear all requests after complete withdrawal", async function () {
    console.log("🧪 [TEST 3] 测试多次请求全部提现后清空状态...");

    // 前置条件：创建多条解除质押请求并使其到期
    console.log("🔍 设置前置条件 - 创建多条解除质押请求...");
    
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // User1再发起第三次解除质押请求
    const user1UnstakeAmount3 = ethers.utils.parseUnits("200", 18);
    await metaNodeStakeAsUser1.unStake(1, user1UnstakeAmount3);
    console.log(`   ✅ User1 发起第三次解除质押请求: ${ethers.utils.formatUnits(user1UnstakeAmount3, 18)} TEST`);

    // 等待所有请求到期
    console.log("📄 等待所有解除质押请求到期...");
    for (let i = 0; i < 4; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    console.log("   ✅ 所有ERC20池解除质押请求已到期");

    // 记录提现前状态
    const user1BalanceBefore = await mockERC20Token.balanceOf(user1.address);
    console.log(`   📊 提现前User1 ERC20余额: ${ethers.utils.formatUnits(user1BalanceBefore, 18)} TEST`);

    // 测试步骤：连续提现
    console.log("📄 执行连续提现操作...");
    
    // 第一次提现 - 应该提现所有到期的请求
    const firstWithdrawTx = await metaNodeStakeAsUser1.withdraw(1);
    const firstReceipt = await firstWithdrawTx.wait();
    const expectedFirstWithdrawAmount = ethers.utils.parseUnits("1000", 18); // 500 + 300 + 200
    
    await expect(firstWithdrawTx)
      .to.emit(metaNodeStake, "Withdraw")
      .withArgs(user1.address, 1, expectedFirstWithdrawAmount, firstReceipt.blockNumber);
    
    console.log(`   ✅ 第一次提现完成，金额: ${ethers.utils.formatUnits(expectedFirstWithdrawAmount, 18)} TEST`);

    // 第二次尝试提现 - 应该失败，因为没有更多到期请求
    console.log("📄 尝试第二次提现...");
    await expect(
      metaNodeStakeAsUser1.withdraw(1)
    ).to.be.revertedWith("no withdrawable amount");
    console.log("   ✅ 第二次提现被正确拒绝（无更多到期请求）");

    // 期望结果：队列清空，无剩余请求
    console.log("🔍 验证队列清空状态...");
    const user1BalanceAfter = await mockERC20Token.balanceOf(user1.address);
    
    // 验证总提现金额正确
    expect(user1BalanceAfter).to.equal(user1BalanceBefore.add(expectedFirstWithdrawAmount));
    console.log(`   ✅ User1 ERC20余额正确增加: ${ethers.utils.formatUnits(user1BalanceAfter, 18)} TEST`);
    console.log(`   ✅ 总提现金额: ${ethers.utils.formatUnits(expectedFirstWithdrawAmount, 18)} TEST`);
    console.log("   ✅ 提现队列已清空，无剩余请求");

    console.log("✅ [TEST 3] 多次请求全部提现后清空状态测试通过\n");
  });

  // 测试用例4：暂停提现功能后不能提现
  it("should reject withdrawal when withdrawal is paused", async function () {
    console.log("🧪 [TEST 4] 测试暂停提现功能后不能提现...");

    // 前置条件：等待解除质押请求到期，然后管理员暂停提现功能
    console.log("🔍 设置前置条件 - 等待请求到期并暂停提现功能...");
    
    // 等待解除质押请求到期
    for (let i = 0; i < 4; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    console.log("   ✅ ERC20池解除质押请求已到期");

    // 管理员暂停提现功能
    await metaNodeStake.pauseWithdraw(true);
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    expect(withdrawPaused).to.be.true;
    console.log("   ✅ 提现功能已暂停");

    // 记录提现尝试前的ERC20余额
    const user1BalanceBefore = await mockERC20Token.balanceOf(user1.address);
    console.log(`   📊 提现前User1 ERC20余额: ${ethers.utils.formatUnits(user1BalanceBefore, 18)} TEST`);

    // 测试步骤：用户尝试提现
    console.log("📄 测试暂停状态下的提现尝试...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);

    // 期望结果：提现被拒
    await expect(
      metaNodeStakeAsUser1.withdraw(1)
    ).to.be.revertedWith("withdraw is paused");
    console.log("   ✅ 提现在暂停状态下被正确拒绝");

    // 验证用户余额未变
    const user1BalanceAfter = await mockERC20Token.balanceOf(user1.address);
    console.log(`   📊 提现后User1 ERC20余额: ${ethers.utils.formatUnits(user1BalanceAfter, 18)} TEST`);
    
    // 验证余额确实没有变化（ERC20转账失败不会消耗用户的ERC20代币）
    expect(user1BalanceAfter).to.equal(user1BalanceBefore);
    console.log(`   ✅ User1 ERC20余额确实保持不变: ${ethers.utils.formatUnits(user1BalanceAfter, 18)} TEST`);
    console.log("✅ [TEST 4] 暂停提现功能后不能提现测试通过\n");
  });
});
