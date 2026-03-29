/**
 * Example: PagerDuty Integration in Provider Operations
 * 
 * This file demonstrates how to integrate error tracking
 * into your existing provider client implementations.
 */

import { recordProviderError, recordProviderSuccess } from "../middleware/providerMetrics";

// ============================================================
// Example 1: Stripe Payment Processing
// ============================================================

export async function processStripePayment(
  customerId: string,
  amount: number,
  currency: string,
) {
  const provider = "stripe";
  const transactionType = "payment";

  try {
    // Call Stripe API
    const charge = await stripeClient.charges.create({
      customer: customerId,
      amount: Math.round(amount * 100), // cents
      currency,
    });

    // Record success
    recordProviderSuccess(provider, transactionType);

    return {
      success: true,
      transactionId: charge.id,
      status: charge.status,
    };
  } catch (error: any) {
    // Determine error type
    let errorType = "unknown";

    if (error.code === "card_declined") {
      errorType = "card_declined";
    } else if (error.code === "rate_limit") {
      errorType = "rate_limit";
    } else if (error.type === "StripeConnectionError") {
      errorType = "connection_error";
    } else if (error.code === "authentication_error") {
      errorType = "authentication_error";
    }

    // Record error (this contributes to PagerDuty alert threshold)
    recordProviderError(provider, transactionType, errorType);

    throw error;
  }
}

// ============================================================
// Example 2: Square Payout Processing
// ============================================================

export async function processSquarePayout(
  recipientId: string,
  amount: number,
) {
  const provider = "square";
  const transactionType = "payout";

  try {
    const payout = await squareClient.payouts.create({
      result_type: "ASYNC",
      payout: {
        amount_money: {
          amount: Math.round(amount * 100),
          currency: "USD",
        },
        recipient_id: recipientId,
        description: "Payout to recipient",
      },
    });

    recordProviderSuccess(provider, transactionType);

    return {
      success: true,
      payoutId: payout.payout.id,
      status: payout.payout.status,
    };
  } catch (error: any) {
    let errorType = "unknown";

    if (error.statusCode === 429) {
      errorType = "rate_limit";
    } else if (error.statusCode === 400) {
      errorType = "invalid_request";
    } else if (error.statusCode === 401) {
      errorType = "authentication_error";
    } else if (error.statusCode === 503) {
      errorType = "provider_unavailable";
    }

    recordProviderError(provider, transactionType, errorType);
    throw error;
  }
}

// ============================================================
// Example 3: Flutterwave Transaction with Retry Logic
// ============================================================

export async function processFlutterwaveTransactionWithRetry(
  accountId: string,
  amount: number,
  currency: string,
  maxRetries: number = 3,
) {
  const provider = "flutterwave";
  const transactionType = "transaction";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transaction = await flutterwaveClient.Transfer.initiate({
        account_bank: accountId,
        amount_in_kobo: Math.round(amount * 100),
        currency,
        narration: "Mobile money transfer",
      });

      // Only record success if we actually succeeded
      recordProviderSuccess(provider, transactionType);

      return {
        success: true,
        transactionId: transaction.data.id,
        status: transaction.data.status,
      };
    } catch (error: any) {
      let errorType = "retry";

      if (attempt === maxRetries) {
        // Last attempt - record the error for alerting
        if (error.message?.includes("rate limit")) {
          errorType = "rate_limit";
        } else if (error.message?.includes("timeout")) {
          errorType = "timeout";
        } else if (error.response?.status === 401) {
          errorType = "authentication_error";
        }

        recordProviderError(provider, transactionType, errorType);
      }

      // Don't throw on intermediate retries
      if (attempt < maxRetries) {
        console.warn(
          `Flutterwave attempt ${attempt}/${maxRetries} failed, retrying...`,
        );
        await new Promise((r) => setTimeout(r, 1000 * attempt)); // exponential backoff
      } else {
        throw error;
      }
    }
  }
}

// ============================================================
// Example 4: Multi-Provider Fallback with Error Tracking
// ============================================================

export async function processPaymentWithFallback(
  customerId: string,
  amount: number,
  currency: string,
) {
  const providers = ["stripe", "square", "paypal"];

  for (const provider of providers) {
    try {
      switch (provider) {
        case "stripe":
          return await processStripePayment(customerId, amount, currency);

        case "square":
          return await processSquarePayout(customerId, amount);

        case "paypal":
          return await processPaypalPayment(customerId, amount, currency);
      }
    } catch (error) {
      console.warn(
        `Payment processing failed with ${provider}, trying next provider...`,
      );

      // Continue to next provider
      continue;
    }
  }

  throw new Error("All payment providers failed");
}

