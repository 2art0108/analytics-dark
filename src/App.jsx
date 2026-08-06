import React from 'react';
import AnalyticsScreen from './screens/AnalyticsScreen.jsx';

/**
 * The prototype is one mounted experience: the Analytics screen owns its own
 * in-app navigation — period sheet, custom-date calendar, category details,
 * card picker and back navigation — plus the light/dark theme, which the
 * navigation-bar title toggles.
 */
export default function App() {
  return <AnalyticsScreen />;
}
