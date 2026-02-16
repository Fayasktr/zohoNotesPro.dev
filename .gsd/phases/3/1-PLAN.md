---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Backend Analytics API

## Objective
Create the endpoints for activity statistics and active user lists.

## Tasks

<task type="auto">
  <name>Implement activity controllers</name>
  <files>controllers/adminController.js</files>
  <action>
    Add `getActivityStats` and `getActiveUsersList` functions.
    - `getActivityStats`: Count users with `lastActivity >= Date.now() - (3 * 24 * 60 * 60 * 1000)`.
    - `getActiveUsersList`: Find users with activity in 3 days, sort by `lastActivity` -1.
  </action>
  <verify>Check code for correct date calculations and Mongoose queries.</verify>
  <done>Controllers return correct JSON data.</done>
</task>

<task type="auto">
  <name>Register Admin Routes</name>
  <files>routes/adminRoutes.js</files>
  <action>
    Add `router.get('/activity-stats', adminController.getActivityStats);`
    Add `router.get('/active-users-list', adminController.getActiveUsersList);`
  </action>
  <verify>Check routes file for new endpoints.</verify>
  <done>Routes are accessible by administrators.</done>
</task>

## Success Criteria
- `/admin/activity-stats` returns active/inactive counts.
- `/admin/active-users-list` returns sorted user array.
