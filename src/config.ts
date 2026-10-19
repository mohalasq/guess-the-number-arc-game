/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'

// Use the canonical RPC URL from Arc Studio's registry.
// viem/chains bakes in a stale rpcUrls value (rpc.testnet.arc.network) — override
// the whole chain object so wallet_addEthereumChain pushes the correct URL into
// MetaMask instead of the stale one.
const arcFact = requireChain(arcTestnet.id)
const ARC_TESTNET_RPC = arcFact.rpcUrls[0]

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
