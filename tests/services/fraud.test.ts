import { FraudService, Transaction } from '../../src/services/fraud';

describe('FraudService', () => {
  let fraudService: FraudService;
  let lowThresholdService: FraudService;

  beforeEach(() => {
    fraudService = new FraudService();
    lowThresholdService = new FraudService({ fraudScoreThreshold: 20 });
  });

  describe('detectFraud', () => {
    const baseTransaction: Transaction = {
      id: 'txn-1',
      userId: 'user-1',
      amount: 100,
      timestamp: new Date(),
      location: { lat: 0, lng: 0 },
      status: 'SUCCESS',
    };

    it('should not flag normal transaction', () => {
      const userTransactions: Transaction[] = [
        { ...baseTransaction, id: 'txn-0', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // 2 hours ago
      ];

      const result = fraudService.detectFraud(baseTransaction, userTransactions);

      expect(result.isFraud).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toHaveLength(0);
    });

    it('should flag velocity anomaly', () => {
      const userTransactions: Transaction[] = Array.from({ length: 6 }, (_, i) => ({
        ...baseTransaction,
        id: `txn-${i}`,
        timestamp: new Date(Date.now() - i * 5 * 60 * 1000), // every 5 minutes
      }));

      const result = lowThresholdService.detectFraud(baseTransaction, userTransactions);

      expect(result.isFraud).toBe(true);
      expect(result.reasons.some(r => /Too many transactions/.test(r))).toBe(true);
    });

    it('should flag amount anomaly', () => {
      const userTransactions: Transaction[] = [
        { ...baseTransaction, amount: 10, timestamp: new Date(Date.now() - 30 * 60 * 1000) },
      ];

      const largeTransaction = { ...baseTransaction, amount: 200 }; // 20x average

      const result = lowThresholdService.detectFraud(largeTransaction, userTransactions);

      expect(result.isFraud).toBe(true);
      expect(result.reasons.some(r => /Unusually large amount/.test(r))).toBe(true);
    });

    it('should flag geographic anomaly', () => {
      const userTransactions: Transaction[] = [
        {
          ...baseTransaction,
          location: { lat: 0, lng: 0 },
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
        },
      ];

      const farTransaction = {
        ...baseTransaction,
        location: { lat: 10, lng: 10 }, // ~1400km away
      };

      const result = lowThresholdService.detectFraud(farTransaction, userTransactions);

      expect(result.isFraud).toBe(true);
      expect(result.reasons.some(r => /Suspicious location change/.test(r))).toBe(true);
    });

    it('should flag failed attempts pattern', () => {
      const lowScoreService = new FraudService({ fraudScoreThreshold: 10 });
      const userTransactions: Transaction[] = Array.from({ length: 3 }, (_, i) => ({
        ...baseTransaction,
        id: `txn-${i}`,
        status: 'FAILED' as const,
        timestamp: new Date(Date.now() - i * 10 * 60 * 1000), // every 10 minutes
      }));

      const result = lowScoreService.detectFraud(baseTransaction, userTransactions);

      expect(result.isFraud).toBe(true);
      expect(result.reasons.some(r => /Multiple failed attempts/.test(r))).toBe(true);
    });

    it('should handle empty transaction history', () => {
      const result = fraudService.detectFraud(baseTransaction, []);

      expect(result.isFraud).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('processTransaction', () => {
    it('should process and queue fraudulent transaction', () => {
      const transaction: Transaction = {
        id: 'txn-1',
        userId: 'user-1',
        amount: 1000,
        timestamp: new Date(),
        location: { lat: 0, lng: 0 },
      };

      const userTransactions: Transaction[] = Array.from({ length: 6 }, (_, i) => ({
        ...transaction,
        id: `txn-${i}`,
        timestamp: new Date(Date.now() - i * 5 * 60 * 1000),
      }));

      const result = lowThresholdService.processTransaction(transaction, userTransactions);

      expect(result.isFraud).toBe(true);
      expect(lowThresholdService.getReviewQueue()).toHaveLength(1);
    });
  });

  describe('review queue', () => {
    it('should manage review queue', () => {
      const transaction: Transaction = {
        id: 'txn-1',
        userId: 'user-1',
        amount: 100,
        timestamp: new Date(),
        location: { lat: 0, lng: 0 },
      };

      fraudService.addToReviewQueue(transaction);
      expect(fraudService.getReviewQueue()).toHaveLength(1);

      fraudService.clearReviewQueue();
      expect(fraudService.getReviewQueue()).toHaveLength(0);
    });
  });
});