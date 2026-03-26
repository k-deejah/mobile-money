import crypto from "crypto";
import { pool } from "../config/database";

export type AMLTransactionType = "deposit" | "withdraw";
export type AMLAlertStatus = "pending_review" | "reviewed" | "dismissed";
export type AMLAlertSeverity = "medium" | "high";
export type AMLRule =
  | "single_transaction_threshold"
  | "daily_total_threshold"
  | "rapid_structuring";

export interface AMLTransactionRecord {
  id: string;
  userId: string;
  type: AMLTransactionType;
  amount: number;
  createdAt: Date;
  status?: string;
}

export interface AMLRuleHit {
  rule: AMLRule;
  message: string;
  observed: number;
  threshold: number;
}

export interface AMLAlert {
  id: string;
  transactionId: string;
  userId: string;
  severity: AMLAlertSeverity;
  status: AMLAlertStatus;
  ruleHits: AMLRuleHit[];
  reasons: string[];
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface AMLReviewInput {
  status: Exclude<AMLAlertStatus, "pending_review">;
  reviewedBy: string;
  reviewNotes?: string;
}

export interface AMLConfig {
  singleTransactionThresholdXaf: number;
  dailyTotalThresholdXaf: number;
  rollingWindowHours: number;
  rapidWindowMinutes: number;
  rapidTransactionCount: number;
  structuringFloorXaf: number;
  alertBufferSize: number;
}

export interface AMLMonitoringResult {
  flagged: boolean;
  alert?: AMLAlert;
  ruleHits: AMLRuleHit[];
}

export interface AMLReport {
  period: { start: string; end: string };
  summary: {
    totalAlerts: number;
    pendingReview: number;
    reviewed: number;
    dismissed: number;
    highSeverity: number;
    mediumSeverity: number;
  };
  byRule: Record<AMLRule, number>;
  daily: Array<{ date: string; alerts: number }>;
}

export interface AMLAlertFilter {
  status?: AMLAlertStatus;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

const defaultConfig: AMLConfig = {
  singleTransactionThresholdXaf: Number(
    process.env.AML_SINGLE_TRANSACTION_THRESHOLD_XAF || 1_000_000,
  ),
  dailyTotalThresholdXaf: Number(
    process.env.AML_DAILY_TOTAL_THRESHOLD_XAF || 5_000_000,
  ),
  rollingWindowHours: Number(process.env.AML_ROLLING_WINDOW_HOURS || 24),
  rapidWindowMinutes: Number(process.env.AML_RAPID_WINDOW_MINUTES || 15),
  rapidTransactionCount: Number(process.env.AML_RAPID_TRANSACTION_COUNT || 3),
  structuringFloorXaf: Number(process.env.AML_STRUCTURING_FLOOR_XAF || 100_000),
  alertBufferSize: Number(process.env.AML_ALERT_BUFFER_SIZE || 5000),
};

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function safeDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export class AMLService {
  private readonly config: AMLConfig;
  private alerts: AMLAlert[] = [];

  constructor(config?: Partial<AMLConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  getConfig(): AMLConfig {
    return { ...this.config };
  }

  getLookbackWindowStart(now: Date): Date {
    return new Date(
      now.getTime() - this.config.rollingWindowHours * 60 * 60 * 1000,
    );
  }

  private getRapidWindowStart(now: Date): Date {
    return new Date(now.getTime() - this.config.rapidWindowMinutes * 60 * 1000);
  }

  async fetchRecentTransactions(
    userId: string,
    since: Date,
    excludeTransactionId?: string,
  ): Promise<AMLTransactionRecord[]> {
    const query = `
      SELECT
        id,
        user_id AS "userId",
        type,
        amount::text AS amount,
        status,
        created_at AS "createdAt"
      FROM transactions
      WHERE user_id = $1
        AND created_at >= $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      ORDER BY created_at DESC
    `;

    const result = await pool.query<{
      id: string;
      userId: string;
      type: AMLTransactionType;
      amount: string;
      status: string;
      createdAt: Date;
    }>(query, [userId, since, excludeTransactionId ?? null]);

    return result.rows
      .map((row) => ({
        id: row.id,
        userId: row.userId,
        type: row.type,
        amount: Number(row.amount),
        status: row.status,
        createdAt: safeDate(row.createdAt),
      }))
      .filter((row) => Number.isFinite(row.amount) && row.amount >= 0);
  }

  evaluateTransaction(
    current: AMLTransactionRecord,
    recentTransactions: AMLTransactionRecord[],
  ): AMLMonitoringResult {
    const ruleHits: AMLRuleHit[] = [];
    const lookbackStart = this.getLookbackWindowStart(current.createdAt);
    const windowTxs = recentTransactions.filter(
      (tx) => tx.createdAt >= lookbackStart,
    );

    if (current.amount > this.config.singleTransactionThresholdXaf) {
      ruleHits.push({
        rule: "single_transaction_threshold",
        message: `Single transaction amount ${current.amount} XAF exceeds ${this.config.singleTransactionThresholdXaf} XAF`,
        observed: current.amount,
        threshold: this.config.singleTransactionThresholdXaf,
      });
    }

    const rollingTotal =
      windowTxs.reduce((sum, tx) => sum + tx.amount, 0) + current.amount;
    if (rollingTotal > this.config.dailyTotalThresholdXaf) {
      ruleHits.push({
        rule: "daily_total_threshold",
        message: `Rolling 24h total ${rollingTotal} XAF exceeds ${this.config.dailyTotalThresholdXaf} XAF`,
        observed: rollingTotal,
        threshold: this.config.dailyTotalThresholdXaf,
      });
    }

    const rapidWindowStart = this.getRapidWindowStart(current.createdAt);
    const rapidWindowTxs = windowTxs.filter((tx) => tx.createdAt >= rapidWindowStart);
    const rapidSet = [...rapidWindowTxs, current];
    const rapidCount = rapidSet.length;
    const hasDeposit = rapidSet.some((tx) => tx.type === "deposit");
    const hasWithdraw = rapidSet.some((tx) => tx.type === "withdraw");
    const structuringTxs = rapidSet.filter(
      (tx) =>
        tx.amount >= this.config.structuringFloorXaf &&
        tx.amount < this.config.singleTransactionThresholdXaf,
    );

    if (
      rapidCount >= this.config.rapidTransactionCount &&
      hasDeposit &&
      hasWithdraw &&
      structuringTxs.length >= this.config.rapidTransactionCount
    ) {
      ruleHits.push({
        rule: "rapid_structuring",
        message: `Rapid in/out pattern detected (${rapidCount} tx in ${this.config.rapidWindowMinutes}m)`,
        observed: rapidCount,
        threshold: this.config.rapidTransactionCount,
      });
    }

    if (ruleHits.length === 0) {
      return { flagged: false, ruleHits: [] };
    }

    const severity: AMLAlertSeverity = ruleHits.some(
      (hit) =>
        hit.rule === "single_transaction_threshold" ||
        hit.rule === "daily_total_threshold",
    )
      ? "high"
      : "medium";

    const nowIso = new Date().toISOString();
    const alert: AMLAlert = {
      id: crypto.randomUUID(),
      transactionId: current.id,
      userId: current.userId,
      severity,
      status: "pending_review",
      ruleHits,
      reasons: ruleHits.map((hit) => hit.message),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.recordAlert(alert);
    this.logAlert(alert, current);

    return { flagged: true, alert, ruleHits };
  }

  async monitorTransaction(
    transaction: AMLTransactionRecord,
  ): Promise<AMLMonitoringResult> {
    const since = this.getLookbackWindowStart(transaction.createdAt);
    const recent = await this.fetchRecentTransactions(
      transaction.userId,
      since,
      transaction.id,
    );
    return this.evaluateTransaction(transaction, recent);
  }

  getAlerts(filter?: AMLAlertFilter): AMLAlert[] {
    const startMs = filter?.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const endMs = filter?.endDate?.getTime() ?? Number.POSITIVE_INFINITY;

    return this.alerts
      .filter((alert) => {
        if (filter?.status && alert.status !== filter.status) return false;
        if (filter?.userId && alert.userId !== filter.userId) return false;
        const ts = safeDate(alert.createdAt).getTime();
        return ts >= startMs && ts <= endMs;
      })
      .sort(
        (a, b) =>
          safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime(),
      );
  }

  getPendingReviewAlerts(): AMLAlert[] {
    return this.getAlerts({ status: "pending_review" });
  }

  reviewAlert(alertId: string, input: AMLReviewInput): AMLAlert | null {
    const idx = this.alerts.findIndex((alert) => alert.id === alertId);
    if (idx === -1) return null;

    const nowIso = new Date().toISOString();
    const updated: AMLAlert = {
      ...this.alerts[idx],
      status: input.status,
      reviewedBy: input.reviewedBy,
      reviewNotes: input.reviewNotes,
      reviewedAt: nowIso,
      updatedAt: nowIso,
    };
    this.alerts[idx] = updated;
    return updated;
  }

  generateReport(startDate: Date, endDate: Date): AMLReport {
    const alerts = this.getAlerts({ startDate, endDate });
    const summary = {
      totalAlerts: alerts.length,
      pendingReview: alerts.filter((a) => a.status === "pending_review").length,
      reviewed: alerts.filter((a) => a.status === "reviewed").length,
      dismissed: alerts.filter((a) => a.status === "dismissed").length,
      highSeverity: alerts.filter((a) => a.severity === "high").length,
      mediumSeverity: alerts.filter((a) => a.severity === "medium").length,
    };

    const byRule: Record<AMLRule, number> = {
      single_transaction_threshold: 0,
      daily_total_threshold: 0,
      rapid_structuring: 0,
    };

    const dailyMap = new Map<string, number>();
    for (const alert of alerts) {
      for (const hit of alert.ruleHits) {
        byRule[hit.rule] += 1;
      }
      const key = toISODate(safeDate(alert.createdAt));
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }

    const daily = [...dailyMap.entries()]
      .map(([date, count]) => ({ date, alerts: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      period: { start: toISODate(startDate), end: toISODate(endDate) },
      summary,
      byRule,
      daily,
    };
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  private recordAlert(alert: AMLAlert): void {
    this.alerts.unshift(alert);
    if (this.alerts.length > this.config.alertBufferSize) {
      this.alerts = this.alerts.slice(0, this.config.alertBufferSize);
    }
  }

  private logAlert(alert: AMLAlert, transaction: AMLTransactionRecord): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "WARN",
      type: "AML_ALERT",
      alertId: alert.id,
      transactionId: alert.transactionId,
      userId: alert.userId,
      severity: alert.severity,
      amount: transaction.amount,
      rules: alert.ruleHits.map((hit) => hit.rule),
      reasons: alert.reasons,
    });
    console.warn(line);
  }
}

export const amlService = new AMLService();
