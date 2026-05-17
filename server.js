require('dotenv').config();

const express = require('express');
const axios = require('axios');
const fetch = require('node-fetch');

const app = express();

// ==================== CONFIGURATION ====================
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || 'PIYSBY5T483ZQGU7GJRZUYRS2M3B8Y1PEM';
const PORT = process.env.PORT || 3000;

// LI.FI Configuration
const LIFI_API = 'https://li.quest/v1';
const RELAY_API = 'https://api.relay.link';
const INTEGRATOR_ID = process.env.INTEGRATOR_ID || 'NFT77-DEX';
const FEE_RECIPIENT = process.env.WALLET_ADDRESS || '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

// Supported Chains
const SUPPORTED_CHAINS = {
    1: { name: 'Ethereum', scanApi: 'api.etherscan.io', nativeToken: 'ETH', dexName: 'ethereum' },
    56: { name: 'BNB Chain', scanApi: 'api.bscscan.com', nativeToken: 'BNB', dexName: 'bsc' },
    137: { name: 'Polygon', scanApi: 'api.polygonscan.com', nativeToken: 'MATIC', dexName: 'polygon' },
    42161: { name: 'Arbitrum', scanApi: 'api.arbiscan.io', nativeToken: 'ETH', dexName: 'arbitrum' },
    10: { name: 'Optimism', scanApi: 'api-optimistic.etherscan.io', nativeToken: 'ETH', dexName: 'optimism' },
    8453: { name: 'Base', scanApi: 'api.basescan.org', nativeToken: 'ETH', dexName: 'base' },
    43114: { name: 'Avalanche', scanApi: 'api.snowscan.xyz', nativeToken: 'AVAX', dexName: 'avalanche' }
};

const NATIVE_TOKENS = {
    1: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    56: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    137: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    42161: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    10: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    8453: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    43114: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
};

// ==================== MIDDLEWARE ====================
app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// ==================== TOKEN METADATA (BscScan) ====================
async function fetchTokenMetadata(tokenAddress) {
    if (!BSCSCAN_API_KEY) {
        console.log('⚠️ BSCSCAN_API_KEY not found in .env');
        return { name: null, symbol: null };
    }
    
    try {
        const url = `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=${BSCSCAN_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
            const tokenData = response.data.result[0];
            console.log(`✅ Metadata found: ${tokenData.name} (${tokenData.symbol})`);
            return {
                name: tokenData.name,
                symbol: tokenData.symbol,
                decimals: tokenData.decimals
            };
        } else {
            console.log(`⚠️ Metadata not found for: ${tokenAddress}`);
            return { name: null, symbol: null, decimals: null };
        }
    } catch (error) {
        console.error('❌ Failed to fetch metadata:', error.message);
        return { name: null, symbol: null, decimals: null };
    }
}

// ==================== SAFETY SHIELD FUNCTIONS ====================

function getScannerApiUrl(chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) return 'api.bscscan.com';
    return chain.scanApi;
}

// Layer 1: Contract Verification
async function checkContractVerification(tokenAddress, chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) return { passed: false, name: 'Contract Verification', message: '⚠️ Unsupported chain' };
    
    if (tokenAddress.toLowerCase() === NATIVE_TOKENS[chainId].toLowerCase()) {
        return { passed: true, name: 'Contract Verification', message: `✅ Native ${chain.nativeToken} - safe` };
    }
    
    try {
        const url = `https://${chain.scanApi}/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${BSCSCAN_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data.status === '1' && response.data.result && response.data.result[0]) {
            const isVerified = response.data.result[0].SourceCode !== '' && response.data.result[0].SourceCode !== null;
            return {
                passed: isVerified,
                name: 'Contract Verification',
                message: isVerified ? `✅ Contract verified on ${chain.name}` : '❌ Contract NOT verified!'
            };
        }
        return { passed: false, name: 'Contract Verification', message: '⚠️ Unable to verify contract' };
    } catch (error) {
        return { passed: false, name: 'Contract Verification', message: '⚠️ Verification error' };
    }
}

