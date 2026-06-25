import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { featureRequestRouter } from "./routes/feature-requests/route";
import { githubRouter } from "./routes/github/route";


export const serverRouter = router({
  health: healthRouter,
  featureRequest: featureRequestRouter,
  github: githubRouter
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
