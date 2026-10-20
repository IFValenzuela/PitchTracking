// Route table.
import { homeView } from './home.js';
import { settingsView } from './settings.js';
import { onboardingView } from './onboarding.js';
import { labView } from './lab.js';
import { gymView } from './gym.js';
import { progressView } from './progress.js';
import { eyecheckView } from './eyecheck.js';

export const routes = {
  home: homeView,
  lab: labView,
  gym: gymView,
  progress: progressView,
  settings: settingsView,
  onboarding: onboardingView,
  eyecheck: eyecheckView,
};
