module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying contracts with deployer:", deployer);

  // 部署 MetaNode 代币 (奖励代币)
  const metaNodeToken = await deploy("MetaNode", {
    contract: "MetaNode",
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy", 
      execute: {
        init: {
          methodName: "initialize",
          args: [deployer, deployer] // recipient and initialOwner
        }
      }
    },
    log: true,
  });

  // 部署质押合约 (使用代理模式)
  const metaNodePerBlock = ethers.utils.parseUnits("100", 18); // 每区块100个META奖励

  const metaNodeStake = await deploy("MetaNodeStake", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [
            metaNodeToken.address,
            metaNodePerBlock
          ]
        }
      }
    },
    log: true,
  });

  console.log("MetaNodeStake proxy deployed to:", metaNodeStake.address);
  console.log("MetaNode Token deployed to:", metaNodeToken.address);
  console.log("MetaNode Per Block:", ethers.utils.formatUnits(metaNodePerBlock, 18));

  // 转移一些 MetaNode 代币到质押合约用于奖励分发
  const signer = await ethers.getSigner(deployer);
  const metaNodeContract = await ethers.getContractAt("MetaNode", metaNodeToken.address, signer);
  const rewardAmount = ethers.utils.parseEther("500000"); // 50万个代币用于奖励
  
  await metaNodeContract.transfer(metaNodeStake.address, rewardAmount);
  console.log("Transferred", ethers.utils.formatEther(rewardAmount), "META tokens to staking contract");
};

module.exports.tags = ["MetaNodeStake", "MetaNode"];
module.exports.dependencies = [];
