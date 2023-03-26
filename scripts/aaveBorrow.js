const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { getNamedAccounts, ethers } = require("hardhat")
async function main() {
    await getWeth()
    const { deployer } = await getNamedAccounts()
    //abi , contract address
    const lendingPool = await getLendingPool(deployer)
    console.log(`ILendingPool address ${lendingPool.address}`)

    //接下来我们想deposit，发现ILendingPool里的deposit()最终会call safeTransferFrom()
    //safeTransferFrom() pull our money from our wallet

    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" //WETH contract主网的地址
    //先approve后deposit
    //approve avve to get WETH token
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer) //允许把weth从我们的account中取出来给lendingpool
    //deposit
    console.log("Depositing WETH...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0) //要deposit的address，存多少钱，谁存，0（最后这个参数被取消了，总是设为0）
    console.log("Desposited!")
    // Getting your borrowing stats
    // Borrow里使用函数：getUserAccountData**()** 参考：https://docs.aave.com/developers/v/2.0/the-core-protocol/lendingpool#getuseraccountdata
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)

    //availableBorrowsETH ?? what the conversion rate on DAI is?
    //使用aave的price oracle得到DAI的价格：https://docs.aave.com/developers/v/2.0/the-core-protocol/price-oracle

    // 1. First checking for a price from a Chainlink aggregator.
    //我们想要contracts\interfaces\AggregatorV3Interface.sol中第27行latestRoundData()的answer返回值
    const daiPrice = await getDaiPrice() //返回值是BigNumber类型，我看视频里老师貌似读decimal是11？？？好奇怪，有空再看看
    //convert 我们能借的ETH to 我们能借多少DAI
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber()) //0.95是老师自己定的，借95%而不是100%
    console.log(`You can borrow ${amountDaiToBorrow.toString()} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString()) //这里是把上一行得到DAI的数量的值变成和Wei一样都是ERC20类型的18decimal，能和wei合约正常交互
    console.log(1)
    // 2. lf the price is below or equal to zero, we call our fallback price oracle
    //      In the future, Aave governance mechanisms will manage the selection of sources and the fallback price oracle.

    //Borrow Time！
    const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F" //https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)
    console.log(1)
    await getBorrowUserData(lendingPool, deployer) //这里我们首先会发现 borrow后deposit数量多了，是因为我们得到了deposit interest。
    //并且我们borrow的DAI的数量（当WETHdeposit是0.1时，"The DAI/ETH price is 568957745275118" 是5689.57745275118）是137.7518816658379 DAI
    //borrow后第一行是ETH deposit，第二行写的ETH borrowed，那里的数值就是DAI的数量，就是137.7518816658379 DAI转化成ETH的数量的bignumber形式
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    await getBorrowUserData(lendingPool, deployer)
    //依然有很少的DAI还被borrow，因为我们repay DAI时候还要交利息interest，所以我们可以用uniswap去ETH换点DAI来彻底repay
}

async function repay(amount, daiAddress, lendingPool, account) {
    //首先approve我们的DAI送回Aave
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account) //第三个参数：1表示interestRateMode is stable，2表示variable。第四个参数弃用了，所以都是0
    await borrowTx.wait(1)
    console.log("You've borrowed!")
}

async function getDaiPrice() {
    //https://docs.chain.link/data-feeds/price-feeds/addresses#:~:text=%F0%9F%9F%A2-,DAI%20/%20ETH,-DAI
    const daiEthPriceFeed = await ethers.getContractAt(
        //这里是只读合约，我们并不发送任何tx，所以不用signer
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1] //只返回answer，也就是latestRoundData()的第二个返回值
    console.log(`The DAI/ETH price is ${price.toString()}`)
    return price
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account) // 使用函数：getUserAccountData**()** 参考：https://docs.aave.com/developers/v/2.0/the-core-protocol/lendingpool#getuseraccountdata
    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`)
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`)
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`)
    return { availableBorrowsETH, totalDebtETH }
}

async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account)
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

//getContractAt在hardhat里的接口：
// function getContractAt(name: string, address: string, signer?: ethers.Signer): Promise<ethers.Contract>;
// function getContractAt(abi: any[], address: string, signer?: ethers.Signer): Promise<ethers.Contract>;

async function getLendingPool(account) {
    const lendingPoolAddressProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider", //interface
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    )
    const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool()
    //获取到lendingPool的合约地址了，接下来获得lendingPool合约
    //注意，复制interface后会发现该合约还导入了其他的合约，所以我们要把他们获取到本地
    //yarn add --dev @aave/protocol-v2
    const lendingPool = await ethers.getContractAt(
        "ILendingPool",
        lendingPoolAddress, //.toString()不知道要不要加
        account
    )
    return lendingPool
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
