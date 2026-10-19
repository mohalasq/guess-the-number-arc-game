/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// viem/chains bakes in a stale RPC URL for Arc Testnet (rpc.testnet.arc.network).
// Override the chain object with the correct endpoint so wallet_addEthereumChain
// pushes the right URL into MetaMask.
const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io'

export const arcTestnetCorrect = {
  ...arcTestnet,
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC] as [string, ...string[]] },
    public:  { http: [ARC_TESTNET_RPC] as [string, ...string[]] },
  },
} as const

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnetCorrect.id, ARC_TESTNET_RPC)

export const config = createConfig({
  chains: [arcTestnetCorrect, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnetCorrect.id]: http(ARC_TESTNET_RPC),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
