# Iceberg - DeFi Risk Analysis

> **The risk beneath your yield.**

Iceberg is an automated due diligence tool for DeFi positions. Paste a transaction hash, get a structured breakdown of smart contract risk, protocol controls, and yield exposure in plain English - in seconds.

![Iceberg Landing Page](./public/screenshots/landing.png)

---

## What It Does

Most people in DeFi chase APY without knowing what they're actually putting their money into. Iceberg tears apart every contract involved in a transaction and tells you exactly what could go wrong - in language anyone can understand.

Think of it as a Bloomberg terminal for yield risk, except it works on-chain and does an hour of manual research for you in 30 seconds.

![Risk Report](./public/screenshots/report.png)

---

## How It Works

### 1. Decodes the transaction
When you paste a tx hash, our backend calls the blockchain node directly, pulls the full receipt, and parses every log event to extract which contracts were touched and which tokens moved between addresses.

### 2. Pulls verified source code
We hit the Etherscan API to pull verified source code and ABI for each contract - so we can see exactly what functions exist and whether the code is publicly readable or hidden.

### 3. Reads live on-chain state
Live RPC calls are made directly against the node to check things like who the current owner is, whether the contract is paused right now, and whether there's a pending admin transfer queued up that could change who controls the money.

### 4. AI research pass
Claude does a web research pass on top - searching for audit reports on GitHub, exploit write-ups on Rekt News, recent governance changes - and synthesises everything into a plain English narrative with every source cited.

---

## Four Risk Categories

![Vulnerability Assessment](./public/screenshots/vulnerability.png)

| Category | What We Check |
|---|---|
| **Protocol Security** | Source verified, audited, upgradeable contracts, exploit history |
| **Pool Security** | Pool age, kill switch risk, withdrawal locks |
| **Governance & Control** | Who controls admin keys - single wallet, multisig, or DAO with timelock |
| **Position Economics** | Impermanent loss exposure, MEV sandwich risk, token freeze/mint risks |

Each factor is individually scored and weighted into an **Iceberg Score out of 100** with plain English cards explaining what it means for your money.

---

## Contract Analysis

![Contract Analysis](./public/screenshots/contracts.png)

For every contract touched in the transaction we show:
- Whether the source code is verified on-chain
- Who controls the admin keys
- Whether it's an upgradeable proxy
- All functions categorised by type (trading, pool setup, admin, read-only)
- Deployment age and creator address

---

## Smart Caching

AI analysis costs real money per call. So we fingerprint each analysis by chain + the exact set of contracts and tokens involved, creating a unique ID for every pool.

- Two different people analysing the same pool hit the same cache key - the second person gets the full result instantly at zero cost
- Cache lives for 30 days
- The more people use it, the more pools get covered and the cheaper it gets for everyone

This is the economics that makes it viable as a public good at scale.

---

## Why This Matters

- **Educational** - you learn what an upgradeable proxy is, what a multisig means, what impermanent loss does to your position - all in the context of money you already deployed
- **Shareable** - anyone can post a pool address or tx hash in a Discord or Telegram and get back a full breakdown instantly
- **Public good** - building a shared knowledge layer of DeFi risk intelligence, one cached analysis at a time

---

## Tech Stack

- **Frontend** - Next.js 16, TypeScript, Tailwind CSS
- **Blockchain** - ethers.js v6, Etherscan V2 API, public RPC endpoints
- **AI** - Claude (Anthropic) with web search for real-time research
- **Chains** - Ethereum, Base (more coming)

---

Built by [@CatDad0x](https://github.com/CatDad0x)
