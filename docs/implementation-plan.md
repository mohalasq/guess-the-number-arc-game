The 1 USDC stays locked inside the contract itself at:

**`0x0ed96fd2e333e4e739fb46e3514d9321505cf057`**

It does not go anywhere automatically. The contract accumulates all entry fees. The only way to move it out is the `withdraw()` function, which is restricted to the **owner** — currently `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (the platform deployer wallet).

So the flow is:
1. Player approves 1 USDC to the contract
2. `mintScore` pulls it in via `safeTransferFrom` — USDC now sits in the contract
3. Only the owner can call `withdraw()` to sweep the full balance to themselves

Since the owner is the platform deployer wallet (not your personal wallet), you can't currently withdraw those funds yourself. If you want to own the USDC, the fix is to redeploy with **your own wallet address** as `initialOwner`. To do that, say "redeploy with my wallet as owner" and switch to **Build mode** — I'll walk you through a self-deploy so you control the deployer wallet end-to-end.
