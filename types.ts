
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface FinanceData {
  category: string;
  amount: number;
}

export interface PortfolioStatus {
  totalAssets: number;
  monthlySavings: number;
  riskProfile: 'Prudent' | 'Équilibré' | 'Dynamique';
}
