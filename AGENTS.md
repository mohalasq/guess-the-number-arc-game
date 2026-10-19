# Guess the Number

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

A "Guess the Number" mini-game on Arc Testnet. The PC picks a secret number 1–100. The player guesses, receiving "Too high" / "Too low" hints until correct. When done, they pay 1 USDC to mint their final score (guess count) permanently onchain. A leaderboard shows the top 10 scores globally.

## Deployed Contracts

| Contract | Network | Address |
|---|---|---|
| GuessTheNumber | Arc Testnet | `0x0ed96fd2e333e4e739fb46e3514d9321505cf057` |

Constructor args: usdcToken=0x3600000000000000000000000000000000000000, entryFee=1000000 (1 USDC), initialOwner=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42, gameServer=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Hardhat test key #0, for demo signing).

Demo game-server private key (Hardhat test #0, well-known public key): 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 — used in GuessGame.tsx to sign scores. In production, replace with a real backend signer.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
