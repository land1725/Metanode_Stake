// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract MetaNodeStake is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using Address for address;
    using Math for uint256;

    // ************************************** INVARIANT **************************************

    bytes32 public constant ADMIN_ROLE = keccak256("admin_role");
    bytes32 public constant UPGRADE_ROLE = keccak256("upgrade_role");

    uint256 public constant ETH_PID = 0;

    // ************************************** DATA STRUCTURE **************************************
    /*
    Basically, any point in time, the amount of MetaNodes entitled to a user but is pending to be distributed is:

    pending MetaNode = (user.stAmount * pool.accMetaNodePerST) - user.finishedMetaNode

    Whenever a user deposits or withdraws staking tokens to a pool. Here's what happens:
    1. The pool's `accMetaNodePerST` (and `lastRewardBlock`) gets updated.
    2. User receives the pending MetaNode sent to his/her address.
    3. User's `stAmount` gets updated.
    4. User's `finishedMetaNode` gets updated.
    */
    struct Pool {
        // Address of staking token
        address stTokenAddress;
        // Weight of pool
        uint256 poolWeight;
        // Last block number that MetaNodes distribution occurs for pool
        uint256 lastRewardBlock;
        // Accumulated MetaNodes per staking token of pool
        uint256 accMetaNodePerST;
        // Staking token amount
        uint256 stTokenAmount;
        // Min staking amount
        uint256 minDepositAmount;
        // Withdraw locked blocks
        uint256 unstakeLockedBlocks;
    }

    struct UnstakeRequest {
        // Request withdraw amount
        uint256 amount;
        // The blocks when the request withdraw amount can be released
        uint256 unlockBlocks;
    }

    struct User {
        // Staking token amount that user provided
        uint256 stAmount;
        // Finished distributed MetaNodes to user
        uint256 finishedMetaNode;
        // Pending to claim MetaNodes
        uint256 pendingMetaNode;
        // Withdraw request list
        UnstakeRequest[] requests;
    }

    // ************************************** STATE VARIABLES **************************************
    // First block that MetaNodeStake will start from
    // uint256 public startBlock;
    // First block that MetaNodeStake will end from
    // uint256 public endBlock;
    // MetaNode token reward per block
    uint256 public MetaNodePerBlock;

    // 细粒度暂停控制
    bool public stakingPaused;     // 暂停质押功能
    bool public unstakingPaused;   // 暂停解除质押功能
    bool public withdrawPaused;    // 暂停提取功能
    bool public claimPaused;       // 暂停领奖功能

    // MetaNode token
    IERC20 public MetaNode;

    // Total pool weight / Sum of all pool weights
    uint256 public totalPoolWeight;
    Pool[] public pool;

    // pool id => user address => user info
    mapping(uint256 => mapping(address => User)) public user;

    // ************************************** EVENT **************************************

    event SetMetaNode(IERC20 indexed MetaNode);

    event SetMetaNodePerBlock(uint256 indexed MetaNodePerBlock);

    event AddPool(
        address indexed stTokenAddress,
        uint256 indexed poolWeight,
        uint256 indexed lastRewardBlock,
        uint256 minDepositAmount,
        uint256 unstakeLockedBlocks
    );

    event UpdatePool(
        uint256 indexed poolId,
        uint256 indexed lastRewardBlock,
        uint256 contractMetaNodeBalance
    );

    event Deposit(address indexed user, uint256 indexed poolId, uint256 amount);

    event RequestUnstake(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );

    event Withdraw(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount,
        uint256 indexed blockNumber
    );

    event Claim(
        address indexed user,
        uint256 indexed poolId,
        uint256 MetaNodeReward
    );

    // 暂停控制事件
    event StakingPaused(bool paused);
    event UnstakingPaused(bool paused);
    event WithdrawPaused(bool paused);
    event ClaimPaused(bool paused);
    event GlobalPaused(bool paused);

    // ************************************** MODIFIER **************************************

    modifier whenStakingNotPaused() {
        require(!stakingPaused && !paused(), "staking is paused");
        _;
    }

    modifier whenUnstakingNotPaused() {
        require(!unstakingPaused && !paused(), "unstaking is paused");
        _;
    }

    modifier whenWithdrawNotPaused() {
        require(!withdrawPaused && !paused(), "withdraw is paused");
        _;
    }

    modifier whenClaimNotPaused() {
        require(!claimPaused && !paused(), "claim is paused");
        _;
    }

    /**
     * @notice Set MetaNode token address. Set basic info when deploying.
     */
    function initialize(
        IERC20 _MetaNode,
        // uint256 _startBlock,
        // uint256 _endBlock,
        uint256 _MetaNodePerBlock
    ) public initializer {
        require(address(_MetaNode) != address(0), "invalid MetaNode address");
        require(_MetaNodePerBlock > 0, "invalid MetaNodePerBlock");

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADE_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        setMetaNode(_MetaNode);
        MetaNodePerBlock = _MetaNodePerBlock;
    }

    /**
     * @notice Constructor that disables initializers for the implementation contract
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal view override onlyRole(UPGRADE_ROLE) {
        // 添加额外的安全检查
        require(newImplementation != address(0), "invalid implementation address");
        require(newImplementation.code.length > 0, "implementation must be a contract");
        
        // 可以添加更多的升级条件检查，比如：
        // - 检查新实现是否符合预期的接口
        // - 检查升级是否在允许的时间窗口内
        // - 检查是否有足够的治理投票支持等
    }

    // setMetaNode
    function setMetaNode(IERC20 _MetaNode) public onlyRole(ADMIN_ROLE) {
        require(address(_MetaNode) != address(0), "invalid MetaNode address");
        MetaNode = _MetaNode;
        emit SetMetaNode(_MetaNode);
    }

    // ************************************** 暂停控制函数 **************************************

    /**
     * @notice 全局暂停/恢复所有操作
     * @param _paused 是否暂停
     */
    function pauseGlobal(bool _paused) external onlyRole(ADMIN_ROLE) {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
        emit GlobalPaused(_paused);
    }

    /**
     * @notice 单独控制质押功能的暂停/恢复
     * @param _paused 是否暂停质押
     */
    function pauseStaking(bool _paused) external onlyRole(ADMIN_ROLE) {
        stakingPaused = _paused;
        emit StakingPaused(_paused);
    }

    /**
     * @notice 单独控制解除质押功能的暂停/恢复
     * @param _paused 是否暂停解除质押
     */
    function pauseUnstaking(bool _paused) external onlyRole(ADMIN_ROLE) {
        unstakingPaused = _paused;
        emit UnstakingPaused(_paused);
    }

    /**
     * @notice 单独控制提取功能的暂停/恢复
     * @param _paused 是否暂停提取
     */
    function pauseWithdraw(bool _paused) external onlyRole(ADMIN_ROLE) {
        withdrawPaused = _paused;
        emit WithdrawPaused(_paused);
    }

    /**
     * @notice 单独控制领奖功能的暂停/恢复
     * @param _paused 是否暂停领奖
     */
    function pauseClaim(bool _paused) external onlyRole(ADMIN_ROLE) {
        claimPaused = _paused;
        emit ClaimPaused(_paused);
    }

    /**
     * @notice 批量设置所有暂停状态
     * @param _stakingPaused 质押暂停状态
     * @param _unstakingPaused 解除质押暂停状态
     * @param _withdrawPaused 提取暂停状态
     * @param _claimPaused 领奖暂停状态
     */
    function setPausedStates(
        bool _stakingPaused,
        bool _unstakingPaused,
        bool _withdrawPaused,
        bool _claimPaused
    ) external onlyRole(ADMIN_ROLE) {
        stakingPaused = _stakingPaused;
        unstakingPaused = _unstakingPaused;
        withdrawPaused = _withdrawPaused;
        claimPaused = _claimPaused;
        
        emit StakingPaused(_stakingPaused);
        emit UnstakingPaused(_unstakingPaused);
        emit WithdrawPaused(_withdrawPaused);
        emit ClaimPaused(_claimPaused);
    }

    // 添加质押池
    function addPool(
        address _stTokenAddress,
        uint256 _poolWeight,
        // uint256 _lastRewardBlock,
        uint256 _minDepositAmount,
        uint256 _unstakeLockedBlocks
    ) external onlyRole(ADMIN_ROLE) {
        require(_poolWeight > 0, "invalid pool weight");
        require(_unstakeLockedBlocks > 0, "invalid unstake locked blocks");
        
        // 严格控制池子类型：ETH池必须且只能是第一个池子
        if (pool.length == 0) {
            // 第一个池子必须是ETH池
            require(_stTokenAddress == address(0), "first pool must be ETH pool");
        } else {
            // 后续池子必须是ERC20池，不能是ETH池
            require(_stTokenAddress != address(0), "ERC20 pool token address cannot be zero");
            
            // 检查是否已经存在相同的代币池
            for (uint256 i = 0; i < pool.length; i++) {
                require(pool[i].stTokenAddress != _stTokenAddress, "pool already exists for this token");
            }
        }
        
        uint256 _lastRewardBlock = block.number;
        pool.push(
            Pool({
                stTokenAddress: _stTokenAddress,
                poolWeight: _poolWeight,
                lastRewardBlock: _lastRewardBlock,
                minDepositAmount: _minDepositAmount,
                unstakeLockedBlocks: _unstakeLockedBlocks,
                accMetaNodePerST: 0,
                stTokenAmount: 0
            })
        );
        totalPoolWeight += _poolWeight;
        emit AddPool(
            _stTokenAddress,
            _poolWeight,
            _lastRewardBlock,
            _minDepositAmount,
            _unstakeLockedBlocks
        );
    }

    /**
     * @notice 获取池子数量
     * @return 池子总数
     */
    function getPoolLength() external view returns (uint256) {
        return pool.length;
    }

    // 更新流动性池信息,主要更新累计每质押代币的MetaNode数量等信息
    function updatePoolInfo(uint256 _pid) public whenNotPaused {
        require(_pid < pool.length, "invalid pid");
        Pool storage poolInfo = pool[_pid];
        
        // 如果当前区块号小于等于上次奖励区块，不需要更新
        if (block.number <= poolInfo.lastRewardBlock) {
            return;
        }
        
        // 计算自上次更新后经过的区块数
        uint256 blocks = block.number - poolInfo.lastRewardBlock;
        
        // 如果池子中有质押代币，则计算并分配奖励
        if (poolInfo.stTokenAmount > 0 && totalPoolWeight > 0) {
            // 计算这个池子在这些区块中应得的总奖励
            uint256 poolReward = (blocks * MetaNodePerBlock * poolInfo.poolWeight) / totalPoolWeight;
            
            // 将奖励按质押代币数量分配，累加到 accMetaNodePerST
            // 注意：这里使用 1 ether 作为精度因子
            poolInfo.accMetaNodePerST += (poolReward * 1 ether) / poolInfo.stTokenAmount;
        }
        
        // 更新最后奖励区块
        poolInfo.lastRewardBlock = block.number;
        
        emit UpdatePool(
            _pid,
            poolInfo.lastRewardBlock,
            MetaNode.balanceOf(address(this))
        );
    }

    // 2.1 质押功能,• 输入参数: 池 ID(_pid)，质押ERC20数量(_amount)。,• 前置条件: 用户已授权足够的代币给合约。,• 后置条件: 用户的质押代币数量增加，池中的总质押代币数量更新。,• 异常处理: 质押数量低于最小质押要求时拒绝交易。,
    function stakeERC20(uint256 _pid, uint256 _amount) external whenStakingNotPaused nonReentrant {
        require(_pid < pool.length, "invalid pid");
        require(_pid != ETH_PID, "use stakeETH for ETH pool");
        require(pool[_pid].stTokenAddress != address(0), "not ERC20 pool");
        require(_amount > 0, "invalid amount");
        require(
            _amount >= pool[_pid].minDepositAmount,
            "amount is less than minDepositAmount"
        );
        // 调用函数，更新池子信息
        updatePoolInfo(_pid);
        // 计算pendingMetaNode
        User storage userInfo = user[_pid][msg.sender];
        Pool storage poolInfo = pool[_pid];
        
        // 计算待领取的奖励（使用正确的精度计算）
        uint256 pendingMetaNode = 0;
        if (userInfo.stAmount > 0) {
            pendingMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether) - userInfo.finishedMetaNode;
        }
        
        if (pendingMetaNode > 0) {
            userInfo.pendingMetaNode += pendingMetaNode;
        }
        
        // 🔧 修复fee-on-transfer问题：记录转账前后的余额变化
        uint256 balanceBefore = IERC20(poolInfo.stTokenAddress).balanceOf(address(this));
        
        // 转账质押代币
        IERC20(poolInfo.stTokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        
        // 计算实际收到的代币数量（处理fee-on-transfer代币）
        uint256 balanceAfter = IERC20(poolInfo.stTokenAddress).balanceOf(address(this));
        uint256 actualAmount = balanceAfter - balanceBefore;
        
        // 确保实际收到的数量不为零
        require(actualAmount > 0, "no tokens received");
        
        // 使用实际收到的数量更新状态
        userInfo.stAmount += actualAmount;
        poolInfo.stTokenAmount += actualAmount;
        // 更新finishedMetaNode（使用正确的精度）
        userInfo.finishedMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether);
        emit Deposit(msg.sender, _pid, actualAmount);
    }

    // 2.1 质押功能,• 输入参数: 池 ID(_pid)，质押ETH数量(_amount)。,后置条件: 用户的质押ETH数量增加，池中的总质押代币数量更新。,• 异常处理: 质押数量低于最小质押要求时拒绝交易。
    function stakeETH(uint256 _pid) external payable whenStakingNotPaused nonReentrant {
        require(msg.value > 0, "invalid ETH amount");
        require(_pid == ETH_PID, "must use ETH_PID for ETH staking");
        require(_pid < pool.length, "invalid pid");
        require(pool[_pid].stTokenAddress == address(0), "not ETH pool");
        require(msg.value >= pool[_pid].minDepositAmount, "amount is less than minDepositAmount");
        
        // 调用函数，更新池子信息
        updatePoolInfo(_pid);
        // 计算pendingMetaNode
        User storage userInfo = user[_pid][msg.sender];
        Pool storage poolInfo = pool[_pid];
        
        // 计算待领取的奖励（使用正确的精度计算）
        uint256 pendingMetaNode = 0;
        if (userInfo.stAmount > 0) {
            pendingMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether) - userInfo.finishedMetaNode;
        }
        
        if (pendingMetaNode > 0) {
            userInfo.pendingMetaNode += pendingMetaNode;
        }
        
        // ETH已经通过msg.value自动转入合约，无需额外操作
        userInfo.stAmount += msg.value;
        poolInfo.stTokenAmount += msg.value;
        // 更新finishedMetaNode（使用正确的精度）
        userInfo.finishedMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether);
        emit Deposit(msg.sender, _pid, msg.value);
    }

    // 2.2 解除质押功能,• 输入参数: 池 ID(_pid)，解除质押数量(_amount)。,• 前置条件: 用户质押的代币数量足够。,• 后置条件: 用户的质押代币数量减少，解除质押请求记录，等待锁定期结束后可提取。,• 异常处理: 如果解除质押数量大于用户质押的数量，交易失败。,
    function unStake(uint256 _pid, uint256 _amount) external whenUnstakingNotPaused {
        require(_amount > 0, "invalid unstake amount");
        require(_pid < pool.length, "invalid pid");
        User storage userInfo = user[_pid][msg.sender];
        Pool storage poolInfo = pool[_pid];
        require(userInfo.stAmount >= _amount, "insufficient staked amount");
        // 调用函数，更新池子信息
        updatePoolInfo(_pid);
        // 计算pendingMetaNode
        uint256 pendingMetaNode = 0;
        if (userInfo.stAmount > 0) {
            pendingMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether) - userInfo.finishedMetaNode;
        }
        
        if (pendingMetaNode > 0) {
            userInfo.pendingMetaNode += pendingMetaNode;
        }
        
        // 更新用户质押数量
        userInfo.stAmount -= _amount;
        poolInfo.stTokenAmount -= _amount;
        // 更新finishedMetaNode（使用正确的精度）
        userInfo.finishedMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether);
        // 添加解除质押请求
        userInfo.requests.push(
            UnstakeRequest({
                amount: _amount,
                unlockBlocks: block.number + poolInfo.unstakeLockedBlocks
            })
        );
        emit RequestUnstake(msg.sender, _pid, _amount);
    }

    // 2.3 遍历用户的解除质押请求，检查是否有请求已到达解锁区块，如果有则处理这些请求，将相应的代币数量转回用户地址。,• 输入参数: 池 ID(_pid)。,• 前置条件: 用户有未处理的解除质押请求。,• 后置条件: 已解锁的解除质押请求被处理，用户收到相应的代币。,• 异常处理: 如果没有任何请求达到解锁区块，交易失败。
    function withdraw(uint256 _pid) external whenWithdrawNotPaused nonReentrant {
        require(_pid < pool.length, "invalid pid");
        User storage userInfo = user[_pid][msg.sender];
        
        uint256 totalWithdrawAmount = 0;
        uint256 i = 0;
        
        // 正确的处理方式：当删除元素时不增加i，确保检查交换过来的新元素
        while (i < userInfo.requests.length) {
            UnstakeRequest storage request = userInfo.requests[i];
            if (block.number >= request.unlockBlocks) {
                totalWithdrawAmount += request.amount;
                // Remove the processed request by swapping with the last and popping
                userInfo.requests[i] = userInfo.requests[userInfo.requests.length - 1];
                userInfo.requests.pop();
                // 注意：这里不增加i，因为我们需要检查交换过来的新元素
            } else {
                // 只有当前元素不能提取时，才移动到下一个元素
                i++;
            }
        }
        
        require(totalWithdrawAmount > 0, "no withdrawable amount");
        
        // 先更新状态再进行外部调用（CEI模式：Checks-Effects-Interactions）
        
        // 如果是ETH质押池，转ETH
        if (pool[_pid].stTokenAddress == address(0)) {
            // 使用更安全的ETH转账方式
            (bool success, ) = payable(msg.sender).call{value: totalWithdrawAmount}("");
            require(success, "ETH transfer failed");
        } else {
            // 转ERC20代币
            IERC20(pool[_pid].stTokenAddress).safeTransfer(
                msg.sender,
                totalWithdrawAmount
            );
        }
        emit Withdraw(msg.sender, _pid, totalWithdrawAmount, block.number);
    }
    // 2.3 领取奖励,• 输入参数: 池 ID(_pid)。,• 前置条件: 有可领取的奖励。,• 后置条件: 用户领取其奖励，清除已领取的奖励记录。,• 异常处理: 如果没有可领取的奖励，不执行任何操作。
    function claimReward(uint256 _pid) external whenClaimNotPaused nonReentrant {
        require(_pid < pool.length, "invalid pid");
        User storage userInfo = user[_pid][msg.sender];
        // 先更新池子信息以获取最新的奖励
        updatePoolInfo(_pid);
        
        // 计算总的待领取奖励
        Pool storage poolInfo = pool[_pid];
        uint256 pendingMetaNode = 0;
        if (userInfo.stAmount > 0) {
            pendingMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether) - userInfo.finishedMetaNode;
        }
        
        // 计算总奖励（包括之前累积的和新计算的）
        uint256 totalReward = userInfo.pendingMetaNode + pendingMetaNode;
        require(totalReward > 0, "no reward to claim");
        
        // 更新用户状态
        userInfo.pendingMetaNode = 0;
        userInfo.finishedMetaNode = (userInfo.stAmount * poolInfo.accMetaNodePerST) / (1 ether);
        
        // 转账MetaNode奖励 - 检查余额以防MetaNode代币也是fee-on-transfer
        uint256 contractBalance = MetaNode.balanceOf(address(this));
        require(contractBalance >= totalReward, "insufficient reward tokens in contract");
        
        MetaNode.safeTransfer(msg.sender, totalReward);
        emit Claim(msg.sender, _pid, totalReward);
    }

    // ************************************** RECEIVE ETH **************************************
    
    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        // 合约可以接收ETH，但不执行任何特殊逻辑
        // ETH的处理逻辑在stakeETH函数中
    }

}
