import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    ganache: {
      // rpc url, change it according to your ganache configuration
      url: 'http://localhost:8545',
      gasPrice: 0,
      // the private key of signers, change it according to your ganache user
      accounts: [
        '0x789c63b4cfb1093632313306b24e089e135a8eaf5994d3fece994ea3eed7e9e1'
      ]
    },
  },
};

export default config;
