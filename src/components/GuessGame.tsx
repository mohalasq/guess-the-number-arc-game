import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { encodePacked, keccak256 } from 'viem'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, RefreshCw, CheckCircle, Loader2, ArrowRight, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'

// ─── Contract config ─────────────────────────────────────────────────────────
const CHAIN_ID = 5042002 // Arc Testnet

const CONTRACT_ADDRESS = '0x0ed96fd2e333e4e739fb46e3514d9321505cf057' as const

const CONTRACT_ABI = [
  {
    inputs: [
      { name: 'guessCount', type: 'uint256' },
      { name: 'sig', type: 'bytes' },
    ],
    name: 'mintScore',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getLeaderboard',
    outputs: [
      {
        components: [
          { name: 'player', type: 'address' },
          { name: 'guessCount', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'getPlayerBestScore',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'getPlayerNonce',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getEntryFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Demo game-server signer (Hardhat test key #0 — matches gameServer constructor arg)
const DEMO_GAME_SERVER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const gameServerAccount = privateKeyToAccount(DEMO_GAME_SERVER_PK)

// ─── Types ────────────────────────────────────────────────────────────────────
type GameState = 'idle' | 'playing' | 'won' | 'approving' | 'minting' | 'minted'
type HintState = 'none' | 'too-high' | 'too-low' | 'correct'

interface LeaderboardEntry {
  player: string
  guessCount: bigint
  timestamp: bigint
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatTimestamp(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString()
}

const MEDAL_COLORS = ['#f6c843', '#a8b2c1', '#cd7f32']

// Sign the score hash for the contract
async function signScore(
  contractAddress: string,
  playerAddress: string,
  guessCount: bigint,
  nonce: bigint
): Promise<`0x${string}`> {
  const messageHash = keccak256(
    encodePacked(
      ['address', 'address', 'uint256', 'uint256'],
      [contractAddress as `0x${string}`, playerAddress as `0x${string}`, guessCount, nonce]
    )
  )
  return gameServerAccount.signMessage({ message: { raw: messageHash } })
}

function generateSecret(): number {
  return Math.floor(Math.random() * 100) + 1
}

// ─── HintBubble ───────────────────────────────────────────────────────────────
function HintBubble({ hint }: { hint: HintState }) {
  const config: Record<HintState, { text: string; color: string; bg: string }> = {
    none: { text: '', color: '', bg: '' },
    'too-high': { text: 'Too high! Go lower.', color: '#ba2b4c', bg: 'rgba(186,43,76,0.08)' },
    'too-low': { text: 'Too low! Go higher.', color: '#1061a6', bg: 'rgba(16,97,166,0.08)' },
    correct: { text: 'Correct!', color: '#1a8047', bg: 'rgba(26,128,71,0.08)' },
  }
  const c = config[hint]
  if (!c.text) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-xl px-4 py-2 text-sm font-semibold text-center"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}22` }}
    >
      {c.text}
    </motion.div>
  )
}

// ─── Leaderboard panel ────────────────────────────────────────────────────────
function LeaderboardPanel({ onClose }: { onClose: () => void }) {
  const { data: entries } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLeaderboard',
    chainId: CHAIN_ID,
  })

  const board = (entries as LeaderboardEntry[] | undefined) ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="rounded-3xl p-6 space-y-4"
      style={glass.card}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={18} style={{ color: '#f6c843' }} />
          <span className="display font-bold text-base" style={{ color: 'var(--ink)' }}>Leaderboard</span>
        </div>
        <button
          onClick={onClose}
          className="text-xs font-medium px-3 py-1 rounded-full"
          style={{ color: 'var(--muted)', background: 'var(--surface-muted)' }}
        >
          Close
        </button>
      </div>

      {board.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--subtle)' }}>
          <Trophy size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No scores yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {board.map((entry, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={glass.inner}
            >
              <div className="flex items-center gap-3">
                <span
                  className="display font-bold text-base w-6 text-center"
                  style={{ color: MEDAL_COLORS[i] ?? 'var(--subtle)' }}
                >
                  {i + 1}
                </span>
                <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                  {formatAddress(entry.player)}
                </span>
              </div>
              <div className="text-right">
                <span className="display font-bold text-base tabular-nums" style={{ color: 'var(--ink)' }}>
                  {entry.guessCount.toString()}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>guesses</span>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>{formatTimestamp(entry.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Main game component ──────────────────────────────────────────────────────
export function GuessGame() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [gameState, setGameState] = useState<GameState>('idle')
  const [secret, setSecret] = useState<number>(0)
  const [guess, setGuess] = useState('')
  const [hint, setHint] = useState<HintState>('none')
  const [guessCount, setGuessCount] = useState(0)
  const [finalGuessCount, setFinalGuessCount] = useState(0)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Pending mint args stored for after-approve step
  const pendingMintRef = useRef<{ count: bigint; sig: `0x${string}` } | null>(null)

  const isWrongChain = isConnected && chainId !== CHAIN_ID

  const usdcFact = getUsdc(CHAIN_ID)!
  const USDC_ADDRESS = usdcFact.address as `0x${string}`

  const { data: playerNonce, refetch: refetchNonce } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerNonce',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { data: bestScore, refetch: refetchBestScore } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerBestScore',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  // Approve USDC write
  const {
    writeContract: approveUsdc,
    data: approveHash,
    isPending: isApprovePending,
    reset: resetApprove,
  } = useWriteContract()

  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Mint score write
  const {
    writeContract: doMintScore,
    data: mintHash,
    isPending: isMintPending,
    reset: resetMint,
  } = useWriteContract()

  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({ hash: mintHash })

  // After approve confirms → submit mint
  useEffect(() => {
    if (!isApproveSuccess || gameState !== 'approving' || !pendingMintRef.current) return
    const { count, sig } = pendingMintRef.current
    toast.success('USDC approved. Minting your score...')
    doMintScore({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'mintScore',
      args: [count, sig],
      chainId: CHAIN_ID,
    })
    setGameState('minting')
  }, [isApproveSuccess, gameState, doMintScore])

  // After mint confirms — defer setState out of the synchronous effect flush
  useEffect(() => {
    if (!isMintSuccess || gameState !== 'minting') return
    const t = setTimeout(() => {
      setGameState('minted')
      void refetchBestScore()
      toast.success('Score minted on Arc!')
    }, 0)
    return () => clearTimeout(t)
  }, [isMintSuccess, gameState, refetchBestScore])

  const startGame = useCallback(() => {
    setSecret(generateSecret())
    setGuess('')
    setHint('none')
    setGuessCount(0)
    setGameState('playing')
    pendingMintRef.current = null
    resetApprove()
    resetMint()
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [resetApprove, resetMint])

  const submitGuess = useCallback(() => {
    const n = parseInt(guess, 10)
    if (isNaN(n) || n < 1 || n > 100) {
      toast.error('Enter a number between 1 and 100')
      return
    }
    const newCount = guessCount + 1
    setGuessCount(newCount)
    setGuess('')

    if (n === secret) {
      setHint('correct')
      setFinalGuessCount(newCount)
      setGameState('won')
    } else if (n > secret) {
      setHint('too-high')
    } else {
      setHint('too-low')
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [guess, guessCount, secret])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitGuess()
  }

  const handleMintScore = useCallback(() => {
    if (!address) return
    if (isWrongChain) {
      switchChain({ chainId: CHAIN_ID })
      return
    }
    const count = BigInt(finalGuessCount)
    const nonce = playerNonce ?? 0n

    void (async () => {
      await refetchNonce()
      try {
        const sig = await signScore(CONTRACT_ADDRESS, address, count, nonce)
        pendingMintRef.current = { count, sig }
        setGameState('approving')
        approveUsdc({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [CONTRACT_ADDRESS, 1_000_000n],
          chainId: CHAIN_ID,
        })
      } catch {
        toast.error('Failed to sign score. Please try again.')
      }
    })()
  }, [address, isWrongChain, finalGuessCount, playerNonce, refetchNonce, approveUsdc, USDC_ADDRESS, switchChain])

  const chain = requireChain(CHAIN_ID)
  const maxGuessesForRing = 20
  const ringPercent = ['playing', 'won', 'minted', 'approving', 'minting'].includes(gameState)
    ? Math.min((guessCount / maxGuessesForRing) * 100, 100)
    : 0

  const playerBest = bestScore ? Number(bestScore) : null

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '6%', left: '3%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.20) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.18) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Guess the Number
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>1–100 · Arc Testnet</p>
          </div>
          <ConnectKitButton />
        </header>

        {/* Wrong chain banner */}
        <AnimatePresence>
          {isWrongChain && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between"
              style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)', color: '#ba2b4c' }}
            >
              <span>Switch to Arc Testnet to play</span>
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="font-semibold underline underline-offset-2"
              >
                Switch
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main game card */}
        <AnimatePresence mode="wait">
          {gameState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="rounded-3xl p-8 text-center space-y-6 relative overflow-hidden"
              style={glass.card}
            >
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />

              <div className="pt-2">
                <div className="display font-bold text-5xl mb-2" style={{ color: 'var(--ink)' }}>?</div>
                <h2 className="display font-bold text-2xl" style={{ color: 'var(--ink)' }}>
                  Guess My Number
                </h2>
                <p className="text-sm mt-2 text-balance" style={{ color: 'var(--muted)' }}>
                  I've picked a secret number between 1 and 100. Guess it in as few tries as possible, then mint your score on Arc for 1 USDC.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl px-4 py-3 text-sm space-y-1" style={glass.inner}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Entry fee</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>1 USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Network</span>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>Arc Testnet</span>
                  </div>
                  {playerBest !== null && playerBest > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--muted)' }}>Your best</span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--success)' }}>{playerBest} guesses</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={startGame}
                  disabled={!isConnected}
                  className="w-full rounded-2xl py-4 font-bold text-base transition-all"
                  style={{
                    background: isConnected ? 'var(--accent)' : 'var(--surface-muted)',
                    color: isConnected ? 'white' : 'var(--subtle)',
                    cursor: isConnected ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isConnected ? 'Start Game' : 'Connect Wallet to Play'}
                </button>

                <button
                  onClick={() => setShowLeaderboard(v => !v)}
                  className="w-full rounded-2xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                >
                  <Trophy size={15} />
                  View Leaderboard
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="rounded-3xl p-6 space-y-5"
              style={glass.card}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>GUESSES</span>
                <span className="display font-bold text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
                  {guessCount}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4)', width: `${ringPercent}%` }}
                  animate={{ width: `${ringPercent}%` }}
                  transition={{ type: 'spring', stiffness: 200 }}
                />
              </div>

              <div className="text-center">
                <p className="display font-bold text-lg" style={{ color: 'var(--ink)' }}>
                  What's my number?
                </p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Pick between 1 and 100</p>
              </div>

              <AnimatePresence>
                <HintBubble hint={hint} />
              </AnimatePresence>

              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="number"
                  min={1}
                  max={100}
                  value={guess}
                  onChange={e => setGuess(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="1 – 100"
                  className="flex-1 rounded-2xl px-4 py-4 display font-bold text-center outline-none tabular-nums"
                  style={{
                    ...glass.inner,
                    color: 'var(--ink)',
                    fontSize: '1.75rem',
                  }}
                />
                <button
                  onClick={submitGuess}
                  disabled={!guess}
                  className="rounded-2xl px-5 flex items-center justify-center transition-all"
                  style={{
                    background: guess ? 'var(--accent)' : 'var(--surface-muted)',
                    color: guess ? 'white' : 'var(--subtle)',
                    minWidth: 56,
                    cursor: guess ? 'pointer' : 'not-allowed',
                  }}
                >
                  <ArrowRight size={22} />
                </button>
              </div>
            </motion.div>
          )}

          {(gameState === 'won' || gameState === 'approving' || gameState === 'minting' || gameState === 'minted') && (
            <motion.div
              key="won"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="rounded-3xl p-6 space-y-5 relative overflow-hidden"
              style={glass.card}
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />

              <div className="text-center pt-2 space-y-1">
                <div className="display font-bold text-5xl tabular-nums" style={{ color: 'var(--ink)' }}>
                  {finalGuessCount}
                </div>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {gameState === 'minted' ? 'Score minted!' : 'You got it!'}
                </p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {gameState === 'minted'
                    ? 'Your score is now permanently on Arc.'
                    : `The number was ${secret}. Mint your score of ${finalGuessCount} guess${finalGuessCount !== 1 ? 'es' : ''} onchain for 1 USDC.`}
                </p>
              </div>

              <div className="rounded-2xl px-4 py-3 text-sm flex justify-between items-center" style={glass.inner}>
                <span style={{ color: 'var(--muted)' }}>Rating</span>
                <span
                  className="font-semibold"
                  style={{
                    color: finalGuessCount <= 5 ? 'var(--success)' : finalGuessCount <= 10 ? '#1061a6' : 'var(--muted)',
                  }}
                >
                  {finalGuessCount <= 5 ? 'Excellent' : finalGuessCount <= 10 ? 'Good' : finalGuessCount <= 20 ? 'Average' : 'Keep practicing'}
                </span>
              </div>

              {gameState === 'won' && (
                <div className="space-y-3">
                  <button
                    onClick={handleMintScore}
                    className="w-full rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'var(--accent)', color: 'white', cursor: 'pointer' }}
                  >
                    <Hash size={18} />
                    Mint Score · 1 USDC
                  </button>
                  <button
                    onClick={startGame}
                    className="w-full rounded-2xl py-3 font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                  >
                    <RefreshCw size={14} />
                    Play Again (no mint)
                  </button>
                </div>
              )}

              {gameState === 'approving' && (
                <div className="space-y-2">
                  <div
                    className="rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: 'rgba(16,97,166,0.06)', border: '1px solid rgba(16,97,166,0.12)' }}
                  >
                    {isApprovePending ? (
                      <Loader2 size={16} className="animate-spin" style={{ color: '#1061a6' }} />
                    ) : (
                      <CheckCircle size={16} style={{ color: '#1a8047' }} />
                    )}
                    <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                      {isApprovePending ? 'Confirm USDC approval in wallet…' : 'Waiting for approval…'}
                    </span>
                  </div>
                  {approveHash && (
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, approveHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-center underline underline-offset-2"
                      style={{ color: 'var(--muted)' }}
                    >
                      View approve tx
                    </a>
                  )}
                </div>
              )}

              {gameState === 'minting' && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.12)' }}>
                  {(isMintPending || isMintConfirming) && (
                    <Loader2 size={16} className="animate-spin" style={{ color: '#1a8047' }} />
                  )}
                  <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                    {isMintPending ? 'Confirm mint in wallet…' : 'Minting score onchain…'}
                  </span>
                </div>
              )}

              {gameState === 'minted' && (
                <div className="space-y-3">
                  {mintHash && (
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, mintHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-2xl px-4 py-3 text-sm font-medium text-center"
                      style={{ background: 'rgba(26,128,71,0.07)', color: '#1a8047', border: '1px solid rgba(26,128,71,0.15)' }}
                    >
                      View score on explorer
                    </a>
                  )}
                  <button
                    onClick={startGame}
                    className="w-full rounded-2xl py-3 font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    <RefreshCw size={14} />
                    Play Again
                  </button>
                  <button
                    onClick={() => setShowLeaderboard(true)}
                    className="w-full rounded-2xl py-3 font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                  >
                    <Trophy size={14} />
                    See Leaderboard
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLeaderboard && (
            <motion.div className="mt-4">
              <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {gameState === 'idle' && (
          <p className="mt-6 text-center text-xs" style={{ color: 'var(--subtle)' }}>
            Powered by{' '}
            <a
              href={chain.explorerBase}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Arc Testnet
            </a>
            {' '}· {formatAddress(CONTRACT_ADDRESS)}
          </p>
        )}
      </div>
    </div>
  )
}
