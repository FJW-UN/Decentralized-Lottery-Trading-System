import React, { useState, useEffect } from 'react';
import { ethers, Contract } from 'ethers';
import './App.css';
// 导入ABI文件
import EasyBetArtifact from './contracts/EasyBet.json';
import EasyBetTokenArtifact from './contracts/EasyBetToken.json';

// 获取ABI
const EasyBetABI = EasyBetArtifact.abi;
const EasyBetTokenABI = EasyBetTokenArtifact.abi;

// 从环境变量获取合约地址
const EASYBET_ADDRESS = process.env.REACT_APP_EASYBET_ADDRESS || '';
const EASYBET_TOKEN_ADDRESS = process.env.REACT_APP_EASYBET_TOKEN_ADDRESS || '';

interface Activity {
  id: number;
  creator: string;
  poolAmount: string;
  choices: string[];
  endTime: number;
  result: number;
  isEnded: boolean;
}

interface Order {
  tokenId: number;
  ethPrice: string;
  tokenPrice: string;
}

function App() {
  const [account, setAccount] = useState<string>('');
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [easyBet, setEasyBet] = useState<Contract | null>(null);
  const [easyBetToken, setEasyBetToken] = useState<Contract | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newActivityChoices, setNewActivityChoices] = useState<string>('');
  const [newActivityEndTime, setNewActivityEndTime] = useState<string>('');
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number>(0);
  const [useToken, setUseToken] = useState<boolean>(false);
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [listTokenId, setListTokenId] = useState<string>('');
  const [listPrice, setListPrice] = useState<string>('');
  const [listUseToken, setListUseToken] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // 连接钱包
  const connectWallet = async () => {
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        // 请求账户访问
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts'
        });
        const currentAccount = accounts[0];
        setAccount(currentAccount);

        // 创建 provider
        const web3Provider = new ethers.providers.Web3Provider((window as any).ethereum);
        setProvider(web3Provider);

        // 获取 signer
        const signer = await web3Provider.getSigner();

        // 初始化合约实例
        const easyBetContract = new Contract(EASYBET_ADDRESS, EasyBetABI, signer);
        const easyBetTokenContract = new Contract(EASYBET_TOKEN_ADDRESS, EasyBetTokenABI, signer);
        
        setEasyBet(easyBetContract);
        setEasyBetToken(easyBetTokenContract);

        // 加载余额
        loadBalances(web3Provider, currentAccount, easyBetTokenContract);
        
        // 加载活动列表
        loadActivities(easyBetContract);
        
        // 加载订单列表
        loadOrders(easyBetContract);

      } catch (error) {
        console.error('连接钱包失败:', error);
        setError('连接钱包失败');
      }
    } else {
      setError('请安装 MetaMask!');
    }
  };

  // 加载余额
  const loadBalances = async (provider: ethers.providers.Web3Provider, account: string, tokenContract: Contract) => {
    try {
      // ETH 余额
      const ethBalance = await provider.getBalance(account);
      setEthBalance(ethers.utils.formatEther(ethBalance));

      // 代币余额
      const tokenBalance = await tokenContract.balanceOf(account);
      setTokenBalance(ethers.utils.formatEther(tokenBalance));
    } catch (error) {
      console.error('加载余额失败:', error);
    }
  };

  // 加载活动列表
  const loadActivities = async (contract: Contract) => {
    try {
      const activityCount = await contract.getActivityCount();
      const activitiesList: Activity[] = [];

      for (let i = 0; i < activityCount; i++) {
        const activity = await contract.activities(i);
        activitiesList.push({
          id: i,
          creator: activity.creator,
          poolAmount: ethers.utils.formatEther(activity.poolAmount),
          choices: activity.choices,
          endTime: Number(activity.endTime),
          result: Number(activity.result),
          isEnded: activity.isEnded
        });
      }

      setActivities(activitiesList);
    } catch (error) {
      console.error('加载活动失败:', error);
    }
  };

  // 加载订单列表
  const loadOrders = async (contract: Contract) => {
    try {
      const orderCount = await contract.getOrderCount();
      const ordersList: Order[] = [];

      for (let i = 0; i < orderCount; i++) {
        const order = await contract.orders(i);
        if (!order.isSold) {
          ordersList.push({
            tokenId: Number(order.tokenId),
            ethPrice: ethers.utils.formatEther(order.ethPrice),
            tokenPrice: ethers.utils.formatEther(order.tokenPrice)
          });
        }
      }

      setOrders(ordersList);
    } catch (error) {
      console.error('加载订单失败:', error);
    }
  };

  // 创建活动
  const createActivity = async () => {
    if (!easyBet) {
      setError('合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const choices = newActivityChoices.split(',').map(choice => choice.trim());
      const endTime = Math.floor(new Date(newActivityEndTime).getTime() / 1000);

      if (choices.length < 2) {
        setError('至少需要2个选项');
        setLoading(false);
        return;
      }

      if (endTime <= Date.now() / 1000) {
        setError('结束时间必须大于当前时间');
        setLoading(false);
        return;
      }

      const tx = await easyBet.createActivity(choices, endTime, { 
        value: ethers.utils.parseEther("1") // 1 ETH 奖池
      });
      await tx.wait();
      
      setSuccess('活动创建成功!');
      setNewActivityChoices('');
      setNewActivityEndTime('');
      loadActivities(easyBet);
    } catch (error) {
      console.error('创建活动失败:', error);
      setError('创建活动失败');
    } finally {
      setLoading(false);
    }
  };

  // 购买彩票
  const buyTicket = async (activityId: number, choice: number) => {
    if (!easyBet || !easyBetToken) {
      setError('合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
        if (useToken) {
        // 使用ERC20购买
        const price = ethers.utils.parseEther("0.01");
        if (!easyBetToken) {
          setError('代币合约未连接，无法使用 ERC20 支付。');
          setLoading(false);
          return;
        }

        // 先授权
        const approveTx = await easyBetToken.approve(EASYBET_ADDRESS, price);
        await approveTx.wait();

        // 然后购买
        const tx = await easyBet.buyTicketToken(activityId, choice, price);
        await tx.wait();
      } else {
        // 使用ETH购买
        const tx = await easyBet.buyTicket(activityId, choice, { 
          value: ethers.utils.parseEther("0.01") 
        });
        await tx.wait();
      }
      
      setSuccess('购买成功!');
      loadActivities(easyBet);
      if (provider && account && easyBetToken) {
        loadBalances(provider, account, easyBetToken);
      }
    } catch (error) {
      console.error('购买失败:', error);
      setError('购买失败');
    } finally {
      setLoading(false);
    }
  };

  // 挂牌出售代币
  const listTokenForSale = async () => {
    if (!easyBet) {
      setError('合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const tokenId = parseInt(listTokenId);
      const priceWei = ethers.utils.parseEther(listPrice);
      
      if (listUseToken) {
        const tx = await easyBet.listTokenForSaleToken(tokenId, priceWei);
        await tx.wait();
      } else {
        const tx = await easyBet.listTokenForSaleETH(tokenId, priceWei);
        await tx.wait();
      }
      
      setSuccess('挂牌成功!');
      setListTokenId('');
      setListPrice('');
      loadOrders(easyBet);
    } catch (error) {
      console.error('挂牌失败:', error);
      setError('挂牌失败');
    } finally {
      setLoading(false);
    }
  };

  // 购买挂牌的代币
  const buyListedToken = async (order: Order) => {
    if (!easyBet || !easyBetToken) {
      setError('合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (listUseToken) {
        // 使用ERC20购买
        const price = ethers.utils.parseEther(order.tokenPrice);
        const approveTx = await easyBetToken.approve(EASYBET_ADDRESS, price);
        await approveTx.wait();

        const tx = await easyBet.buyTokenToken(order.tokenId);
        await tx.wait();
      } else {
        const tx = await easyBet.buyTokenETH(order.tokenId, { 
          value: ethers.utils.parseEther(order.ethPrice) 
        });
        await tx.wait();
      }
      
      setSuccess('购买代币成功!');
      loadOrders(easyBet);
      if (provider && account && easyBetToken) {
        loadBalances(provider, account, easyBetToken);
      }
    } catch (error) {
      console.error('购买代币失败:', error);
      setError('购买代币失败');
    } finally {
      setLoading(false);
    }
  };

  // 领取测试代币
  const claimTestTokens = async () => {
    if (!easyBetToken) {
      setError('代币合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const tx = await easyBetToken.mint(account, ethers.utils.parseEther("100"));
      await tx.wait();
      
      setSuccess('领取100 EBT成功!');
      if (provider && account) {
        loadBalances(provider, account, easyBetToken);
      }
    } catch (error) {
      console.error('领取代币失败:', error);
      setError('领取代币失败');
    } finally {
      setLoading(false);
    }
  };

  // 开奖
  const drawResult = async (activityId: number) => {
    if (!easyBet) {
      setError('合约未连接');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const tx = await easyBet.drawResult(activityId);
      await tx.wait();
      
      setSuccess('开奖成功!');
      loadActivities(easyBet);
    } catch (error) {
      console.error('开奖失败:', error);
      setError('开奖失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!EASYBET_ADDRESS || !EASYBET_TOKEN_ADDRESS) {
      setError('请配置合约地址环境变量');
      return;
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>EasyBet - 去中心化博彩平台</h1>
        
        {!account ? (
          <button onClick={connectWallet} className="connect-button">
            连接钱包
          </button>
        ) : (
          <div className="wallet-info">
            <p>已连接: {account.slice(0, 6)}...{account.slice(-4)}</p>
            <p>ETH余额: {ethBalance}</p>
            <p>EBT余额: {tokenBalance}</p>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        {loading && <div className="loading">处理中...</div>}
      </header>

      <main className="App-main">
        {/* 测试代币领取 */}
        {account && (
          <section className="section">
            <h2>领取测试代币</h2>
            <button onClick={claimTestTokens} disabled={loading}>
              领取100 EBT测试代币
            </button>
          </section>
        )}

        {/* 创建活动 */}
        {account && (
          <section className="section">
            <h2>创建新活动</h2>
            <div className="form">
              <input
                type="text"
                placeholder="选项（用逗号分隔，如：选项A,选项B,选项C）"
                value={newActivityChoices}
                onChange={(e) => setNewActivityChoices(e.target.value)}
              />
              <input
                type="datetime-local"
                value={newActivityEndTime}
                onChange={(e) => setNewActivityEndTime(e.target.value)}
              />
              <button onClick={createActivity} disabled={loading}>
                创建活动（投入1 ETH）
              </button>
            </div>
          </section>
        )}

        {/* 活动列表 */}
        <section className="section">
          <h2>进行中的活动</h2>
          <div className="activities">
            {activities.map((activity) => (
              <div key={activity.id} className="activity-card">
                <h3>活动 #{activity.id}</h3>
                <p>创建者: {activity.creator.slice(0, 6)}...{activity.creator.slice(-4)}</p>
                <p>奖池: {activity.poolAmount} ETH</p>
                <p>结束时间: {new Date(activity.endTime * 1000).toLocaleString()}</p>
                
                <div className="choices">
                  {activity.choices.map((choice, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSelectedActivity(activity.id);
                        setSelectedChoice(index);
                      }}
                      className={selectedActivity === activity.id && selectedChoice === index ? 'selected' : ''}
                    >
                      {choice}
                    </button>
                  ))}
                </div>

                {selectedActivity === activity.id && (
                  <div className="buy-section">
                    <label>
                      <input
                        type="checkbox"
                        checked={useToken}
                        onChange={(e) => setUseToken(e.target.checked)}
                      />
                      使用 EBT 代币支付
                    </label>
                    <button 
                      onClick={() => buyTicket(activity.id, selectedChoice)}
                      disabled={loading || activity.isEnded}
                    >
                      购买彩票 (0.01 {useToken ? 'EBT' : 'ETH'})
                    </button>
                  </div>
                )}

                {account === activity.creator && !activity.isEnded && (
                  <button 
                    onClick={() => drawResult(activity.id)}
                    disabled={loading || Date.now() / 1000 < activity.endTime}
                  >
                    开奖
                  </button>
                )}

                {activity.isEnded && (
                  <p>结果: {activity.choices[activity.result]}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 代币交易市场 */}
        {account && (
          <section className="section">
            <h2>代币交易市场</h2>
            
            {/* 挂牌出售 */}
            <div className="form">
              <h3>挂牌出售代币</h3>
              <input
                type="number"
                placeholder="代币ID"
                value={listTokenId}
                onChange={(e) => setListTokenId(e.target.value)}
              />
              <input
                type="text"
                placeholder="价格"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={listUseToken}
                  onChange={(e) => setListUseToken(e.target.checked)}
                />
                接受 EBT 代币支付
              </label>
              <button onClick={listTokenForSale} disabled={loading}>
                挂牌出售
              </button>
            </div>

            {/* 订单列表 */}
            <div className="orders">
              <h3>可购买订单</h3>
              {orders.map((order, index) => (
                <div key={index} className="order-card">
                  <p>代币ID: {order.tokenId}</p>
                  <p>ETH价格: {order.ethPrice} ETH</p>
                  <p>EBT价格: {order.tokenPrice} EBT</p>
                  <button onClick={() => buyListedToken(order)} disabled={loading}>
                    购买
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
