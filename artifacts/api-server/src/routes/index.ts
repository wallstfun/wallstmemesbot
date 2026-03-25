import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tweetsRouter from "./tweets";
import tokensRouter from "./tokens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tweetsRouter);
router.use("/tokens", tokensRouter);

export default router;
