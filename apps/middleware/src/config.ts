import "dotenv/config";

export const CONFIG = {
  flareRpcUrl: process.env.FLARE_RPC_URL ?? "",
  chainId: Number(process.env.CHAIN_ID ?? 114),
  apiPort: Number(process.env.API_PORT ?? 3001),

  queueAddress: process.env.QUEUE_ADDRESS ?? "",
  constraintsAddress: process.env.CONSTRAINTS_ADDRESS ?? "",

  executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY ?? "",

  // FDC
  fdcMode: process.env.FDC_MODE ?? "mock", // mock | web2json
  flareApiKey: process.env.FLARE_API_KEY ?? "00000000-0000-0000-0000-000000000000",
  web2jsonVerifierUrl: process.env.WEB2JSON_VERIFIER_URL ?? "",
  fdcDaUrl: process.env.FDC_DA_URL ?? "https://ctn2-data-availability.flare.network",
  fdcHubAddress: process.env.FDC_HUB_ADDRESS ?? "",
  fdcFeeConfigAddress: process.env.FDC_FEE_CONFIG_ADDRESS ?? "",

  // Web2Json inputs (replace with your NAV endpoint)
  fdcWeb2Url: process.env.FDC_WEB2JSON_URL ?? "https://swapi.info/api/people/3",
  fdcWeb2Jq: process.env.FDC_WEB2JSON_JQ ?? `{name: .name, height: .height, mass: .mass, numberOfFilms: .films | length, uid: (.url | split("/") | .[-1] | tonumber)}`,
  fdcWeb2Abi: process.env.FDC_WEB2JSON_ABI ?? `{"components": [{"internalType": "string", "name": "name", "type": "string"},{"internalType": "uint256", "name": "height", "type": "uint256"},{"internalType": "uint256", "name": "mass", "type": "uint256"},{"internalType": "uint256", "name": "numberOfFilms", "type": "uint256"},{"internalType": "uint256", "name": "uid", "type": "uint256"}],"name": "task","type": "tuple"}`,

  // Market price feeds (CoinGecko simple price)
  coingeckoBaseUrl: process.env.COINGECKO_BASE_URL ?? "https://api.coingecko.com/api/v3/simple/price",
  coingeckoIds: process.env.COINGECKO_IDS ?? "",
  coingeckoSymbols: process.env.COINGECKO_SYMBOLS ?? "",
  coingeckoVsCurrency: process.env.COINGECKO_VS_CURRENCY ?? "usd",

  // Demo position sizing (override via .env)
  positionQtyTbill: Number(process.env.POS_TBILL_QTY ?? 1000),
  positionQtyTre: Number(process.env.POS_TRE_QTY ?? 50),

  modelServiceUrl: process.env.MODEL_SERVICE_URL ?? "http://localhost:8010",
  tickSeconds: Number(process.env.TICK_SECONDS ?? 10),
  auditPath: process.env.AUDIT_PATH ?? "./audit.jsonl",

  // LLM (OpenAI-compatible, optional local)
  llmEnabled: String(process.env.LLM_ENABLED ?? "false").toLowerCase() === "true",
  llmChatUrl: process.env.LLM_CHAT_URL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  llmTemperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
  llmMaxTokens: Number(process.env.LLM_MAX_TOKENS ?? 256),
};
