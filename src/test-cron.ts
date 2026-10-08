import { getActivePeriod, transitionToCurrentMonth } from './services/budget-period.service.js';
import { listActiveHouseholds } from './services/household.service.js';

const households = listActiveHouseholds();
console.log(`Активных household: ${households.length}`);

for (const h of households) {
  const active = getActivePeriod(h.id);
  console.log(`Household ${h.id}: активный период ${active?.year}-${active?.month}`);

  const result = transitionToCurrentMonth(h.id, h.timezone);
  console.log(`  transition: created=${result.created}`);
}
