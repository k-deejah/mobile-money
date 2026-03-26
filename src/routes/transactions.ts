import { Router } from "express";
import {
  depositHandler,
  withdrawHandler,
  getTransactionHandler,
  cancelTransactionHandler,
  validateTransaction,
  getTransactionHistoryHandler, // Added for pagination/filtering
  updateNotesHandler,
  searchTransactionsHandler,
  validateTransaction,
} from "../controllers/transactionController";
import { TimeoutPresets, haltOnTimedout } from "../middleware/timeout";
import { authenticateToken } from "../middleware/auth";
import { validateTransaction } from "../middleware/validateTransaction";

import { validateTransaction } from "../controllers/transactionController";

export const transactionRoutes = Router();

// --- Transaction History (New) ---
// GET /api/transactions
transactionRoutes.get(
  "/",
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHistoryHandler
);

// Deposit route
transactionRoutes.post(
  "/deposit",
  authenticateToken,
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  depositHandler,
);

// Withdraw route
transactionRoutes.post(
  "/withdraw",
  authenticateToken,
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  withdrawHandler,
);

// Get single transaction
transactionRoutes.get("/:id", TimeoutPresets.quick, haltOnTimedout, getTransactionHandler);
// Quick read operation
transactionRoutes.get(
  "/:id",
  authenticateToken,
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHandler,
);

// Notes and search
transactionRoutes.patch(
  "/:id/notes",
  authenticateToken,
  TimeoutPresets.quick,
  haltOnTimedout,
  updateNotesHandler,
);

transactionRoutes.get(
  "/search",
  authenticateToken,
  TimeoutPresets.quick,
  haltOnTimedout,
  searchTransactionsHandler,
);
