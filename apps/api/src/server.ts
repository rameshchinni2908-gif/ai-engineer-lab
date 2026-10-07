import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = await buildApp();
  if (process.env.SEED_DEMO_DATA === "true") {
    const { seedDemoData } = await import("./services/demo/bootstrap.js");
    await seedDemoData();
    app.log.info("Mock lab demo data ready");
  }
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`AI Engineer Lab API listening on http://localhost:${PORT}`);
}

main().catch((err: unknown) => {
  console.error("Fatal error starting API server:", err);
  process.exitCode = 1;
});