// Layer 2: Holder Distribution
async function checkHolderDistribution(tokenAddress, chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) return { passed: true, name: 'Holder Distribution', message: '⚠️ Unsupported chain' };
    
    if (tokenAddress.toLowerCase() === NATIVE_TOKENS[chainId].toLowerCase()) {
        return { passed: true, name: 'Holder Distribution', message: '✅ Native token - healthy distribution' };
    }
    
    try {
        const url = `https://${chain.scanApi}/api?module=token&action=tokenholderlist&contractaddress=${tokenAddress}&page=1&offset=10&apikey=${BSCSCAN_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data.status !== '1' || !response.data.result || response.data.result.length === 0) {
            return { passed: true, name: 'Holder Distribution', message: '⚠️ Holder data unavailable' };
        }
        
        const holders = response.data.result;
        let totalSupply = 0;
        holders.forEach(h => { totalSupply += parseFloat(h.balance); });
        
        if (totalSupply === 0) {
            return { passed: false, name: 'Holder Distribution', message: '❌ Invalid supply data' };
        }
        
        let top10Percentage = 0;
        holders.forEach(h => { top10Percentage += (parseFloat(h.balance) / totalSupply) * 100; });
        
        const isSafe = top10Percentage < 30;
        return {
            passed: isSafe,
            name: 'Holder Distribution',
            message: isSafe ? `✅ Top 10 holders: ${top10Percentage.toFixed(1)}%` : `❌ Top 10 holders: ${top10Percentage.toFixed(1)}% - Centralized risk!`
        };
    } catch (error) {
        return { passed: true, name: 'Holder Distribution', message: '⚠️ Holder check skipped' };
    }
}

// Layer 3: Honeypot Detection
async function checkHoneypot(tokenAddress, chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) return { passed: true, name: 'Honeypot Detection', message: '⚠️ Unsupported chain' };
    
    if (tokenAddress.toLowerCase() === NATIVE_TOKENS[chainId].toLowerCase()) {
        return { passed: true, name: 'Honeypot Detection', message: `✅ Native ${chain.nativeToken} - safe` };
    }
    
    try {
        const url = `https://${chain.scanApi}/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${BSCSCAN_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data.status === '1' && response.data.result && response.data.result[0]) {
            const sourceCode = response.data.result[0].SourceCode || '';
            const hasHoneypotIndicator = sourceCode.toLowerCase().includes('honeypot') ||
                                         sourceCode.toLowerCase().includes('cannot sell') ||
                                         (sourceCode.toLowerCase().includes('onlyowner') && sourceCode.toLowerCase().includes('sell') && !sourceCode.includes('renounceOwnership'));
            
            if (hasHoneypotIndicator) {
                return { passed: false, name: 'Honeypot Detection', message: '⚠️ Honeypot indicator detected!' };
            }
            return { passed: true, name: 'Honeypot Detection', message: '✅ No honeypot indicators found' };
        }
        return { passed: true, name: 'Honeypot Detection', message: '⚠️ Unable to check honeypot' };
    } catch (error) {
        return { passed: true, name: 'Honeypot Detection', message: '⚠️ Honeypot check unavailable' };
    }
}

