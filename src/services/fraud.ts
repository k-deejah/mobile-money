import { transactionTotal, transactionErrorsTotal } from '../utils/metrics';

/**
 * Fraud Detection Service
 *
 * Implements comprehensive fraud detection rules for mobile money transactions.
 *
 * Rules:
 * 1. Velocity Check: > 5 transactions within 1 hour
 * 2. Amount Anomaly: Transaction > 10x average user transaction amount
 * 3. Geographic Anomaly: Location change > 1000km within 1 hour
 * 4. Pattern Detection: >= 3 failed transactions in short time
 *
 * Fraud Score Threshold: 50 (configurable)
 */

interface FraudConfig {
  maxTransactionsPerHour: number;
  amountMultiplier: number;
  maxDistanceKm: number;
  timeWindowMs: number;
  fraudScoreThreshold: number;
  velocityScore: number;
  amountScore: number;
  geoScore: number;
  patternScore: number;
}

const defaultConfig: FraudConfig = {
  maxTransactionsPerHour: parseInt(process.env.FRAUD_MAX_TRANSACTIONS_PER_HOUR || '5'),
  amountMultiplier: parseFloat(process.env.FRAUD_AMOUNT_MULTIPLIER || '10'),
  maxDistanceKm: parseFloat(process.env.FRAUD_MAX_DISTANCE_KM || '1000'),
  timeWindowMs: parseInt(process.env.FRAUD_TIME_WINDOW_MS || `${60 * 60 * 1000}`),
  fraudScoreThreshold: parseInt(process.env.FRAUD_SCORE_THRESHOLD || '50'),
  velocityScore: parseInt(process.env.FRAUD_VELOCITY_SCORE || '30'),
  amountScore: parseInt(process.env.FRAUD_AMOUNT_SCORE || '30'),
  geoScore: parseInt(process.env.FRAUD_GEO_SCORE || '25'),
  patternScore: parseInt(process.env.FRAUD_PATTERN_SCORE || '15'),
};

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  timestamp: Date;
  location: Location;
  status?: "SUCCESS" | "FAILED";
}

interface Location {
  lat: number;
  lng: number;
}

export interface FraudResult {
  isFraud: boolean;
  score: number;
  reasons: string[];
}

function getDistanceKm(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  // Haversine formula for distance calculation
  const R = 6371; 
  const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;

  const lat1 = (loc1.lat * Math.PI) / 180;
  const lat2 = (loc2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export class FraudService {
  private config: FraudConfig;
  private reviewQueue: Transaction[] = [];

  constructor(config?: Partial<FraudConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Detects fraud in a transaction based on user transaction history
   * @param transaction The transaction to evaluate
   * @param userTransactions Recent transactions for the user (should be sorted by timestamp desc)
   * @returns Fraud detection result
   */
  detectFraud(
    transaction: Transaction,
    userTransactions: Transaction[]
  ): FraudResult {
    let score = 0;
    const reasons: string[] = [];
    const now = transaction.timestamp;

    // Sort transactions by timestamp descending for efficient filtering
    const sortedTxns = [...userTransactions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // 1. Velocity check: count transactions in time window
    const recentTxns = sortedTxns.filter(
      (t) => now.getTime() - t.timestamp.getTime() <= this.config.timeWindowMs
    );

    if (recentTxns.length >= this.config.maxTransactionsPerHour) {
      score += this.config.velocityScore;
      reasons.push(`Too many transactions (${recentTxns.length}) in ${this.config.timeWindowMs / (60 * 1000)} minutes`);
    }

    // 2. Amount anomaly: compare to average of recent transactions
    const recentAmounts = recentTxns.map(t => t.amount);
    const avgAmount = recentAmounts.length > 0
      ? recentAmounts.reduce((sum, a) => sum + a, 0) / recentAmounts.length
      : transaction.amount; 

    if (transaction.amount > avgAmount * this.config.amountMultiplier) {
      score += this.config.amountScore;
      reasons.push(`Unusually large amount (${transaction.amount} vs avg ${avgAmount.toFixed(2)})`);
    }

    // 3. Geographic anomaly: check distance from last known location in time window
    const lastTxn = recentTxns.find(t => t.location); 
    if (lastTxn) {
      const distance = getDistanceKm(lastTxn.location, transaction.location);
      const timeDiff = now.getTime() - lastTxn.timestamp.getTime();

      if (
        distance > this.config.maxDistanceKm &&
        timeDiff <= this.config.timeWindowMs
      ) {
        score += this.config.geoScore;
        reasons.push(`Suspicious location change (${distance.toFixed(2)}km in ${timeDiff / (60 * 1000)} minutes)`);
      }
    }

    // 4. Pattern detection: count failed attempts in time window
    const failedAttempts = recentTxns.filter(
      (t) =>
        t.status === "FAILED" &&
        now.getTime() - t.timestamp.getTime() <= this.config.timeWindowMs
    );

    if (failedAttempts.length >= 3) {
      score += this.config.patternScore;
      reasons.push(`Multiple failed attempts (${failedAttempts.length}) in short time`);
    }

    const isFraud = score >= this.config.fraudScoreThreshold;

    // Update metrics
    transactionTotal.inc({ type: 'fraud_check', status: isFraud ? 'flagged' : 'passed' });
    if (isFraud) {
      transactionErrorsTotal.inc({ type: 'fraud_detection', error_type: 'fraud_flagged' });
    }

    return {
      isFraud,
      score,
      reasons,
    };
  }

  /**
   * Logs a fraud alert for a suspicious transaction
   * @param result Fraud detection result
   * @param transaction The transaction
   */
  logFraudAlert(result: FraudResult, transaction: Transaction): void {
    if (!result.isFraud) return;

    const alert = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      type: 'FRAUD_ALERT',
      transactionId: transaction.id,
      userId: transaction.userId,
      score: result.score,
      reasons: result.reasons,
      amount: transaction.amount,
      location: transaction.location,
    };

    console.warn(JSON.stringify(alert));
  }

  /**
   * Adds a suspicious transaction to the manual review queue
   * @param transaction The transaction to review
   */
  addToReviewQueue(transaction: Transaction): void {
    this.reviewQueue.push(transaction);
    // In production, persist to database or Redis queue
    console.log(`Transaction ${transaction.id} added to review queue`);
  }

  /**
   * Gets the current review queue (for admin purposes)
   * @returns Array of transactions in review queue
   */
  getReviewQueue(): Transaction[] {
    return [...this.reviewQueue];
  }

  /**
   * Clears the review queue (after processing)
   */
  clearReviewQueue(): void {
    this.reviewQueue = [];
  }

  /**
   * Processes a transaction: detects fraud, logs alerts, and queues for review if needed
   * @param transaction The transaction to process
   * @param userTransactions Recent user transactions
   * @returns Fraud detection result
   */
  processTransaction(
    transaction: Transaction,
    userTransactions: Transaction[]
  ): FraudResult {
    const result = this.detectFraud(transaction, userTransactions);

    this.logFraudAlert(result, transaction);

    if (result.isFraud) {
      this.addToReviewQueue(transaction);
    }

    return result;
  }
}

// Export singleton instance
export const fraudService = new FraudService();