const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
const { upgrades } = require("hardhat");

describe("MetaNodeStake", function () {

  // 套件1：合约部署与初始化
  describe("Deployment and Initialization", function () {

    let metaNodeStake, metaNodeToken;
    let metaNodeTokenDeployment, metaNodeStakeDeployment;
    let owner, user1, user2;

    beforeEach(async function () {
      console.log("🚀 [SETUP] 初始化测试环境...");
      
      [owner, user1, user2] = await ethers.getSigners();
      console.log(`📝 Owner: ${owner.address}`);
      
      // 1. 一次性部署所有合约 (确保依赖关系正确)
      console.log("📄 [STEP 1] 部署所有合约...");
      await deployments.fixture(["MetaNode", "MetaNodeStake"]);
      
      // 2. 获取 MetaNode 代币合约
      console.log("📄 [STEP 2] 获取 MetaNode 代币合约...");
      metaNodeTokenDeployment = await deployments.get("MetaNode");
      console.log("MetaNode address:", metaNodeTokenDeployment.address);
      metaNodeToken = await ethers.getContractAt(
        "MetaNode",
        metaNodeTokenDeployment.address,
        owner
      );
      console.log(`✅ MetaNode 代币合约获取完成: ${metaNodeTokenDeployment.address}`);
      
      // 3. 获取 MetaNodeStake 可升级合约
      console.log("📄 [STEP 3] 获取 MetaNodeStake 可升级合约...");
      metaNodeStakeDeployment = await deployments.get("MetaNodeStake_Proxy");
      console.log("MetaNodeStake address:", metaNodeStakeDeployment.address);
      metaNodeStake = await ethers.getContractAt(
        "MetaNodeStake",
        metaNodeStakeDeployment.address,
        owner
      );
      console.log(`✅ MetaNodeStake 合约获取完成: ${metaNodeStakeDeployment.address}`);
      
      // 4. 显示初始化参数信息
      const metaNodePerBlock = ethers.parseUnits("100", 18); // 每块奖励 100 token
      console.log(`📋 [STEP 4] 合约初始化参数:`);
      console.log(`   - MetaNode 地址: ${metaNodeTokenDeployment.address}`);
      console.log(`   - 每块奖励: ${ethers.formatUnits(metaNodePerBlock, 18)} tokens`);
      
      // 5. 验证代理合约地址有效性
      console.log("🔍 [STEP 5] 验证代理合约地址有效性...");
      expect(metaNodeStakeDeployment.address).to.not.equal(ethers.ZeroAddress);
      expect(metaNodeTokenDeployment.address).to.not.equal(ethers.ZeroAddress);
      console.log("✅ 代理合约地址验证通过");
      
      console.log("✅ [SETUP] 测试环境初始化完成\n");
    });

    // 测试用例1：正确初始化参数
    it("should initialize with correct parameters", async function () {
      console.log("🧪 [TEST 1] 测试合约初始化参数...");
      
      // 检查 MetaNode 代币地址是否等于部署时传入地址
      console.log("🔍 检查 MetaNode 代币地址...");
      const contractMetaNodeAddress = await metaNodeStake.MetaNode();
      console.log(`   Contract MetaNode address: ${contractMetaNodeAddress}`);
      console.log(`   Deployed MetaNode address: ${metaNodeTokenDeployment.address}`);
      expect(contractMetaNodeAddress).to.equal(metaNodeTokenDeployment.address);
      console.log(`   ✅ MetaNode 地址匹配: ${contractMetaNodeAddress}`);
      
      // 验证 MetaNodePerBlock 值是否为 100 tokens
      console.log("🔍 检查 MetaNodePerBlock 值...");
      const contractMetaNodePerBlock = await metaNodeStake.MetaNodePerBlock();
      expect(contractMetaNodePerBlock).to.equal(ethers.parseUnits("100", 18));
      console.log(`   ✅ MetaNodePerBlock 值正确: ${ethers.formatUnits(contractMetaNodePerBlock, 18)} tokens`);
      
      // 确认部署者拥有 DEFAULT_ADMIN_ROLE 和 UPGRADE_ROLE
      console.log("🔍 检查角色权限...");
      const DEFAULT_ADMIN_ROLE = await metaNodeStake.DEFAULT_ADMIN_ROLE();
      const UPGRADE_ROLE = await metaNodeStake.UPGRADE_ROLE();
      const ADMIN_ROLE = await metaNodeStake.ADMIN_ROLE();
      
      expect(await metaNodeStake.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await metaNodeStake.hasRole(UPGRADE_ROLE, owner.address)).to.be.true;
      expect(await metaNodeStake.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
      console.log(`   ✅ Owner 拥有所有必要角色`);
      
      console.log("✅ [TEST 1] 合约初始化参数验证通过\n");
    });

    // 测试用例2：非法初始化参数防护
    it("should prevent illegal initialization parameters", async function () {
      console.log("🧪 [TEST 2] 测试非法初始化参数防护...");
      
      const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake", owner);
      
      // 1. 尝试用 address(0) 初始化 MetaNode 代币
      console.log("🔍 测试用 address(0) 初始化 MetaNode 代币...");
      await expect(
        upgrades.deployProxy(
          MetaNodeStake, 
          [ethers.ZeroAddress, ethers.parseUnits("100", 18)], 
          { initializer: 'initialize' }
        )
      ).to.be.revertedWith("invalid MetaNode address");
      console.log("   ✅ address(0) 初始化被正确拒绝");
      
      // 2. 尝试设置 MetaNodePerBlock = 0
      console.log("🔍 测试设置 MetaNodePerBlock = 0...");
      await expect(
        upgrades.deployProxy(
          MetaNodeStake, 
          [metaNodeTokenDeployment.address, 0], 
          { initializer: 'initialize' }
        )
      ).to.be.revertedWith("invalid MetaNodePerBlock");
      console.log("   ✅ MetaNodePerBlock = 0 被正确拒绝");
      
      // 3. 检查合约是否已初始化防止二次初始化
      console.log("🔍 测试防止二次初始化...");
      await expect(
        metaNodeStake.initialize(metaNodeTokenDeployment.address, ethers.parseUnits("100", 18))
      ).to.be.reverted;
      console.log("   ✅ 二次初始化被正确拒绝");
      
      console.log("✅ [TEST 2] 非法初始化参数防护验证通过\n");
    });
  });
});
