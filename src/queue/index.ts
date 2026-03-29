import { rabbitMQManager } from "./rabbitmq";
import { transactionQueue } from "./transactionQueue";
import { closeWorker } from "./worker";

export async function shutdownQueue(): Promise<void> {
  console.log("Shutting down queues...");
import { transactionWorker, closeWorker } from "./worker";
import {
  providerBalanceAlertQueue,
  closeProviderBalanceAlertQueue,
  scheduleProviderBalanceAlertJob,
} from "./providerBalanceAlertQueue";
import {
  closeProviderBalanceAlertWorker,
  startProviderBalanceAlertWorker,
} from "./providerBalanceAlertWorker";
import { closeAccountMergeWorker } from "./accountMergeWorker";

export async function shutdownQueue(): Promise<void> {
  await closeProviderBalanceAlertWorker().catch(() => undefined);
  await closeProviderBalanceAlertQueue().catch(() => undefined);
  await closeAccountMergeWorker().catch(() => undefined);
  await closeWorker().catch(() => undefined);
  await transactionQueue.close().catch(() => undefined);
  await rabbitMQManager.close().catch(() => undefined);
}

export {
  transactionQueue,
  addTransactionJob,
  getJobById,
  getJobProgress,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  drainQueue,
} from "./transactionQueue";
export type {
  TransactionJobData,
  TransactionJobResult,
} from "./transactionQueue";
export { closeWorker };
export { transactionWorker, closeWorker };
export {
  scheduleProviderBalanceAlertJob,
  startProviderBalanceAlertWorker,
  closeProviderBalanceAlertWorker,
  providerBalanceAlertQueue,
  closeProviderBalanceAlertQueue,
};
export { createQueueDashboard } from "./dashboard";
export {
  getQueueHealth,
  pauseQueueEndpoint,
  resumeQueueEndpoint,
} from "./health";

export { queueOptions } from "./config";
export { deadLetterQueue, DLQ_NAME, capturePersistentFailure } from "./dlq";

// Account Merge Queue Exports
export {
  accountMergeQueue,
  addAccountMergeJob,
  addBatchAccountMergeJobs,
  getAccountMergeJobById,
  getAccountMergeQueueStats,
  pauseAccountMergeQueue,
  resumeAccountMergeQueue,
  drainAccountMergeQueue,
  closeAccountMergeQueue,
} from "./accountMergeQueue";
export type {
  AccountMergeJobData,
  AccountMergeJobResult,
} from "./accountMergeQueue";
export { accountMergeWorker, closeAccountMergeWorker } from "./accountMergeWorker";
