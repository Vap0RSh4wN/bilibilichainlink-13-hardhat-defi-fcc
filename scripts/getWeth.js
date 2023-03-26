const { getNamedAccounts, ethers, network } = require("hardhat")
const AMOUNT = ethers.utils.parseEther("0.1")

async function getWeth() {
    const { deployer } = await getNamedAccounts()
    // call the "deposit" function on the weth contract
    // abi, contract address, to call any contract
    const iWeth = await ethers.getContractAt(
        "IWeth",

        //对于contract.address，老师直接写了ETH主网的WETH token合约地址
        //为什么呢？
        //Fork the mainnet
        // TradeOffs
        //Pros: Quick,easy， resemble what's on mainnet
        //Cons: We need an API, some contracts are complex to work with
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        //如果testnet就写底下的
        //networkConfig[network.config.chainId].wethToken,

        deployer
    )
    const tx = await iWeth.deposit({ value: AMOUNT })
    await tx.wait(1)
    const wethBalance = await iWeth.balanceOf(deployer)
    console.log(`Got ${wethBalance.toString()} WETH`)
}
module.exports = { getWeth, AMOUNT }
