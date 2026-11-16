import type { HireMateApi } from "../shared/api";

declare global {
  interface Window {
    hiremate: HireMateApi;
  }
}
