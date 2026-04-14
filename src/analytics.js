/**
 * analytics.js
 * Initializes Vercel Analytics and Speed Insights for all pages
 */

import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel Analytics
inject();

// Initialize Vercel Speed Insights
injectSpeedInsights();
