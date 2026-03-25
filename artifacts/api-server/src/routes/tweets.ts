import { Router } from "express";

const router = Router();

router.get("/tweets", async (_req, res) => {
  res.json({
    tweets: [],
    count: 0,
    source: "placeholder",
    message: "X Feed coming soon — tweets will appear here once @WallstM99224 starts posting"
  });
});

export default router;
