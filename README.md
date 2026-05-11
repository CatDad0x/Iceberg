# Iceberg — DeFi Risk Analysis

> **The risk beneath your yield.**

Iceberg is a free, open-source due diligence tool for DeFi users. Paste a transaction hash or pool address and get a structured, plain-English risk report covering smart contract security, protocol governance, and yield exposure in seconds.

**Live:** [iceberg.finance](https://iceberg.finance) &nbsp;·&nbsp; Built by [@CatDad0x](https://x.com/CatDad0x)

![Iceberg Landing Page](./public/screenshots/landing.png)

---

## Why This Exists

The biggest barrier to DeFi adoption isn't gas fees or wallet setup. It's that users have no way to understand what they're actually putting their money into before they do it.

A new user on Base or Ethereum looks at a pool offering 40% APY and has no idea whether:
- The contracts have ever been audited
- A single wallet can drain the pool overnight
- The protocol was hacked three months ago
- The "yield" is just inflationary token emissions

They either skip the opportunity entirely, or they ape in blind. Both outcomes are bad for the ecosystem.

Iceberg fixes this. In 30 seconds, any user regardless of technical background can get a full, plain-English breakdown of the risks in any DeFi position.

---

## Why It Matters for Ecosystems

Iceberg is built as an educational layer that benefits the chain it runs on, not just individual users.

### Educated users stay longer
Users who understand what they're putting money into make better decisions, lose less to scams and exploits, and build lasting trust in the ecosystem. Retention improves. Churn from bad experiences goes down.

### It reduces exploit damage
When users can see that a protocol has a single-wallet admin key or an unaudited contract, they think twice. Fewer users in high-risk protocols means less value lost when exploits happen and less reputational damage to the broader ecosystem.

### It lowers the barrier for new users
Users coming from TradFi or CeFi are not comfortable with "DYOR". Iceberg gives them a concrete, structured answer to "is this safe?" The same kind of answer they would expect from any financial tool. It removes a real psychological barrier to first deployment.

### It scales as a public good
Every analysis is cached by contract set. The more users run analyses, the more pools get covered, building a shared knowledge layer of risk intelligence across the ecosystem. The marginal cost of each additional analysis trends toward zero.

---

## What It Analyses

![Risk Report](./public/screenshots/report.png)

Every analysis covers four risk categories, each individually scored and weighted into an **Iceberg Score out of 100**:

| Category | Weight | What We Check |
|---|---|---|
| **Protocol Security** | 50% | Source verified, audit history, exploit history, upgradeable proxies |
| **Governance & Control** | 25% | Admin key ownership: single wallet, multisig, or DAO with timelock |
| **Pool Security** | 15% | Pool age, kill switch risk, withdrawal locks, oracle dependency |
| **Position Economics** | 10% | IL exposure, MEV risk, inflationary token risk, price correlation |

Results are written in plain English. No technical jargon required to understand the output.

---

## How It Works

### 1. Decodes the transaction
When a tx hash is pasted, the backend calls the blockchain node directly, pulls the full receipt, and parses every log event to extract which contracts were touched and which tokens moved.

### 2. Pulls verified source code
Etherscan API is called for each contract, pulling verified source code, ABI, deployment date, and creator address. If source is unverified, that itself is flagged as a risk.

### 3. Reads live on-chain state
Live RPC calls check things like who the current owner is, whether the contract is paused, whether a pending admin transfer is queued, and whether a timelock protects governance actions.

### 4. Cross-references exploit history
DeFiLlama's hacks database is queried to surface any historical exploits for the protocol, displayed in a timeline with amounts lost.

### 5. AI research pass
Claude runs a web research pass, finding audit reports on GitHub, exploit write-ups on Rekt News, recent governance changes, and synthesises everything into a cited, plain-English narrative.

---

## Contract Analysis

![Contract Analysis](./public/screenshots/contracts.png)

For every contract touched in the transaction:
- Source code verification status
- Admin key ownership (EOA, multisig, DAO, or renounced)
- Proxy and upgradeability detection
- Function categories (trading, pool setup, admin, read-only)
- Deployment age and creator address
- Live pool reserves and TVL

---

## Exploit History Timeline

![Vulnerability Assessment](./public/screenshots/vulnerability.png)

Historical exploits are pulled from DeFiLlama's hacks database and shown in a timeline with date, amount lost, and description so users can see whether a protocol has a clean track record or a history of security incidents.

---

## Smart Caching — Public Good Economics

AI analysis costs real money per call. Iceberg fingerprints each analysis by chain and the exact set of contracts and tokens involved.

- Two different users analysing the same pool share the same cache. The second user gets the full result instantly at zero marginal cost
- Cache lives for 30 days
- Every new analysis permanently adds to the shared knowledge layer
- The more the ecosystem uses it, the cheaper and faster it gets for everyone

This is how it operates as a genuinely sustainable public good rather than a paid product.

---

## Supported Protocols

Iceberg analyses any pool or gauge on supported chains. It has first-class support for:

**Base:** Aerodrome, Uniswap V3, Curve, Equalizer
**Ethereum:** Velodrome, Balancer, SushiSwap, PancakeSwap, Uniswap V3, Curve

Any address or tx hash can be pasted. Unsupported protocols still receive a full generic contract and governance analysis.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Blockchain | ethers.js v6, Etherscan V2 API, public RPC |
| AI | Claude (Anthropic) with web search |
| Data | DeFiLlama Hacks API, Snapshot governance API |
| Chains | Ethereum, Base |

---

## Roadmap

- [ ] Lending protocol support with collateral health and liquidation risk analysis
- [ ] Stablecoin analysis covering collateral safety and underlying depeg risks
- [ ] Yield aggregator support with strategy and underlying protocol risk
- [ ] More chains
- [ ] Telegram and Discord bot
- [ ] Progressive streaming results
- [ ] Wallet history scanner to analyse all recent positions at once

---

## Get In Touch

Interested in a partnership, integration, or collaboration?

**Twitter/X:** [@CatDad0x](https://x.com/CatDad0x)

---

*Not financial advice. Verify all findings independently.*
