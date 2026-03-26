import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tweetsRouter from "./tweets";
import heliusRouter from "./helius-transactions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tweetsRouter);
router.use(heliusRouter);

export default router;
