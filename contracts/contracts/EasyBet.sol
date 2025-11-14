// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

// ERC20 Token for Bonus
contract EasyBetToken is ERC20, Ownable {
    constructor() ERC20("EasyBetToken", "EBT") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10 ** decimals()); // Mint initial supply to deployer
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}

// Main Lottery Contract
contract EasyBet is ERC721, Ownable {
    EasyBetToken public betToken; // ERC20 token for payments

    // Activity structure
    struct Activity {
        address creator;
        uint256 poolAmount; // Total prize pool in ETH
        uint256 tokenPoolAmount; // Prize pool in ERC20 tokens
        string[] choices;
        uint256 endTime;
        string result;
        bool isSettled;
        uint256[] tokenIds; // All tokens minted for this activity
        mapping(string => uint256) choiceCount; // Number of tokens per choice
    }

    // Token metadata
    struct TokenInfo {
        uint256 activityId;
        string choice;
        uint256 mintTime;
    }

    // Order book: tokenId => price in ETH
    mapping(uint256 => uint256) public sellOrdersETH;
    // Order book: tokenId => price in ERC20
    mapping(uint256 => uint256) public sellOrdersToken;

    mapping(uint256 => Activity) public activities;
    mapping(uint256 => TokenInfo) public tokenInfo;
    uint256 public activityCount;
    uint256 public tokenCount;

    bool public useToken; // Whether to use ERC20 token for payments

    event ActivityCreated(uint256 activityId, address creator, string[] choices, uint256 endTime);
    event TokenMinted(uint256 tokenId, uint256 activityId, string choice, address owner);
    event TokenSold(uint256 tokenId, address from, address to, uint256 price, bool isToken);
    event ActivitySettled(uint256 activityId, string result);

    constructor(address _tokenAddress) ERC721("EasyBetToken", "EBT") Ownable(msg.sender) {
        betToken = EasyBetToken(_tokenAddress);
        useToken = false; // Default to ETH payments
    }

    // Set payment method
    function setUseToken(bool _useToken) external onlyOwner {
        useToken = _useToken;
    }

    // Create a new activity
    function createActivity(
        string[] memory _choices,
        uint256 _endTime
    ) external payable onlyOwner {
        require(_choices.length >= 2, "At least 2 choices required");
        require(_endTime > block.timestamp, "End time must be in future");

        activityCount++;
        Activity storage newActivity = activities[activityCount];
        newActivity.creator = msg.sender;
        newActivity.poolAmount = msg.value; // ETH prize pool
        newActivity.choices = _choices;
        newActivity.endTime = _endTime;
        newActivity.isSettled = false;

        // Initialize choice counts
        for (uint i = 0; i < _choices.length; i++) {
            newActivity.choiceCount[_choices[i]] = 0;
        }

        emit ActivityCreated(activityCount, msg.sender, _choices, _endTime);
    }

    // Buy a lottery ticket with ETH or ERC20
    function buyTicket(uint256 _activityId, string memory _choice) external payable {
        Activity storage activity = activities[_activityId];
        require(!activity.isSettled, "Activity settled");
        require(block.timestamp < activity.endTime, "Activity ended");
        require(isValidChoice(_activityId, _choice), "Invalid choice");

        uint256 price = useToken ? 0 : 0.01 ether; // Fixed price for ETH
        if (useToken) {
            require(betToken.transferFrom(msg.sender, address(this), 0.01 ether), "Token transfer failed");
        } else {
            require(msg.value == price, "Incorrect ETH sent");
        }

        tokenCount++;
        _mint(msg.sender, tokenCount);
        tokenInfo[tokenCount] = TokenInfo(_activityId, _choice, block.timestamp);
        activity.tokenIds.push(tokenCount);
        activity.choiceCount[_choice]++;

        emit TokenMinted(tokenCount, _activityId, _choice, msg.sender);
    }

    // List a token for sale in ETH
    function listTokenForSaleETH(uint256 _tokenId, uint256 _price) external {
        require(ownerOf(_tokenId) == msg.sender, "Not token owner");
        sellOrdersETH[_tokenId] = _price;
    }

    // List a token for sale in ERC20
    function listTokenForSaleToken(uint256 _tokenId, uint256 _price) external {
        require(ownerOf(_tokenId) == msg.sender, "Not token owner");
        sellOrdersToken[_tokenId] = _price;
    }

    // Buy a listed token with ETH
    function buyTokenETH(uint256 _tokenId) external payable {
        uint256 price = sellOrdersETH[_tokenId];
        require(price > 0, "Token not for sale");
        require(msg.value == price, "Incorrect ETH sent");

        address seller = ownerOf(_tokenId);
        _transfer(seller, msg.sender, _tokenId);
        payable(seller).transfer(price);
        delete sellOrdersETH[_tokenId];

        emit TokenSold(_tokenId, seller, msg.sender, price, false);
    }

    // Buy a listed token with ERC20
    function buyTokenToken(uint256 _tokenId) external {
        uint256 price = sellOrdersToken[_tokenId];
        require(price > 0, "Token not for sale");

        address seller = ownerOf(_tokenId);
        require(betToken.transferFrom(msg.sender, seller, price), "Token transfer failed");
        _transfer(seller, msg.sender, _tokenId);
        delete sellOrdersToken[_tokenId];

        emit TokenSold(_tokenId, seller, msg.sender, price, true);
    }

    // Settle activity and distribute prizes
    function settleActivity(uint256 _activityId, string memory _result) external onlyOwner {
        Activity storage activity = activities[_activityId];
        require(!activity.isSettled, "Already settled");
        require(block.timestamp >= activity.endTime, "Activity not ended");
        require(isValidChoice(_activityId, _result), "Invalid result");

        activity.result = _result;
        activity.isSettled = true;

        uint256 winnerCount = activity.choiceCount[_result];
        if (winnerCount > 0) {
            uint256 share = activity.poolAmount / winnerCount;
            for (uint i = 0; i < activity.tokenIds.length; i++) {
                uint256 tokenId = activity.tokenIds[i];
                if (keccak256(bytes(tokenInfo[tokenId].choice)) == keccak256(bytes(_result))) {
                    address winner = ownerOf(tokenId);
                    payable(winner).transfer(share);
                }
            }
        }

        emit ActivitySettled(_activityId, _result);
    }

    // Check if choice is valid for an activity
    function isValidChoice(uint256 _activityId, string memory _choice) public view returns (bool) {
        Activity storage activity = activities[_activityId];
        for (uint i = 0; i < activity.choices.length; i++) {
            if (keccak256(bytes(activity.choices[i])) == keccak256(bytes(_choice))) {
                return true;
            }
        }
        return false;
    }

    // Get all sell orders for an activity and choice (for order book)
    function getSellOrders(uint256 _activityId, string memory _choice) external view returns (uint256[] memory, uint256[] memory, uint256[] memory) {
        Activity storage activity = activities[_activityId];
        uint256 count = 0;
        for (uint i = 0; i < activity.tokenIds.length; i++) {
            uint256 tokenId = activity.tokenIds[i];
            if (keccak256(bytes(tokenInfo[tokenId].choice)) == keccak256(bytes(_choice))) {
                if (sellOrdersETH[tokenId] > 0 || sellOrdersToken[tokenId] > 0) {
                    count++;
                }
            }
        }

        uint256[] memory tokenIds = new uint256[](count);
        uint256[] memory ethPrices = new uint256[](count);
        uint256[] memory tokenPrices = new uint256[](count);
        uint256 index = 0;

        for (uint i = 0; i < activity.tokenIds.length; i++) {
            uint256 tokenId = activity.tokenIds[i];
            if (keccak256(bytes(tokenInfo[tokenId].choice)) == keccak256(bytes(_choice))) {
                if (sellOrdersETH[tokenId] > 0 || sellOrdersToken[tokenId] > 0) {
                    tokenIds[index] = tokenId;
                    ethPrices[index] = sellOrdersETH[tokenId];
                    tokenPrices[index] = sellOrdersToken[tokenId];
                    index++;
                }
            }
        }
        return (tokenIds, ethPrices, tokenPrices);
    }

    // Withdraw ERC20 tokens from contract (for owner)
    function withdrawTokens(uint256 amount) external onlyOwner {
        betToken.transfer(owner(), amount);
    }
}
