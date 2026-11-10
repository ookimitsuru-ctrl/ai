import type { Env as AppEnv } from "./types";

declare global {
  namespace Cloudflare {
    // `import { env } from "cloudflare:workers"` の型。テストでも使う。
    interface Env extends AppEnv {}
  }
}
