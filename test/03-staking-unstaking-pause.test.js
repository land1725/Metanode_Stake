const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake - Staking, Unstaking and Fine-grained Pause Controls", function () {
  let metaNodeStake;
  let metaNodeToken;
  let metaNodeTokenDeployment;
  let mockERC20Token;
  let owner, user1, user2;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 初始化质押解除质押测试环境...");

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

    // 7. 验证暂停状态（应该都是false，即开放状态）
    console.log("📄 [STEP 7] 验证暂停状态...");
    const stakingPaused = await metaNodeStake.stakingPaused();
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    const claimPaused = await metaNodeStake.claimPaused();
    
    expect(stakingPaused).to.be.false;
    expect(unstakingPaused).to.be.false;
    expect(withdrawPaused).to.be.false;
    expect(claimPaused).to.be.false;
    console.log("   ✅ 所有暂停开关初始为开放状态");

    console.log("✅ [SETUP] 质押解除质押测试环境初始化完成\n");

    // 打印当前状态信息
    console.log("📊 [INFO] 当前环境状态:");
    const poolLength = await metaNodeStake.getPoolLength();
    console.log(`   ✅ 池子数量: ${poolLength}`);
    console.log(`   ✅ ETH池最小质押: ${ethers.utils.formatUnits(ethers.utils.parseUnits("0.01", 18), 18)} ETH`);
    console.log(`   ✅ ERC20池最小质押: ${ethers.utils.formatUnits(ethers.utils.parseUnits("100", 18), 18)} TEST`);
    console.log(`   ✅ User1 ETH余额: ${ethers.utils.formatUnits(await ethers.provider.getBalance(user1.address), 18)} ETH`);
    console.log(`   ✅ User1 TEST余额: ${ethers.utils.formatUnits(await mockERC20Token.balanceOf(user1.address), 18)} TEST`);
  });

  // 测试用例1：ERC20质押正常
  it("should successfully stake ERC20 tokens", async function () {
    console.log("🧪 [TEST 1] 测试ERC20质押正常...");

    // 前置条件：用户准备好ERC20授权与余额
    console.log("🔍 验证前置条件...");
    const user1Balance = await mockERC20Token.balanceOf(user1.address);
    const allowance = await mockERC20Token.allowance(user1.address, metaNodeStake.address);
    const stakeAmount = ethers.utils.parseUnits("500", 18); // 质押500个代币，大于最小限额100
    
    expect(user1Balance).to.be.gte(stakeAmount);
    expect(allowance).to.be.gte(stakeAmount);
    console.log(`   ✅ User1 余额充足: ${ethers.utils.formatUnits(user1Balance, 18)} TEST`);
    console.log(`   ✅ 授权充足: ${ethers.utils.formatUnits(allowance, 18)} TEST`);
    console.log(`   ✅ 计划质押: ${ethers.utils.formatUnits(stakeAmount, 18)} TEST (大于最小限额100)`);

    // 记录质押前状态
    const poolInfoBefore = await metaNodeStake.pool(1); // ERC20池ID为1
    const userInfoBefore = await metaNodeStake.user(1, user1.address);
    console.log(`   📊 质押前池总量: ${ethers.utils.formatUnits(poolInfoBefore.stTokenAmount, 18)} TEST`);
    console.log(`   📊 质押前用户质押量: ${ethers.utils.formatUnits(userInfoBefore.stAmount, 18)} TEST`);

    // 测试步骤：调用stakeERC20，大于最小限额
    console.log("📄 执行ERC20质押...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 执行交易并断言事件被触发 (Ethers v5 语法)
    await expect(metaNodeStakeAsUser1.stakeERC20(1, stakeAmount))
      .to.emit(metaNodeStake, "Deposit") // 使用原始合约实例监听事件
      .withArgs(user1.address, 1, stakeAmount); // v5 中直接使用 address 属性
    
    console.log("   ✅ ERC20质押交易完成，Deposit事件正确触发");

    // 期望结果：用户质押余额、总池量正确增加
    console.log("🔍 验证质押结果...");
    const poolInfoAfter = await metaNodeStake.pool(1);
    const userInfoAfter = await metaNodeStake.user(1, user1.address);
    const user1BalanceAfter = await mockERC20Token.balanceOf(user1.address);

    // 验证用户质押余额增加
    expect(userInfoAfter.stAmount).to.equal(userInfoBefore.stAmount.add(stakeAmount));
    console.log(`   ✅ 用户质押量正确增加: ${ethers.utils.formatUnits(userInfoAfter.stAmount, 18)} TEST`);

    // 验证池总量增加
    expect(poolInfoAfter.stTokenAmount).to.equal(poolInfoBefore.stTokenAmount.add(stakeAmount));
    console.log(`   ✅ 池总量正确增加: ${ethers.utils.formatUnits(poolInfoAfter.stTokenAmount, 18)} TEST`);

    // 验证用户代币余额减少
    expect(user1BalanceAfter).to.equal(user1Balance.sub(stakeAmount));
    console.log(`   ✅ 用户代币余额正确减少: ${ethers.utils.formatUnits(user1BalanceAfter, 18)} TEST`);

    console.log("✅ [TEST 1] ERC20质押测试通过\n");
  });

  // 测试用例2：ETH质押正常
  it("should successfully stake ETH", async function () {
    console.log("🧪 [TEST 2] 测试ETH质押正常...");

    // 前置条件：ETH池已存在，用户有ETH
    console.log("🔍 验证前置条件...");
    const user1ETHBalance = await ethers.provider.getBalance(user1.address);
    const stakeAmount = ethers.utils.parseUnits("0.1", 18); // 质押0.1 ETH，大于最小限额0.01 ETH
    
    expect(user1ETHBalance).to.be.gte(stakeAmount);
    console.log(`   ✅ User1 ETH余额充足: ${ethers.utils.formatUnits(user1ETHBalance, 18)} ETH`);
    console.log(`   ✅ 计划质押: ${ethers.utils.formatUnits(stakeAmount, 18)} ETH (大于最小限额0.01)`);

    // 记录质押前状态
    const poolInfoBefore = await metaNodeStake.pool(0); // ETH池ID为0
    const userInfoBefore = await metaNodeStake.user(0, user1.address);
    const contractETHBalanceBefore = await ethers.provider.getBalance(metaNodeStake.address);
    console.log(`   📊 质押前池总量: ${ethers.utils.formatUnits(poolInfoBefore.stTokenAmount, 18)} ETH`);
    console.log(`   📊 质押前用户质押量: ${ethers.utils.formatUnits(userInfoBefore.stAmount, 18)} ETH`);
    console.log(`   📊 质押前合约ETH余额: ${ethers.utils.formatUnits(contractETHBalanceBefore, 18)} ETH`);

    // 测试步骤：发送ETH到质押池
    console.log("📄 执行ETH质押...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 执行交易并断言事件被触发 (Ethers v5 语法)
    await expect(metaNodeStakeAsUser1.stakeETH(0, { value: stakeAmount }))
      .to.emit(metaNodeStake, "Deposit") // 使用原始合约实例监听事件
      .withArgs(user1.address, 0, stakeAmount); // v5 中直接使用 address 属性
    
    console.log("   ✅ ETH质押交易完成，Deposit事件正确触发");

    // 期望结果：用户和池子ETH余额同步增加
    console.log("🔍 验证质押结果...");
    const poolInfoAfter = await metaNodeStake.pool(0);
    const userInfoAfter = await metaNodeStake.user(0, user1.address);
    const contractETHBalanceAfter = await ethers.provider.getBalance(metaNodeStake.address);

    // 验证用户质押余额增加
    expect(userInfoAfter.stAmount).to.equal(userInfoBefore.stAmount + stakeAmount);
    console.log(`   ✅ 用户质押量正确增加: ${ethers.utils.formatUnits(userInfoAfter.stAmount, 18)} ETH`);

    // 验证池总量增加
    expect(poolInfoAfter.stTokenAmount).to.equal(poolInfoBefore.stTokenAmount + stakeAmount);
    console.log(`   ✅ 池总量正确增加: ${ethers.utils.formatUnits(poolInfoAfter.stTokenAmount, 18)} ETH`);

    // 验证合约ETH余额增加
    expect(contractETHBalanceAfter).to.equal(contractETHBalanceBefore + stakeAmount);
    console.log(`   ✅ 合约ETH余额正确增加: ${ethers.utils.formatUnits(contractETHBalanceAfter, 18)} ETH`);

    console.log("✅ [TEST 2] ETH质押测试通过\n");
  });

  // 测试用例3：低于最小限额质押被拒绝
  it("should reject staking below minimum amount", async function () {
    console.log("🧪 [TEST 3] 测试低于最小限额质押被拒绝...");

    // 前置条件：池有最小限额配置
    console.log("🔍 验证前置条件...");
    const ethPool = await metaNodeStake.pool(0);
    const erc20Pool = await metaNodeStake.pool(1);
    console.log(`   ✅ ETH池最小限额: ${ethers.utils.formatUnits(ethPool.minDepositAmount, 18)} ETH`);
    console.log(`   ✅ ERC20池最小限额: ${ethers.utils.formatUnits(erc20Pool.minDepositAmount, 18)} TEST`);

    // 测试步骤：用户质押数量低于限额
    console.log("📄 测试ETH质押低于最小限额...");
    const lowETHAmount = ethers.utils.parseUnits("0.005", 18); // 0.005 ETH < 0.01 ETH
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 期望结果：质押被拒
    await expect(
      metaNodeStakeAsUser1.stakeETH(0, { value: lowETHAmount })
    ).to.be.revertedWith("amount is less than minDepositAmount");
    console.log(`   ✅ ETH低额质押被正确拒绝 (${ethers.utils.formatUnits(lowETHAmount, 18)} ETH)`);

    console.log("📄 测试ERC20质押低于最小限额...");
    const lowERC20Amount = ethers.utils.parseUnits("50", 18); // 50 TEST < 100 TEST
    
    await expect(
      metaNodeStakeAsUser1.stakeERC20(1, lowERC20Amount)
    ).to.be.revertedWith("amount is less than minDepositAmount");
    console.log(`   ✅ ERC20低额质押被正确拒绝 (${ethers.utils.formatUnits(lowERC20Amount, 18)} TEST)`);

    console.log("✅ [TEST 3] 低于最小限额质押拒绝测试通过\n");
  });

  // 测试用例4：暂停质押功能后不能质押
  it("should reject staking when staking is paused", async function () {
    console.log("🧪 [TEST 4] 测试暂停质押功能后不能质押...");

    // 前置条件：管理员暂停质押功能
    console.log("🔍 设置前置条件 - 暂停质押功能...");
    await metaNodeStake.pauseStaking(true);
    const stakingPaused = await metaNodeStake.stakingPaused();
    expect(stakingPaused).to.be.true;
    console.log("   ✅ 质押功能已暂停");

    // 测试步骤：用户尝试ERC20/ETH质押
    console.log("📄 测试暂停状态下的质押尝试...");
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    const stakeAmount = ethers.utils.parseUnits("500", 18);
    const ethStakeAmount = ethers.utils.parseUnits("0.1", 18);

    // 期望结果：均因paused被拒
    console.log("   - 测试ERC20质押被拒绝...");
    await expect(
      metaNodeStakeAsUser1.stakeERC20(1, stakeAmount)
    ).to.be.revertedWith("staking is paused");
    console.log("   ✅ ERC20质押在暂停状态下被正确拒绝");

    console.log("   - 测试ETH质押被拒绝...");
    await expect(
      metaNodeStakeAsUser1.stakeETH(0, { value: ethStakeAmount })
    ).to.be.revertedWith("staking is paused");
    console.log("   ✅ ETH质押在暂停状态下被正确拒绝");

    // 恢复质押功能以便后续测试
    console.log("📄 恢复质押功能...");
    await metaNodeStake.pauseStaking(false);
    const stakingPausedAfter = await metaNodeStake.stakingPaused();
    expect(stakingPausedAfter).to.be.false;
    console.log("   ✅ 质押功能已恢复");

    console.log("✅ [TEST 4] 暂停质押功能测试通过\n");
  });

  // 测试用例5：正常发起解除质押请求
  it("should successfully create unstake request", async function () {
    console.log("🧪 [TEST 5] 测试正常发起解除质押请求...");

    // 前置条件：用户有足够质押
    console.log("🔍 设置前置条件 - 用户先进行质押...");
    const stakeAmount = ethers.utils.parseUnits("1000", 18);
    const metaNodeStakeAsUser1 = metaNodeStake.connect(user1);
    
    // 先质押一些ERC20代币
    await metaNodeStakeAsUser1.stakeERC20(1, stakeAmount);
    console.log(`   ✅ User1 已质押 ${ethers.utils.formatUnits(stakeAmount, 18)} TEST`);

    const userInfoBefore = await metaNodeStake.user(1, user1.address);
    const poolInfoBefore = await metaNodeStake.pool(1);
    console.log(`   📊 质押前用户质押量: ${ethers.utils.formatUnits(userInfoBefore.stAmount, 18)} TEST`);
    console.log(`   📊 质押前池总量: ${ethers.utils.formatUnits(poolInfoBefore.stTokenAmount, 18)} TEST`);

    // 测试步骤：用户请求解除质押
    console.log("📄 执行解除质押请求...");
    const unstakeAmount = ethers.utils.parseUnits("300", 18);
    
    // 执行交易并断言事件被触发 (Ethers v5 语法)
    await expect(metaNodeStakeAsUser1.unStake(1, unstakeAmount))
      .to.emit(metaNodeStake, "RequestUnstake") // 使用原始合约实例监听事件
      .withArgs(user1.address, 1, unstakeAmount); // v5 中直接使用 address 属性
    
    console.log(`   ✅ 解除质押请求完成: ${ethers.utils.formatUnits(unstakeAmount, 18)} TEST，RequestUnstake事件正确触发`);

    // 期望结果：质押余额减少，解除请求被记录
    console.log("🔍 验证解除质押结果...");
    const userInfoAfter = await metaNodeStake.user(1, user1.address);
    const poolInfoAfter = await metaNodeStake.pool(1);

    // 验证用户质押余额减少
    expect(userInfoAfter.stAmount).to.equal(userInfoBefore.stAmount.sub(unstakeAmount));
    console.log(`   ✅ 用户质押量正确减少: ${ethers.utils.formatUnits(userInfoAfter.stAmount, 18)} TEST`);

    // 验证池总量减少
    expect(poolInfoAfter.stTokenAmount).to.equal(poolInfoBefore.stTokenAmount.sub(unstakeAmount));
    console.log(`   ✅ 池总量正确减少: ${ethers.utils.formatUnits(poolInfoAfter.stTokenAmount, 18)} TEST`);

    console.log("✅ [TEST 5] 解除质押请求测试通过\n");
  });

  // 测试用例6：暂停解绑功能后不能解绑
  it("should reject unstaking when unstaking is paused", async function () {
    console.log("🧪 [TEST 6] 测试暂停解绑功能后不能解绑...");

    // 前置条件：用户先质押，然后管理员暂停解绑功能
    console.log("🔍 设置前置条件...");
    const stakeAmount = ethers.utils.parseUnits("500", 18);
    const metaNodeStakeAsUser2 = metaNodeStake.connect(user2);
    
    // 用户先质押
    await metaNodeStakeAsUser2.stakeERC20(1, stakeAmount);
    console.log(`   ✅ User2 已质押 ${ethers.utils.formatUnits(stakeAmount, 18)} TEST`);

    // 管理员暂停解绑功能
    await metaNodeStake.pauseUnstaking(true);
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    expect(unstakingPaused).to.be.true;
    console.log("   ✅ 解绑功能已暂停");

    // 测试步骤：用户尝试解除质押
    console.log("📄 测试暂停状态下的解除质押尝试...");
    const unstakeAmount = ethers.utils.parseUnits("200", 18);

    // 期望结果：操作被拒绝
    await expect(
      metaNodeStakeAsUser2.unStake(1, unstakeAmount)
    ).to.be.revertedWith("unstaking is paused");
    console.log("   ✅ 解除质押在暂停状态下被正确拒绝");

    // 恢复解绑功能以便后续测试
    console.log("📄 恢复解绑功能...");
    await metaNodeStake.pauseUnstaking(false);
    const unstakingPausedAfter = await metaNodeStake.unstakingPaused();
    expect(unstakingPausedAfter).to.be.false;
    console.log("   ✅ 解绑功能已恢复");

    console.log("✅ [TEST 6] 暂停解绑功能测试通过\n");
  });

  // 测试用例7：超额解除质押被拒绝
  it("should reject unstaking more than staked amount", async function () {
    console.log("🧪 [TEST 7] 测试超额解除质押被拒绝...");

    // 前置条件：用户有部分质押
    console.log("🔍 设置前置条件...");
    const stakeAmount = ethers.utils.parseUnits("300", 18);
    const metaNodeStakeAsUser2 = metaNodeStake.connect(user2);
    
    // 用户质押一定数量
    await metaNodeStakeAsUser2.stakeERC20(1, stakeAmount);
    const userInfo = await metaNodeStake.user(1, user2.address);
    console.log(`   ✅ User2 已质押 ${ethers.utils.formatUnits(userInfo.stAmount, 18)} TEST`);

    // 测试步骤：解除多于实际质押
    console.log("📄 尝试解除超过质押数量的代币...");
    const excessiveUnstakeAmount = ethers.utils.parseUnits("500", 18); // 大于质押的300
    console.log(`   📄 尝试解除 ${ethers.utils.formatUnits(excessiveUnstakeAmount, 18)} TEST (大于质押的 ${ethers.utils.formatUnits(userInfo.stAmount, 18)} TEST)`);

    // 期望结果：合约报错
    await expect(
      metaNodeStakeAsUser2.unStake(1, excessiveUnstakeAmount)
    ).to.be.revertedWith("insufficient staked amount");
    console.log("   ✅ 超额解除质押被正确拒绝");

    // 验证用户质押状态未变
    const userInfoAfter = await metaNodeStake.user(1, user2.address);
    expect(userInfoAfter.stAmount).to.equal(userInfo.stAmount);
    console.log(`   ✅ 用户质押状态保持不变: ${ethers.utils.formatUnits(userInfoAfter.stAmount, 18)} TEST`);

    console.log("✅ [TEST 7] 超额解除质押拒绝测试通过\n");
  });
});
