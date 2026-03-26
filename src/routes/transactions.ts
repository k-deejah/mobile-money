import { Router } from "express";
import {
  cancelTransactionHandler,
  depositHandler,
  getTransactionHandler,
  getTransactionHistoryHandler,
  listAmlAlertsHandler,
  patchMetadataHandler,
  reviewAmlAlertHandler,
  searchTransactionsHandler,
  updateNotesHandler,
  updateMetadataHandler,
  deleteMetadataKeysHandler,
  searchByMetadataHandler,
  withdrawHandler,
} from "../controllers/transactionController";
import { validateTransaction } from "../middleware/validateTransaction";
import { TimeoutPresets, haltOnTimedout } from "../middleware/timeout";
import { requireAuth } from "../middleware/auth";

export const transactionRoutes = Router();

transactionRoutes.get(
  "/",
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHistoryHandler,
);

transactionRoutes.get(
  "/search",
  TimeoutPresets.quick,
  haltOnTimedout,
  searchTransactionsHandler,
);

transactionRoutes.get(
  "/aml/alerts",
  requireAuth,
  TimeoutPresets.quick,
  haltOnTimedout,
  listAmlAlertsHandler,
);

transactionRoutes.patch(
  "/aml/alerts/:alertId/review",
  requireAuth,
  TimeoutPresets.quick,
  haltOnTimedout,
  reviewAmlAlertHandler,
);

transactionRoutes.post(
  "/deposit",
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  depositHandler
);

transactionRoutes.post(
  "/withdraw",
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  withdrawHandler
);

transactionRoutes.get(
  "/:id",
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHandler
);

transactionRoutes.post(
  "/:id/cancel",
  TimeoutPresets.quick,
  haltOnTimedout,
  cancelTransactionHandler,
);

transactionRoutes.patch(
  "/:id/notes",
  TimeoutPresets.quick,
  haltOnTimedout,
  updateNotesHandler,
);

// Replace metadata
transactionRoutes.put(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  updateMetadataHandler,
);

// Merge metadata keys
transactionRoutes.patch(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  patchMetadataHandler,
);

// Delete metadata keys
transactionRoutes.delete(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  deleteMetadataKeysHandler,
);

// Search by metadata
transactionRoutes.post(
  "/search/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  searchByMetadataHandler,
);
