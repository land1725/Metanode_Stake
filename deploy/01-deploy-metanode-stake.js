module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying contracts with deployer:", deployer);

  // 部署 MetaNode 代币 (奖励代币)
  const metaNodeToken = await deploy("MetaNodeToken", {
    contract: "MetaNodeToken",
    from: deployer,
    args: [],
    log: true,
  });

  // 部署质押合约 (使用代理模式)
  const startBlock = await ethers.provider.getBlockNumber() ; // 立即开始
  const endBlock = startBlock + 100000; // 持续100000个区块
  const metaNodePerBlock = ethers.utils.parseEther("1"); // 每区块1个META奖励

  const metaNodeStake = await deploy("MetaNodeStake", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [
            metaNodeToken.address,
            startBlock,
            endBlock,
            metaNodePerBlock
          ]
        }
      }
    },
    log: true,
  });

  console.log("MetaNodeStake proxy deployed to:", metaNodeStake.address);
  console.log("MetaNode Token deployed to:", metaNodeToken.address);
  console.log("Start Block:", startBlock);
  console.log("End Block:", endBlock);
  console.log("MetaNode Per Block:", ethers.utils.formatEther(metaNodePerBlock));

  // 转移一些 MetaNode 代币到质押合约用于奖励分发
  const signer = await ethers.getSigner(deployer);
  const metaNodeContract = await ethers.getContractAt("MetaNodeToken", metaNodeToken.address, signer);
  const rewardAmount = ethers.utils.parseEther("500000"); // 50万个代币用于奖励
  
  await metaNodeContract.transfer(metaNodeStake.address, rewardAmount);
  console.log("Transferred", ethers.utils.formatEther(rewardAmount), "META tokens to staking contract");
};

module.exports.tags = ["MetaNodeStake"];
module.exports.dependencies = [];