// Layer 4: Owner & Mint Risk
async function checkOwnerAndMintRisk(tokenAddress, chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) return { passed: true, name: 'Owner & Mint Risk', message: '⚠️ Unsupported chain' };
    
    if (tokenAddress.toLowerCase() === NATIVE_TOKENS[chainId].toLowerCase()) {
        return { passed: true, name: 'Owner & Mint Risk', message: `✅ Native ${chain.nativeToken} - no owner risk` };
    }
    
    try {
        const url = `https://${chain.scanApi}/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${BSCSCAN_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data.status === '1' && response.data.result && response.data.result[0]) {
            const sourceCode = response.data.result[0].SourceCode || '';
            const hasMint = sourceCode.toLowerCase().includes('function mint') || sourceCode.toLowerCase().includes('function _mint');
            const hasOwnerOnly = sourceCode.toLowerCase().includes('onlyowner') || sourceCode.toLowerCase().includes('owner only');
            
            if (hasMint && !sourceCode.includes('renounceOwnership')) {
                return { passed: false, name: 'Owner & Mint Risk', message: '⚠️ Mint function without renounce - owner can mint new tokens!' };
            }
            if (hasOwnerOnly) {
                return { passed: false, name: 'Owner & Mint Risk', message: '⚠️ Owner-only functions detected' };
            }
            return { passed: true, name: 'Owner & Mint Risk', message: '✅ No owner/mint risk detected' };
        }
        return { passed: true, name: 'Owner & Mint Risk', message: '⚠️ Unable to check owner risk' };
    } catch (error) {
        return { passed: true, name: 'Owner & Mint Risk', message: '⚠️ Owner check skipped' };
    }
}

// Layer 5: Liquidity & Volume
async function checkLiquidityAndVolume(tokenAddress, chainId) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        
        if (!response.data.pairs || response.data.pairs.length === 0) {
            return {
                passed: false,
                name: 'Liquidity & Volume',
                message: '❌ No liquidity found!',
                liquidityUSD: 0,
                volume24h: 0,
                priceUSD: 0
            };
        }
        
        const chainName = SUPPORTED_CHAINS[chainId]?.dexName || '';
        let chainPairs = response.data.pairs;
        if (chainName) {
            chainPairs = response.data.pairs.filter(pair => pair.chainId === chainName);
        }
        
        if (chainPairs.length === 0) chainPairs = response.data.pairs;
        
        let bestPair = chainPairs[0];
        for (const pair of chainPairs) {
            const liquidity = parseFloat(pair.liquidity?.usd || 0);
            const bestLiquidity = parseFloat(bestPair.liquidity?.usd || 0);
            if (liquidity > bestLiquidity) bestPair = pair;
        }
        
        const liquidityUSD = parseFloat(bestPair.liquidity?.usd || 0);
        const volume24h = parseFloat(bestPair.volume?.h24 || 0);
        const priceUSD = parseFloat(bestPair.priceUsd || 0);
        
        let passed = true;
        let message = '';
        
        if (liquidityUSD < 50000) { passed = false; message += '⚠️ Low liquidity! '; }
        else { message += '✅ Good liquidity. '; }
        
        if (volume24h < 10000) { passed = false; message += '⚠️ Low volume! '; }
        else { message += '✅ Active trading. '; }
        
        if (passed && message === '') message = '✅ Liquidity & volume healthy';
        
        return {
            passed: passed,
            name: 'Liquidity & Volume',
            message: message,
            liquidityUSD: liquidityUSD,
            volume24h: volume24h,
            priceUSD: priceUSD,
            dex: bestPair.dexId,
            chain: bestPair.chainId
        };
    } catch (error) {
        return {
            passed: false,
            name: 'Liquidity & Volume',
            message: '❌ Failed to fetch liquidity',
            liquidityUSD: 0,
            volume24h: 0,
            priceUSD: 0
        };
    }
}

// Main Safety Scan
async function fullSafetyScan(tokenAddress, chainId) {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    
    console.log(`🔍 Scanning token on ${chain.name}: ${tokenAddress}`);
    
    const [contractCheck, holderCheck, honeypotCheck, ownerCheck, liquidityCheck] = await Promise.all([
        checkContractVerification(tokenAddress, chainId),
        checkHolderDistribution(tokenAddress, chainId),
        checkHoneypot(tokenAddress, chainId),
        checkOwnerAndMintRisk(tokenAddress, chainId),
        checkLiquidityAndVolume(tokenAddress, chainId)
    ]);
    
    const checks = [contractCheck, holderCheck, honeypotCheck, ownerCheck, liquidityCheck];
    
    let safetyScore = 0;
    let passedCount = 0;
    
    for (const check of checks) {
        if (check.passed) {
            safetyScore += 20;
            passedCount++;
        }
    }
    
    safetyScore = Math.min(safetyScore, 100);
    const isSafe = safetyScore >= 60;
    
    console.log(`✅ Scan complete: ${isSafe ? 'SAFE' : 'RISKY'} (Score: ${safetyScore}, Passed: ${passedCount}/5)`);
    
    return {
        token: tokenAddress,
        chain: chain.name,
        chainId: chainId,
        nativeToken: chain.nativeToken,
        isSafe: isSafe,
        safetyScore: safetyScore,
        passedChecks: passedCount,
        totalChecks: 5,
        checks: checks,
        priceUSD: liquidityCheck.priceUSD || 0,
        liquidityUSD: liquidityCheck.liquidityUSD || 0,
        volume24h: liquidityCheck.volume24h || 0,
        dex: liquidityCheck.dex || 'Unknown',
        timestamp: new Date().toISOString()
    };
}

// ==================== BRIDGE FUNCTIONS ====================
function calculateBridgeFee(slippage) {
    if (slippage <= 0.5) return 0.3;
    const extraFee = Math.floor((slippage - 0.5) / 0.5) * 0.1;
    return Math.min(0.3 + extraFee, 1.5);
}

// ==================== API ENDPOINTS ====================

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/ping', (req, res) => {
    res.json({ status: 'success', message: 'pong', timestamp: new Date().toISOString() });
});

app.get('/api/scan/:chainId/:tokenAddress', async (req, res) => {
    const { chainId, tokenAddress } = req.params;
    const chainIdNum = parseInt(chainId);
    
    if (!SUPPORTED_CHAINS[chainIdNum]) {
        return res.json({
            token: tokenAddress,
            isSafe: false,
            safetyScore: 0,
            error: `Unsupported chain ID: ${chainId}. Supported: ${Object.entries(SUPPORTED_CHAINS).map(([id, c]) => `${c.name}(${id})`).join(', ')}`
        });
    }
    
    if (!tokenAddress || tokenAddress.length < 10 || !tokenAddress.startsWith('0x')) {
        return res.json({
            token: tokenAddress,
            isSafe: false,
            safetyScore: 0,
            error: 'Invalid token address',
            message: 'Enter a valid token address (starts with 0x)'
        });
    }
    
    try {
        const metadata = await fetchTokenMetadata(tokenAddress);
        const result = await fullSafetyScan(tokenAddress, chainIdNum);
        
        res.json({
            ...result,
            tokenName: metadata.name,
            tokenSymbol: metadata.symbol
        });
    } catch (error) {
        console.error('Scan error:', error);
        res.json({
            token: tokenAddress,
            isSafe: false,
            safetyScore: 0,
            error: error.message,
            message: 'Failed to scan token'
        });
    }
});

// Bridge Quote Endpoint
app.get('/api/bridge/quote/:fromChain/:toChain/:amount/:slippage', async (req, res) => {
    const { fromChain, toChain, amount, slippage } = req.params;
    const userAddress = req.query.address || '0x0000000000000000000000000000000000000000';
    
    const feePercent = calculateBridgeFee(parseFloat(slippage));
    const amountInWei = (parseFloat(amount) * Math.pow(10, 18)).toString();
    
    let lifiResult = null;
    let relayResult = null;
    
    // Try LI.FI
    try {
        const params = new URLSearchParams({
            fromChain: fromChain,
            fromAmount: amountInWei,
            fromToken: NATIVE_TOKEN,
            toChain: toChain,
            toToken: NATIVE_TOKEN,
            fromAddress: userAddress,
            slippage: (parseFloat(slippage) / 100).toString(),
            integrator: INTEGRATOR_ID,
            fee: feePercent.toString()
        });
        
        const lifiResponse = await fetch(`${LIFI_API}/quote?${params}`);
        const lifiData = await lifiResponse.json();
        
        if (!lifiData.error && lifiData.routes && lifiData.routes.length > 0) {
            const bestRoute = lifiData.routes[0];
            lifiResult = {
                aggregator: 'LI.FI',
                toAmount: (parseFloat(bestRoute.toAmount) / Math.pow(10, 18)).toFixed(6),
                gasCostUSD: bestRoute.gasCostUSD || '~0.50',
                route: bestRoute,
                feePercent: feePercent
            };
        }
    } catch (e) {
        console.log('LI.FI quote error:', e.message);
    }
    
    // Try Relay
    try {
        const relayBody = {
            user: userAddress,
            originChainId: parseInt(fromChain),
            destinationChainId: parseInt(toChain),
            originCurrency: NATIVE_TOKEN,
            destinationCurrency: NATIVE_TOKEN,
            amount: amountInWei,
            tradeType: "EXACT_INPUT",
            appFees: [{ recipient: FEE_RECIPIENT, fee: Math.round(feePercent * 100) }]
        };
        
        const relayResponse = await fetch(`${RELAY_API}/quote/v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(relayBody)
        });
        const relayData = await relayResponse.json();
        
        if (!relayData.error) {
            const expectedOutput = relayData.quote?.expectedOutput || relayData.expectedOutput;
            relayResult = {
                aggregator: 'Relay',
                toAmount: expectedOutput ? (parseFloat(expectedOutput) / Math.pow(10, 18)).toFixed(6) : null,
                gasCostUSD: '~0.30',
                route: relayData,
                feePercent: feePercent
            };
        }
    } catch (e) {
        console.log('Relay quote error:', e.message);
    }
    
    if (lifiResult && relayResult) {
        const lifiAmount = parseFloat(lifiResult.toAmount);
        const relayAmount = parseFloat(relayResult.toAmount);
        const best = lifiAmount >= relayAmount ? lifiResult : relayResult;
        res.json({ success: true, ...best, alternatives: { lifi: lifiResult, relay: relayResult } });
    } else if (lifiResult) {
        res.json({ success: true, ...lifiResult });
    } else if (relayResult) {
        res.json({ success: true, ...relayResult });
    } else {
        res.json({ success: false, error: 'No route found from any aggregator' });
    }
});

