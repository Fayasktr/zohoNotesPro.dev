---
phase: 2
plan: 2
wave: 2
---

# Plan 2.2: Restrict Password Management

## Objective
Prevent users with `isGoogleAuth: true` from changing their passwords.

## Context
- .gsd/SPEC.md
- app.js

## Tasks

<task type="auto">
  <name>Block Forgot/Reset Password for Google Users</name>
  <files>app.js</files>
  <action>
    Update `/forgot-password` and `/reset-password` POST routes to check if the user has `isGoogleAuth: true`.
    If true, return an error message indicating that passwords cannot be changed for Google accounts.
  </action>
  <verify>Inspect `app.js` for conditional checks in password routes.</verify>
  <done>Routes block password updates for Google users.</done>
</task>

## Success Criteria
- Users with `isGoogleAuth` cannot reset passwords via the standard flow.
