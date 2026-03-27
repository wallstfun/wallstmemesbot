import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tweetsRouter from "./tweets";
import heliusRouter from "./helius-transactions";
import heliusBalanceRouter from "./helius-balance";
import alchemyBalanceRouter from "./alchemy-balance";
import heliusHoldingsRouter from "./helius-holdings";
import tokenMetadataRouter from "./token-metadata";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tweetsRouter);
router.use(heliusRouter);
router.use(heliusBalanceRouter);
router.use(alchemyBalanceRouter);
router.use(heliusHoldingsRouter);
router.use(tokenMetadataRouter);

export default router;