// Bridge Execute Endpoint
app.post('/api/bridge/execute', async (req, res) => {
    const { fromChain, toChain, amount, userAddress, slippage, aggregator } = req.body;
    const feePercent = calculateBridgeFee(parseFloat(slippage));
    const amountInWei = (parseFloat(amount) * Math.pow(10, 18)).toString();
    
    try {
        if (aggregator === 'LI.FI' || !aggregator) {
            const params = new URLSearchParams({
                fromChain: fromChain,
                fromAmount: amountInWei,
                fromToken: NATIVE_TOKEN,
                toChain: toChain,
                toToken: NATIVE_TOKEN,
                fromAddress: userAddress,
                slippage: (parseFloat(slippage) / 100).toString(),
                integrator: INTEGRATOR_ID,
                fee: feePercent.toString()
            });
            
            const quoteResponse = await fetch(`${LIFI_API}/quote?${params}`);
            const quoteData = await quoteResponse.json();
            
            if (quoteData.error || !quoteData.routes || quoteData.routes.length === 0) {
                throw new Error(quoteData.error || 'No route found');
            }
            
            const txResponse = await fetch(`${LIFI_API}/advanced/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromChain: parseInt(fromChain),
                    toChain: parseInt(toChain),
                    fromToken: NATIVE_TOKEN,
                    toToken: NATIVE_TOKEN,
                    fromAmount: amountInWei,
                    fromAddress: userAddress,
                    slippage: parseFloat(slippage) / 100,
                    integrator: INTEGRATOR_ID,
                    fee: feePercent
                })
            });
            
            const txData = await txResponse.json();
            
            if (txData.error || !txData.routes || txData.routes.length === 0) {
                throw new Error(txData.error || 'Cannot get transaction data');
            }
            
            const routeWithTx = txData.routes[0];
            
            res.json({
                success: true,
                aggregator: 'LI.FI',
                transactionRequest: routeWithTx.transactionRequest,
                feePercent: feePercent,
                recipientWallet: FEE_RECIPIENT
            });
            
        } else if (aggregator === 'Relay') {
            const quoteBody = {
                user: userAddress,
                originChainId: parseInt(fromChain),
                destinationChainId: parseInt(toChain),
                originCurrency: NATIVE_TOKEN,
                destinationCurrency: NATIVE_TOKEN,
                amount: amountInWei,
                tradeType: "EXACT_INPUT",
                appFees: [{ recipient: FEE_RECIPIENT, fee: Math.round(feePercent * 100) }]
            };
            
            const quoteResponse = await fetch(`${RELAY_API}/quote/v2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quoteBody)
            });
            const quoteData = await quoteResponse.json();
            
            if (quoteData.error) {
                throw new Error(quoteData.error);
            }
            
            const executeResponse = await fetch(`${RELAY_API}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote: quoteData, user: userAddress })
            });
            
            const executeData = await executeResponse.json();
            
            res.json({
                success: true,
                aggregator: 'Relay',
                transactionData: executeData,
                feePercent: feePercent,
                recipientWallet: FEE_RECIPIENT
            });
        } else {
            throw new Error('Unknown aggregator');
        }
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Swap Quote Endpoint (OKX DEX)
app.get('/api/quote/:chainId/:fromToken/:toToken/:amount', async (req, res) => {
    const { chainId, fromToken, toToken, amount } = req.params;
    const slippage = req.query.slippage || '0.5';
    const feePercent = calculateBridgeFee(parseFloat(slippage));
    
    try {
        const fromTokenAddress = fromToken === 'native' ? NATIVE_TOKEN : fromToken;
        const toTokenAddress = toToken === 'native' ? NATIVE_TOKEN : toToken;
        
        const params = new URLSearchParams({
            chainId: chainId,
            fromTokenAddress: fromTokenAddress,
            toTokenAddress: toTokenAddress,
            amount: amount,
            slippage: slippage
        });
        
        const response = await axios.get(`https://www.okx.com/api/v5/dex/aggregator/quote?${params}`);
        
        if (response.data.code !== '0') {
            return res.json({ error: response.data.msg });
        }
        
        const quote = response.data.data[0];
        const originalOutput = parseFloat(quote.toTokenAmount);
        const feeAmount = originalOutput * (feePercent / 100);
        const finalOutput = originalOutput - feeAmount;
        
        res.json({
            success: true,
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            fromAmount: amount,
            toAmount: finalOutput.toString(),
            originalAmount: originalOutput,
            feePercent: feePercent,
            feeAmount: feeAmount,
            router: quote.routerResult?.routerAddress || 'OKX DEX Aggregator'
        });
        
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/chains', (req, res) => {
    const chains = Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => ({
        id: parseInt(id),
        name: chain.name,
        nativeToken: chain.nativeToken
    }));
    res.json({ chains });
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        server: 'NFT77 DEX Backend',
        version: '3.0.0',
        features: ['Contract Verification', 'Holder Distribution', 'Honeypot Detection', 'Owner & Mint Risk', 'Liquidity & Volume', 'Bridge (LI.FI + Relay)', 'Swap (OKX DEX)'],
        supportedChains: Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => ({
            id: parseInt(id),
            name: chain.name,
            nativeToken: chain.nativeToken
        })),
        apiKeyConfigured: !!BSCSCAN_API_KEY,
        timestamp: new Date().toISOString()
    });
});

