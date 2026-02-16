---
phase: 3
plan: 2
wave: 2
---

# Plan 3.2: Frontend Dashboard Enhancements

## Objective
Integrate Chart.js and implement the interactive dashboard components.

## Tasks

<task type="auto">
  <name>Add Chart.js and Modal Structure</name>
  <files>views/admin/dashboard.hbs</files>
  <action>
    1. Add `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` to head or bottom.
    2. Add a `canvas` element inside a new glass-card in the stats section.
    3. Add HTML structure for the `activeUsersModal`.
  </action>
  <verify>Check HBS for canvas and modal elements.</verify>
  <done>UI elements exist on page.</done>
</task>

<task type="auto">
  <name>Implement Chart and Popup Logic</name>
  <files>views/admin/dashboard.hbs</files>
  <action>
    1. Fetch activity stats on load.
    2. Initialize donut chart.
    3. Add `onClick` handler to chart to call `showActiveUsersModal()`.
    4. Fetch active users list and render in modal.
  </action>
  <verify>Check JS section of HBS for chart initialization and fetch calls.</verify>
  <done>Chart is interactive and modal shows correct data.</done>
</task>

## Success Criteria
- Dashboard shows a donut chart of user activity.
- Clicking the chart displays a sorted list of active users in a popup.
