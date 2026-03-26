import { Router } from "express";
import { VersionedRequest } from "../../middleware/apiVersion";
import {
  listAmlAlertsHandler,
  depositHandler,
  withdrawHandler,
  getTransactionHandler,
  reviewAmlAlertHandler,
  updateNotesHandler,
  searchTransactionsHandler,
  listTransactionsHandler,
  updateMetadataHandler,
  patchMetadataHandler,
  deleteMetadataKeysHandler,
  searchByMetadataHandler,
} from "../../controllers/transactionController";
import { TimeoutPresets, haltOnTimedout } from "../../middleware/timeout";
import { validateTransactionFilters } from "../../utils/transactionFilters";
import { requireAuth } from "../../middleware/auth";

export const transactionRoutesV1 = Router();

// Deposit transaction route
transactionRoutesV1.post(
  "/deposit",
  TimeoutPresets.long,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    // Add API version to request for handler
    req.apiVersion = "v1";
    next();
  },
  depositHandler
);

// Withdraw transaction route
transactionRoutesV1.post(
  "/withdraw",
  TimeoutPresets.long,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  withdrawHandler
);

// List transactions with status filtering and pagination
transactionRoutesV1.get(
  "/",
  TimeoutPresets.quick,
  haltOnTimedout,
  validateTransactionFilters,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  listTransactionsHandler,
);

// Get specific transaction
transactionRoutesV1.get(
  "/aml/alerts",
  requireAuth,
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, _res, next) => {
    req.apiVersion = "v1";
    next();
  },
  listAmlAlertsHandler
);

transactionRoutesV1.patch(
  "/aml/alerts/:alertId/review",
  requireAuth,
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, _res, next) => {
    req.apiVersion = "v1";
    next();
  },
  reviewAmlAlertHandler
);

// Get specific transaction
transactionRoutesV1.get(
  "/:id",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  getTransactionHandler
);

// Update transaction notes
transactionRoutesV1.patch(
  "/:id/notes",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  updateNotesHandler
);

// Search transactions
transactionRoutesV1.get(
  "/search",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  searchTransactionsHandler
);

// Replace metadata
transactionRoutesV1.put(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  updateMetadataHandler,
);

// Merge metadata keys
transactionRoutesV1.patch(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  patchMetadataHandler,
);

// Delete metadata keys
transactionRoutesV1.delete(
  "/:id/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  deleteMetadataKeysHandler,
);

// Search by metadata
transactionRoutesV1.post(
  "/search/metadata",
  TimeoutPresets.quick,
  haltOnTimedout,
  (req: VersionedRequest, res, next) => {
    req.apiVersion = "v1";
    next();
  },
  searchByMetadataHandler,
);