// ==================== START SERVER ====================
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🚀 NFT77 DEX BACKEND v3.0 - RUNNING                                        ║
║                                                                              ║
║   📡 Server: http://localhost:${PORT}                                        ║
║   🔗 API Scan: http://localhost:${PORT}/api/scan/{chainId}/{tokenAddress}    ║
║   🌉 Bridge API: http://localhost:${PORT}/api/bridge/quote/...               ║
║                                                                              ║
║   🌐 SUPPORTED NETWORKS (7 Chains):                                          ║
║       ✅ Ethereum (1)     - api.etherscan.io                                 ║
║       ✅ BNB Chain (56)   - api.bscscan.com                                  ║
║       ✅ Polygon (137)    - api.polygonscan.com                              ║
║       ✅ Arbitrum (42161) - api.arbiscan.io                                  ║
║       ✅ Optimism (10)    - api-optimistic.etherscan.io                      ║
║       ✅ Base (8453)      - api.basescan.org                                 ║
║       ✅ Avalanche (43114)- api.snowscan.xyz                                 ║
║                                                                              ║
║   🛡️ ACTIVE SAFETY LAYERS:                                                  ║
║       ✅ Layer 1: Contract Verification                                      ║
║       ✅ Layer 2: Holder Distribution                                        ║
║       ✅ Layer 3: Honeypot Detection                                         ║
║       ✅ Layer 4: Owner & Mint Risk                                          ║
║       ✅ Layer 5: Liquidity & Volume                                         ║
║                                                                              ║
║   🌉 BRIDGE AGGREGATORS:                                                     ║
║       ✅ LI.FI (30+ bridges)                                                 ║
║       ✅ Relay (EVM + Solana)                                                ║
║                                                                              ║
║   💰 FEE CONFIGURATION:                                                      ║
║       ✅ Wallet: ${FEE_RECIPIENT.substring(0, 10)}...${FEE_RECIPIENT.substring(30)}           ║
║       ✅ Fee: 0.3% - 1.5% (based on slippage)                               ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        `);
    });
}

// Ekspor untuk Vercel Serverless Functions
module.exports = app;