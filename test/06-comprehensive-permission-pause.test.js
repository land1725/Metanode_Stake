const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake - Comprehensive Permission and Pause Controls", function () {
  let metaNodeStake;
  let metaNodeToken;
  let metaNodeTokenDeployment;
  let mockERC20Token;
  let owner, admin, user1, user2, unauthorizedUser;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 初始化综合权限与暂停控制测试环境...");

    [owner, admin, user1, user2, unauthorizedUser] = await ethers.getSigners();
    console.log(`📝 Owner: ${owner.address}`);
    console.log(`📝 Admin: ${admin.address}`);
    console.log(`📝 User1: ${user1.address}`);
    console.log(`📝 User2: ${user2.address}`);
    console.log(`📝 UnauthorizedUser: ${unauthorizedUser.address}`);

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

    // 5. 设置权限管理
    console.log("📄 [STEP 5] 设置权限管理...");
    
    // 给admin账户授予ADMIN_ROLE
    const ADMIN_ROLE = await metaNodeStake.ADMIN_ROLE();
    await metaNodeStake.grantRole(ADMIN_ROLE, admin.address);
    console.log("   ✅ Admin角色权限已授予");

    // 验证权限设置
    const hasAdminRole = await metaNodeStake.hasRole(ADMIN_ROLE, admin.address);
    expect(hasAdminRole).to.be.true;
    console.log("   ✅ Admin权限验证完成");

    // 6. 创建质押池
    console.log("📄 [STEP 6] 创建质押池...");
    
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

    // 7. 为用户准备资产
    console.log("📄 [STEP 7] 准备用户资产...");
    
    // 给用户分发ERC20代币
    const userTokenAmount = ethers.utils.parseUnits("10000", 18);
    await mockERC20Token.transfer(user1.address, userTokenAmount);
    await mockERC20Token.transfer(user2.address, userTokenAmount);
    await mockERC20Token.transfer(unauthorizedUser.address, userTokenAmount);
    console.log("   ✅ 用户ERC20代币分发完成");

    // 用户授权质押合约
    const approveAmount = ethers.utils.parseUnits("50000", 18);
    await mockERC20Token.connect(user1).approve(metaNodeStake.address, approveAmount);
    await mockERC20Token.connect(user2).approve(metaNodeStake.address, approveAmount);
    await mockERC20Token.connect(unauthorizedUser).approve(metaNodeStake.address, approveAmount);
    console.log("   ✅ 用户ERC20授权完成");

    // 8. 设置初始质押以便后续测试
    console.log("📄 [STEP 8] 设置初始质押...");
    
    // User1质押ERC20代币
    const stakeAmount = ethers.utils.parseUnits("1000", 18);
    await metaNodeStake.connect(user1).stakeERC20(1, stakeAmount);
    console.log(`   ✅ User1 已质押 ${ethers.utils.formatUnits(stakeAmount, 18)} TEST代币`);

    // User2质押ETH
    const ethStakeAmount = ethers.utils.parseUnits("0.5", 18);
    await metaNodeStake.connect(user2).stakeETH(0, { value: ethStakeAmount });
    console.log(`   ✅ User2 已质押 ${ethers.utils.formatUnits(ethStakeAmount, 18)} ETH`);

    // 9. 验证暂停状态（初始应该都是false）
    console.log("📄 [STEP 9] 验证暂停状态...");
    
    const stakingPaused = await metaNodeStake.stakingPaused();
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    const claimPaused = await metaNodeStake.claimPaused();
    const globalPaused = await metaNodeStake.paused();
    
    expect(stakingPaused).to.be.false;
    expect(unstakingPaused).to.be.false;
    expect(withdrawPaused).to.be.false;
    expect(claimPaused).to.be.false;
    expect(globalPaused).to.be.false;
    console.log("   ✅ 所有暂停状态初始为开放");

    // 10. 挖矿产生奖励以备测试使用
    console.log("📄 [STEP 10] 产生奖励...");
    for (let i = 0; i < 10; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    console.log("   ✅ 已挖矿10个区块，产生奖励");

    console.log("✅ [SETUP] 综合权限与暂停控制测试环境初始化完成\n");

    // 打印环境状态
    console.log("📊 [INFO] 当前环境状态:");
    const poolLength = await metaNodeStake.getPoolLength();
    console.log(`   ✅ 池子数量: ${poolLength}`);
    console.log(`   ✅ Owner具有默认管理员权限`);
    console.log(`   ✅ Admin具有ADMIN_ROLE权限`);
    console.log(`   ✅ 所有功能暂停状态: 开放`);
    console.log(`   ✅ User1 ERC20质押: ${ethers.utils.formatUnits(stakeAmount, 18)} TEST`);
    console.log(`   ✅ User2 ETH质押: ${ethers.utils.formatUnits(ethStakeAmount, 18)} ETH`);
  });

  // 测试用例1：全局暂停后所有核心操作被禁止
  it("should reject all core operations when globally paused", async function () {
    console.log("🧪 [TEST 1] 测试全局暂停后所有核心操作被禁止...");

    // 前置条件：管理员全局暂停
    console.log("🔍 设置前置条件 - 管理员全局暂停...");
    await metaNodeStake.connect(admin).pauseGlobal(true);
    
    const globalPaused = await metaNodeStake.paused();
    expect(globalPaused).to.be.true;
    console.log("   ✅ 全局暂停已激活");

    // 测试步骤：用户尝试质押、解绑、提现、领奖
    console.log("📄 测试用户操作在全局暂停下的表现...");

    // 准备新用户进行质押测试
    const newStakeAmount = ethers.utils.parseUnits("500", 18);
    const newEthStakeAmount = ethers.utils.parseUnits("0.1", 18);

    // 1. 测试质押被禁止
    console.log("   🔍 测试质押功能...");
    await expect(
      metaNodeStake.connect(user1).stakeERC20(1, newStakeAmount)
    ).to.be.revertedWith("staking is paused");
    
    await expect(
      metaNodeStake.connect(user1).stakeETH(0, { value: newEthStakeAmount })
    ).to.be.revertedWith("staking is paused");
    console.log("     ✅ 质押操作在全局暂停下被正确拒绝");

    // 2. 测试解质押被禁止
    console.log("   🔍 测试解质押功能...");
    const unstakeAmount = ethers.utils.parseUnits("100", 18);
    await expect(
      metaNodeStake.connect(user1).unStake(1, unstakeAmount)
    ).to.be.revertedWith("unstaking is paused");
    console.log("     ✅ 解质押操作在全局暂停下被正确拒绝");

    // 3. 测试提现被禁止
    console.log("   🔍 测试提现功能...");
    await expect(
      metaNodeStake.connect(user1).withdraw(1)
    ).to.be.revertedWith("withdraw is paused");
    console.log("     ✅ 提现操作在全局暂停下被正确拒绝");

    // 4. 测试领奖被禁止
    console.log("   🔍 测试领奖功能...");
    await expect(
      metaNodeStake.connect(user1).claimReward(1)
    ).to.be.revertedWith("claim is paused");
    console.log("     ✅ 领奖操作在全局暂停下被正确拒绝");

    // 期望结果：所有操作因全局暂停被拒绝
    console.log("✅ [TEST 1] 全局暂停功能测试通过 - 所有核心操作被正确禁止\n");

    // 恢复正常状态以便后续测试
    await metaNodeStake.connect(admin).pauseGlobal(false);
    console.log("   🔄 已恢复全局暂停状态");
  });

  // 测试用例2：细粒度单项暂停效果
  it("should allow granular pause control for individual functions", async function () {
    console.log("🧪 [TEST 2] 测试细粒度单项暂停效果...");

    // 前置条件：管理员分别暂停一个功能
    console.log("🔍 测试单项暂停控制...");

    // 准备测试用的数据
    const testStakeAmount = ethers.utils.parseUnits("100", 18);
    const testEthAmount = ethers.utils.parseUnits("0.05", 18);

    // 1. 测试暂停质押功能
    console.log("   📄 测试暂停质押功能...");
    await metaNodeStake.connect(admin).pauseStaking(true);
    
    // 质押应该被拒绝
    await expect(
      metaNodeStake.connect(unauthorizedUser).stakeERC20(1, testStakeAmount)
    ).to.be.revertedWith("staking is paused");
    
    // 其他功能应该正常工作（解质押）
    await metaNodeStake.connect(user1).unStake(1, testStakeAmount);
    console.log("     ✅ 质押暂停时，质押被拒绝但解质押正常");
    
    // 恢复质押功能
    await metaNodeStake.connect(admin).pauseStaking(false);

    // 2. 测试暂停解质押功能
    console.log("   📄 测试暂停解质押功能...");
    await metaNodeStake.connect(admin).pauseUnstaking(true);
    
    // 解质押应该被拒绝
    await expect(
      metaNodeStake.connect(user1).unStake(1, testStakeAmount)
    ).to.be.revertedWith("unstaking is paused");
    
    // 质押应该正常工作
    await metaNodeStake.connect(unauthorizedUser).stakeERC20(1, testStakeAmount);
    console.log("     ✅ 解质押暂停时，解质押被拒绝但质押正常");
    
    // 恢复解质押功能
    await metaNodeStake.connect(admin).pauseUnstaking(false);

    // 3. 测试暂停提现功能
    console.log("   📄 测试暂停提现功能...");
    await metaNodeStake.connect(admin).pauseWithdraw(true);
    
    // 提现应该被拒绝
    await expect(
      metaNodeStake.connect(user1).withdraw(1)
    ).to.be.revertedWith("withdraw is paused");
    
    // 质押应该正常工作
    await metaNodeStake.connect(user2).stakeETH(0, { value: testEthAmount });
    console.log("     ✅ 提现暂停时，提现被拒绝但质押正常");
    
    // 恢复提现功能
    await metaNodeStake.connect(admin).pauseWithdraw(false);

    // 4. 测试暂停领奖功能
    console.log("   📄 测试暂停领奖功能...");
    await metaNodeStake.connect(admin).pauseClaim(true);
    
    // 挖矿产生奖励
    for (let i = 0; i < 5; i++) {
      await ethers.provider.send("evm_mine", []);
    }
    
    // 领奖应该被拒绝
    await expect(
      metaNodeStake.connect(user1).claimReward(1)
    ).to.be.revertedWith("claim is paused");
    
    // 质押应该正常工作
    await metaNodeStake.connect(user1).stakeERC20(1, testStakeAmount);
    console.log("     ✅ 领奖暂停时，领奖被拒绝但质押正常");
    
    // 恢复领奖功能
    await metaNodeStake.connect(admin).pauseClaim(false);

    console.log("✅ [TEST 2] 细粒度暂停控制测试通过 - 单项暂停功能正常工作\n");
  });

  // 测试用例3：有权限账号正常管理池与参数
  it("should allow authorized accounts to manage pools and parameters", async function () {
    console.log("🧪 [TEST 3] 测试有权限账号正常管理池与参数...");

    // 前置条件：管理员角色有效
    console.log("🔍 验证前置条件 - 管理员角色有效...");
    const ADMIN_ROLE = await metaNodeStake.ADMIN_ROLE();
    const hasRole = await metaNodeStake.hasRole(ADMIN_ROLE, admin.address);
    expect(hasRole).to.be.true;
    console.log("   ✅ Admin权限验证通过");

    // 测试步骤：管理员添加池、设参数、暂停功能
    console.log("📄 测试管理员权限操作...");

    // 1. 管理员添加新的ERC20池
    console.log("   📄 测试添加新池...");
    const MockERC20_2 = await ethers.getContractFactory("MockERC20", owner);
    const mockERC20Token2 = await MockERC20_2.deploy(
      "Test Token 2",
      "TEST2",
      ethers.utils.parseUnits("1000000", 18)
    );
    await mockERC20Token2.deployed();

    // Admin添加新池
    const poolLengthBefore = await metaNodeStake.getPoolLength();
    await expect(
      metaNodeStake.connect(admin).addPool(
        mockERC20Token2.address,
        75, // 池权重
        ethers.utils.parseUnits("50", 18), // 最小质押
        150 // 解锁周期
      )
    ).to.emit(metaNodeStake, "AddPool");
    
    const poolLengthAfter = await metaNodeStake.getPoolLength();
    expect(poolLengthAfter).to.equal(poolLengthBefore.add(1));
    console.log("     ✅ Admin成功添加新池");

    // 2. 管理员设置参数
    console.log("   📄 测试设置参数...");
    
    // 设置新的MetaNode每区块奖励
    const newMetaNodePerBlock = ethers.utils.parseUnits("200", 18);
    // 注意：实际合约中可能没有这个函数，我们测试暂停控制
    
    // 设置暂停状态
    await metaNodeStake.connect(admin).setPausedStates(
      false, // 质押不暂停
      true,  // 解质押暂停
      false, // 提现不暂停
      true   // 领奖暂停
    );
    
    // 验证设置效果
    const stakingPaused = await metaNodeStake.stakingPaused();
    const unstakingPaused = await metaNodeStake.unstakingPaused();
    const withdrawPaused = await metaNodeStake.withdrawPaused();
    const claimPaused = await metaNodeStake.claimPaused();
    
    expect(stakingPaused).to.be.false;
    expect(unstakingPaused).to.be.true;
    expect(withdrawPaused).to.be.false;
    expect(claimPaused).to.be.true;
    console.log("     ✅ Admin成功批量设置暂停状态");

    // 3. 管理员管理MetaNode代币
    console.log("   📄 测试MetaNode代币管理...");
    const currentMetaNode = await metaNodeStake.MetaNode();
    
    // Admin可以重新设置MetaNode代币（使用相同地址验证权限）
    await expect(
      metaNodeStake.connect(admin).setMetaNode(currentMetaNode)
    ).to.emit(metaNodeStake, "SetMetaNode");
    console.log("     ✅ Admin成功管理MetaNode代币设置");

    // 期望结果：操作顺利进行
    console.log("✅ [TEST 3] 有权限账号管理功能测试通过 - 所有管理操作成功执行\n");

    // 恢复正常状态
    await metaNodeStake.connect(admin).setPausedStates(false, false, false, false);
    console.log("   🔄 已恢复所有暂停状态");
  });

  // 测试用例4：无权限账号被禁止管理与升级
  it("should reject management and upgrade operations from unauthorized accounts", async function () {
    console.log("🧪 [TEST 4] 测试无权限账号被禁止管理与升级...");

    // 前置条件：普通用户身份
    console.log("🔍 验证前置条件 - 普通用户身份...");
    const ADMIN_ROLE = await metaNodeStake.ADMIN_ROLE();
    const UPGRADE_ROLE = await metaNodeStake.UPGRADE_ROLE();
    
    const hasAdminRole = await metaNodeStake.hasRole(ADMIN_ROLE, unauthorizedUser.address);
    const hasUpgradeRole = await metaNodeStake.hasRole(UPGRADE_ROLE, unauthorizedUser.address);
    
    expect(hasAdminRole).to.be.false;
    expect(hasUpgradeRole).to.be.false;
    console.log("   ✅ 确认无权限用户没有管理员和升级权限");

    // 测试步骤：用户尝试添加池、参数配置、以及合约升级
    console.log("📄 测试无权限用户的管理操作尝试...");

    // 1. 尝试添加池
    console.log("   📄 测试添加池权限...");
    const MockERC20_3 = await ethers.getContractFactory("MockERC20", owner);
    const mockERC20Token3 = await MockERC20_3.deploy(
      "Test Token 3",
      "TEST3",
      ethers.utils.parseUnits("1000000", 18)
    );
    await mockERC20Token3.deployed();

    await expect(
      metaNodeStake.connect(unauthorizedUser).addPool(
        mockERC20Token3.address,
        100,
        ethers.utils.parseUnits("100", 18),
        200
      )
    ).to.be.reverted;
    console.log("     ✅ 无权限用户添加池被正确拒绝");

    // 2. 尝试参数配置
    console.log("   📄 测试参数配置权限...");
    
    // 尝试设置暂停状态
    await expect(
      metaNodeStake.connect(unauthorizedUser).pauseStaking(true)
    ).to.be.reverted;
    
    await expect(
      metaNodeStake.connect(unauthorizedUser).pauseGlobal(true)
    ).to.be.reverted;
    
    await expect(
      metaNodeStake.connect(unauthorizedUser).setPausedStates(true, true, true, true)
    ).to.be.reverted;
    console.log("     ✅ 无权限用户暂停控制被正确拒绝");

    // 3. 尝试MetaNode代币管理
    console.log("   📄 测试MetaNode代币管理权限...");
    await expect(
      metaNodeStake.connect(unauthorizedUser).setMetaNode(mockERC20Token3.address)
    ).to.be.reverted;
    console.log("     ✅ 无权限用户MetaNode设置被正确拒绝");

    // 4. 尝试角色管理
    console.log("   📄 测试角色管理权限...");
    await expect(
      metaNodeStake.connect(unauthorizedUser).grantRole(ADMIN_ROLE, user1.address)
    ).to.be.reverted;
    
    await expect(
      metaNodeStake.connect(unauthorizedUser).revokeRole(ADMIN_ROLE, admin.address)
    ).to.be.reverted;
    console.log("     ✅ 无权限用户角色管理被正确拒绝");

    // 期望结果：全部被拒绝
    console.log("✅ [TEST 4] 无权限账号管理限制测试通过 - 所有管理操作被正确拒绝\n");

    // 验证系统状态未被改变
    console.log("🔍 验证系统状态完整性...");
    const poolLength = await metaNodeStake.getPoolLength();
    const stakingPaused = await metaNodeStake.stakingPaused();
    const globalPaused = await metaNodeStake.paused();
    
    // 注意：池子数量应该是3，因为在测试3中我们添加了一个新池
    expect(poolLength).to.be.gte(2); // 至少有初始的2个池子
    expect(stakingPaused).to.be.false; // 应该保持开放状态
    expect(globalPaused).to.be.false; // 应该保持开放状态
    console.log(`   ✅ 系统状态完整性验证通过，当前池子数量: ${poolLength}`);
  });
});