// ============================================================
// Example 5: Batch Processing with Error Aggregation
// ============================================================

export async function processBatchTransfers(
  transfers: Array<{ recipientId: string; amount: number }>,
  provider: string = "stripe",
) {
  const transactionType = "payment";
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as Array<{ recipientId: string; error: string }>,
  };

  for (const transfer of transfers) {
    try {
      switch (provider) {
        case "stripe":
          await processStripePayment(transfer.recipientId, transfer.amount, "USD");
          recordProviderSuccess(provider, transactionType);
          results.successful++;
          break;

        case "square":
          await processSquarePayout(transfer.recipientId, transfer.amount);
          recordProviderSuccess(provider, transactionType);
          results.successful++;
          break;
      }
    } catch (error: any) {
      recordProviderError(provider, transactionType, error.code || "unknown");
      results.failed++;
      results.errors.push({
        recipientId: transfer.recipientId,
        error: error.message,
      });
    }
  }

  return results;
}

// ============================================================
// How Error Rates Trigger Alerts
// ============================================================

/**
 * SCENARIO 1: Provider API degradation
 * 
 * Time    Errors  Total   Rate    Alert?
 * 00:00   0       100     0%      ❌
 * 00:30   5       100     5%      ❌
 * 01:00   10      100     10%     ❌
 * 01:30   16      100     16%     ✅ CRITICAL ALERT SENT
 * 01:35   30      200     15%     ✅ (still above threshold)
 * 02:00   20      200     10%     ❌ AUTO-RESOLVED
 * 
 * The MonitoringService checks every 30 seconds and compares
 * error rates within the 5-minute sliding window.
 */

/**
 * SCENARIO 2: Intermittent errors (no false positives)
 * 
 * Time    Errors  Total   Rate    Alert?
 * 00:00   0       1000    0%      ❌
 * 00:30   3       1000    0.3%    ❌
 * 01:00   5       1000    0.5%    ❌  <- Normal transient errors
 * 01:30   8       1000    0.8%    ❌
 * 02:00   10      1000    1%      ❌  <- Never reaches 15% threshold
 * 
 * The 15% threshold prevents alerting on normal error rates.
 */

/**
 * SCENARIO 3: Rapid recovery
 * 
 * Time    Errors  Total   Rate    Alert?
 * 00:00   0       100     0%      ❌ Normal
 * 00:30   20      100     20%     ✅ ALERT! (>15%)
 * 01:00   22      500     4.4%    ❌ AUTO-RESOLVED (dropped below 15%)
 * 
 * Auto-resolution means no manual intervention needed
 * when provider recovers automatically.
 */

// ============================================================
// Integration Points
// ============================================================

/**
 * These error tracking calls happen at:
 * 
 * 1. Provider API calls fail/succeed
 *    - recordProviderSuccess/Error() called
 * 
 * 2. Every 30 seconds, MonitoringService evaluates:
 *    - Reads transaction_errors_total counter from Prometheus
 *    - Reads transaction_total counter from Prometheus
 *    - Calculates error rate in last 5 minutes
 *    - Compares against 15% threshold
 * 
 * 3. If threshold crossed:
 *    - PagerDutyService builds incident payload
 *    - Calls PagerDuty Events API V2
 *    - On-call engineer receives alert
 * 
 * 4. If error rate recovers:
 *    - PagerDutyService builds resolution payload
 *    - Calls PagerDuty Events API V2 with "resolve" action
 *    - Incident automatically marked resolved
 */

// ============================================================
// Monitoring Your Metrics
// ============================================================

import { MonitoringService } from "../services/monitoringService";

// Periodically check metrics (for logging/debugging)
export function logProviderMetrics() {
  const metrics = MonitoringService.getProviderMetrics();

  for (const metric of metrics) {
    const alertStatus = metric.errorRate > 0.15 ? "🚨 ALERTING" : "✅ OK";
    console.log(
      `${alertStatus} ${metric.provider}: ${(metric.errorRate * 100).toFixed(2)}% ` +
        `(${metric.errorCount}/${metric.totalCount} errors)`,
    );
  }
}

// Example output:
// ✅ OK stripe: 0.50% (1/200 errors)
// ✅ OK square: 2.00% (4/200 errors)
// 🚨 ALERTING flutterwave: 18.00% (18/100 errors)
