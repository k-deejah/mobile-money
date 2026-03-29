import { Router } from "express";

export function createQueueDashboard() {
  const router = Router();

  router.get("/", (req, res) => {
    res.send(`
      <h1>Queue Dashboard</h1>
      <p>The queue dashboard has been migrated to RabbitMQ.</p>
      <p>Please use the RabbitMQ Management UI to monitor queues.</p>
    `);
  createBullBoard({
    queues: [
      createQueueAdapter(),
      new BullMQAdapter(providerBalanceAlertQueue, {
        readOnlyMode: false,
      }),
      createQueueAdapter(transactionQueue),
      createQueueAdapter(deadLetterQueue),
    ],
    serverAdapter: serverAdapter,
    options: {
      uiConfig: {
        boardTitle: "Mobile Money Queue Dashboard",
      },
    },
  });

  return router;
}

