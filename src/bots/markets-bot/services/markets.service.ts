import axios from "axios";
import { config } from "../../../utils/config";
import { ASSET_TYPES } from "../../../enums/markets-bot-enums";

interface MarketAsset {
  symbol: string;
  name: string;
  fullname: string;
  type: string;
  cprice: number;
  unit: string;
  tradable: boolean;
  image: string | null;
  differenceValue: number;
  percentageDifferenceValue: string;
  lastUpdate: number;
  chart?: any[]; // We'll ignore this
}

interface MarketData {
  currency: MarketAsset[];
  crypto: MarketAsset[];
  gold: MarketAsset[];
}

export class MarketsService {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;

  // Specific symbols to fetch for each asset type
  private readonly targetSymbols = {
    currency: ["USD", "EUR", "GBP", "AED", "TRY", "CNY", "RUB", "IQD"],
    crypto: [
      "BTC",
      "ETH",
      "USDT",
      "DOGE",
      "BNB",
      "SOL",
      "TRX",
      "XRP",
      "SHIB",
      "DOT",
      "LTC",
      "CAKE",
    ],
    gold: [
      "IRTICHGOLD01",
      "IRTICHSILV01",
      "GERAM18",
      "SEKEE_EMAMI",
      "NIM",
      "ROB",
      "GERAMI",
      "ONS",
    ],
  };

  constructor() {
    this.apiBaseUrl = config.skenas.apiBaseUrl;
    this.apiKey = config.bot.apiKey;
  }

  public async fetchMarketData(): Promise<MarketData | null> {
    try {
      const assetTypes = [
        ASSET_TYPES.CURRENCY,
        ASSET_TYPES.CRYPTO,
        ASSET_TYPES.GOLD,
      ];
      const marketData: MarketData = {
        currency: [],
        crypto: [],
        gold: [],
      };

      // Fetch data for each asset type
      const fetchPromises = assetTypes.map(async (assetType) => {
        try {
          const response = await this.fetchAssetData(assetType);
          return { assetType, data: response };
        } catch (error) {
          console.error(`Error fetching ${assetType} data:`, error);
          return { assetType, data: [] };
        }
      });

      const results = await Promise.allSettled(fetchPromises);

      // Process results
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const { assetType, data } = result.value;
          if (Array.isArray(data) && data.length > 0) {
            // Filter for specific symbols based on asset type
            let filteredAssets: MarketAsset[] = [];

            switch (assetType) {
              case ASSET_TYPES.CURRENCY:
                filteredAssets = this.filterAssetsBySymbols(
                  data,
                  this.targetSymbols.currency
                );
                marketData.currency = filteredAssets;
                break;
              case ASSET_TYPES.CRYPTO:
                filteredAssets = this.filterAssetsBySymbols(
                  data,
                  this.targetSymbols.crypto
                );
                marketData.crypto = filteredAssets;
                break;
              case ASSET_TYPES.GOLD:
                filteredAssets = this.filterAssetsBySymbols(
                  data,
                  this.targetSymbols.gold
                );
                marketData.gold = filteredAssets;
                break;
            }
          }
        }
      });

      console.log("📊 Market data fetched successfully:", {
        currency: marketData.currency.length,
        crypto: marketData.crypto.length,
        gold: marketData.gold.length,
      });

      return marketData;
    } catch (error) {
      console.error("❌ Error fetching market data:", error);
      return null;
    }
  }

  private async fetchAssetData(assetType: string): Promise<MarketAsset[]> {
    try {
      const url = `${this.apiBaseUrl}/api/telegram-bot/markets/${assetType}?limit=100`;

      const response = await axios.get(url, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      });

      if (response.status === 200 && response.data) {
        // Handle the API response format: { status: "DONE", result: { data: [...] } }
        if (
          response.data.status === "DONE" &&
          response.data.result &&
          response.data.result.data
        ) {
          const assets = response.data.result.data;
          // Remove chart data since we don't need it
          return assets.map((asset: any) => {
            const { chart, ...assetWithoutChart } = asset;
            return assetWithoutChart;
          });
        } else {
          console.warn(
            `Unexpected response format for ${assetType}:`,
            response.data
          );
          return [];
        }
      } else {
        console.warn(`Invalid response for ${assetType}:`, response.status);
        return [];
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error(`API error for ${assetType}:`, {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          });
        } else if (error.request) {
          console.error(`Network error for ${assetType}:`, error.message);
        } else {
          console.error(`Request setup error for ${assetType}:`, error.message);
        }
      } else {
        console.error(`Unknown error for ${assetType}:`, error);
      }
      return [];
    }
  }

  private filterAssetsBySymbols(
    assets: MarketAsset[],
    targetSymbols: string[]
  ): MarketAsset[] {
    return assets
      .filter((asset) => targetSymbols.includes(asset.symbol))
      .sort((a, b) => {
        // Sort by the order of symbols in targetSymbols array
        const indexA = targetSymbols.indexOf(a.symbol);
        const indexB = targetSymbols.indexOf(b.symbol);
        return indexA - indexB;
      });
  }

  public async testConnection(): Promise<boolean> {
    try {
      const testData = await this.fetchMarketData();
      return testData !== null;
    } catch (error) {
      console.error("❌ Connection test failed:", error);
      return false;
    }
  }
}

export const marketsService = new MarketsService();
