const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("MetaNodeStake - Pool Management and Configuration", function () {
  let metaNodeStake;
  let metaNodeToken;
  let metaNodeTokenDeployment;
  let mockERC20Token;
  let owner, user1, user2;

  beforeEach(async function () {
    console.log("🚀 [SETUP] 初始化池子管理测试环境...");

    [owner, user1, user2] = await ethers.getSigners();
    console.log(`📝 Owner: ${owner.address}`);

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

    // 5. 验证管理员身份
    console.log("🔍 [STEP 5] 验证管理员身份...");
    const ADMIN_ROLE = await metaNodeStake.ADMIN_ROLE();
    expect(await metaNodeStake.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    console.log("   ✅ Owner 拥有 ADMIN_ROLE");

    console.log("✅ [SETUP] 池子管理测试环境初始化完成\n");

    // 打印质押池子的基本信息
    console.log("📊 [INFO] 当前池子状态:");
    const poolLength = await metaNodeStake.getPoolLength();
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    console.log(`   ✅ 池子数量: ${poolLength}, 总池权重: ${totalPoolWeight}`);
    
    if (poolLength > 0) {
      console.log(`   ✅ 第0个池子存在（通常是ETH池）`);
    } else {
      console.log(`   ✅ 当前无池子存在（这是正常的初始状态）`);
    }

    // 打印质押池 获得的MetaNode 代币奖励总量，使用balanceOf
    const stakingContractBalance = await metaNodeToken.balanceOf(
      metaNodeStake.address
    );
    console.log(
      `   ✅ 质押合约 MetaNode 余额: ${ethers.utils.formatUnits(
        stakingContractBalance,
        18
      )} tokens`
    );
  });

  // 测试用例1：成功添加ETH池为首池
  it("should successfully add ETH pool as first pool", async function () {
    console.log("🧪 [TEST 1] 测试成功添加ETH池为首池...");

    // 前置条件：验证池列表为空
    console.log("🔍 验证前置条件...");
    const poolLength = await metaNodeStake.getPoolLength();
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(poolLength).to.equal(0);
    expect(totalPoolWeight).to.equal(0);
    console.log(`   ✅ 池列表为空，池子数量 = ${poolLength}, totalPoolWeight = ${totalPoolWeight}`);

    // 测试步骤：管理员添加ETH池
    console.log("📄 添加ETH池...");
    const poolWeight = 100;
    const minDepositAmount = ethers.utils.parseUnits("0.01", 18); // 0.01 ETH
    const unstakeLockedBlocks = 100;

    const addPoolTx = await metaNodeStake.addPool(
      ethers.constants.AddressZero, // ETH池地址为0
      poolWeight,
      minDepositAmount,
      unstakeLockedBlocks
    );
    await addPoolTx.wait();
    console.log("   ✅ ETH池添加交易完成");

    // 期望结果：ETH池被正确添加
    console.log("🔍 验证ETH池添加结果...");
    const pool0 = await metaNodeStake.pool(0);
    expect(pool0.stTokenAddress).to.equal(ethers.constants.AddressZero);
    expect(pool0.poolWeight).to.equal(poolWeight);
    expect(pool0.minDepositAmount).to.equal(minDepositAmount);
    expect(pool0.unstakeLockedBlocks).to.equal(unstakeLockedBlocks);
    expect(pool0.stTokenAmount).to.equal(0);
    expect(pool0.accMetaNodePerST).to.equal(0);
    console.log("   ✅ ETH池参数验证通过");

    // 验证总权重更新
    const newTotalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(newTotalPoolWeight).to.equal(poolWeight);
    console.log(`   ✅ 总权重更新正确: ${newTotalPoolWeight}`);

    console.log("✅ [TEST 1] ETH池添加测试通过\n");
  });

  // 测试用例2：非ETH池不能为首池
  it("should reject non-ETH pool as first pool", async function () {
    console.log("🧪 [TEST 2] 测试非ETH池不能为首池...");

    // 前置条件：验证池列表为空
    console.log("🔍 验证前置条件...");
    const poolLength = await metaNodeStake.getPoolLength();
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(poolLength).to.equal(0);
    expect(totalPoolWeight).to.equal(0);
    console.log(`   ✅ 池列表为空，池子数量 = ${poolLength}, totalPoolWeight = ${totalPoolWeight}`);

    // 测试步骤：管理员尝试添加非ETH池
    console.log("📄 尝试添加非ETH池作为首池...");
    await expect(
      metaNodeStake.addPool(
        mockERC20Token.address, // 使用ERC20代币地址
        100,
        ethers.utils.parseUnits("100", 18),
        100
      )
    ).to.be.revertedWith("first pool must be ETH pool");
    console.log("   ✅ 非ETH池首池被正确拒绝");

    // 期望结果：操作被拒绝，池列表仍为空
    console.log("🔍 验证池列表仍为空...");
    const finalPoolLength = await metaNodeStake.getPoolLength();
    const finalTotalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(finalPoolLength).to.equal(0);
    expect(finalTotalPoolWeight).to.equal(0);
    console.log(`   ✅ 池列表保持为空，池子数量 = ${finalPoolLength}`);

    console.log("✅ [TEST 2] 非ETH池首池拒绝测试通过\n");
  });

  // 测试用例3：不可重复添加相同ERC20池
  it("should prevent duplicate ERC20 pools", async function () {
    console.log("🧪 [TEST 3] 测试不可重复添加相同ERC20池...");

    // 前置条件：先添加ETH池，再添加一个ERC20池
    console.log("🔍 设置前置条件...");

    // 添加ETH池
    await metaNodeStake.addPool(
      ethers.constants.AddressZero,
      100,
      ethers.utils.parseUnits("0.01", 18),
      100
    );
    console.log("   ✅ ETH池添加完成");

    // 添加第一个ERC20池
    await metaNodeStake.addPool(
      mockERC20Token.address,
      50,
      ethers.utils.parseUnits("100", 18),
      200
    );
    console.log("   ✅ 第一个ERC20池添加完成");

    // 验证现在有2个池
    const poolLength = await metaNodeStake.getPoolLength();
    expect(poolLength).to.equal(2);
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(totalPoolWeight).to.equal(150); // 100 + 50
    console.log(`   ✅ 池子数量: ${poolLength}, 总权重: ${totalPoolWeight}`);

    // 测试步骤：尝试添加同样的ERC20池
    console.log("📄 尝试添加重复的ERC20池...");
    await expect(
      metaNodeStake.addPool(
        mockERC20Token.address, // 相同的代币地址
        30,
        ethers.utils.parseUnits("200", 18),
        150
      )
    ).to.be.revertedWith("pool already exists for this token");
    console.log("   ✅ 重复ERC20池被正确拒绝");

    // 期望结果：池数量和权重保持不变
    console.log("🔍 验证池数量和权重未变...");
    const finalTotalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(finalTotalPoolWeight).to.equal(150);
    console.log(`   ✅ 总权重保持不变: ${finalTotalPoolWeight}`);

    console.log("✅ [TEST 3] 重复池拒绝测试通过\n");
  });

  // 测试用例4：池参数不合法时被拒绝
  it("should reject pools with invalid parameters", async function () {
    console.log("🧪 [TEST 4] 测试池参数不合法时被拒绝...");

    // 前置条件：先添加ETH池
    console.log("🔍 设置前置条件...");
    await metaNodeStake.addPool(
      ethers.constants.AddressZero,
      100,
      ethers.utils.parseUnits("0.01", 18),
      100
    );
    console.log("   ✅ ETH池添加完成");

    // 部署第二个测试代币
    console.log("📄 部署第二个测试代币...");
    const MockERC20_2 = await ethers.getContractFactory("MockERC20", owner);
    const mockERC20Token2 = await MockERC20_2.deploy(
      "Test Token 2",
      "TEST2",
      ethers.utils.parseUnits("1000000", 18)
    );
    await mockERC20Token2.deployed();
    console.log(`   ✅ 第二个测试代币部署完成: ${mockERC20Token2.address}`);

    // 测试步骤1：池权重为0
    console.log("📄 测试池权重为0...");
    await expect(
      metaNodeStake.addPool(
        mockERC20Token.address,
        0, // 无效的权重
        ethers.utils.parseUnits("100", 18),
        100
      )
    ).to.be.revertedWith("invalid pool weight");
    console.log("   ✅ 权重为0被正确拒绝");

    // 测试步骤2：解锁周期为0
    console.log("📄 测试解锁周期为0...");
    await expect(
      metaNodeStake.addPool(
        mockERC20Token2.address,
        50,
        ethers.utils.parseUnits("100", 18),
        0 // 无效的解锁周期
      )
    ).to.be.revertedWith("invalid unstake locked blocks");
    console.log("   ✅ 解锁周期为0被正确拒绝");

    // 测试步骤3：尝试再次添加ETH池
    console.log("📄 测试再次添加ETH池...");
    await expect(
      metaNodeStake.addPool(
        ethers.constants.AddressZero, // ETH池地址
        50,
        ethers.utils.parseUnits("0.02", 18),
        200
      )
    ).to.be.revertedWith("ERC20 pool token address cannot be zero");
    console.log("   ✅ 重复ETH池被正确拒绝");

    // 期望结果：总权重保持不变
    console.log("🔍 验证池状态未变...");
    const totalPoolWeight = await metaNodeStake.totalPoolWeight();
    expect(totalPoolWeight).to.equal(100); // 只有ETH池的权重
    console.log(`   ✅ 总权重保持不变: ${totalPoolWeight}`);

    console.log("✅ [TEST 4] 无效参数拒绝测试通过\n");
  });
});
