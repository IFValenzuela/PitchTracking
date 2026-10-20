// Shared application context, filled in by main.js at boot.
export const VERSION = '1.0.0';

export const app = {
  repo: null, // data/repo.js instance
  router: null, // ui/router.js instance
  testTrialCap: 0, // set only by automated browser tests
  testDrillSeconds: 0, // set only by automated browser tests
};
