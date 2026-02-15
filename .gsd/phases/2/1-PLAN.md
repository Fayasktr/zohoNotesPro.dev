---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Model and Auth Strategy Update

## Objective
Add `isGoogleAuth` field to User model and update Passport strategy.

## Context
- .gsd/SPEC.md
- models/User.js
- app.js

## Tasks

<task type="auto">
  <name>Update User Schema</name>
  <files>models/User.js</files>
  <action>
    Add `isGoogleAuth: { type: Boolean, default: false }` to the `userSchema`.
  </action>
  <verify>Check file content for `isGoogleAuth` field.</verify>
  <done>Field exists in `models/User.js`.</done>
</task>

<task type="auto">
  <name>Update Google Strategy</name>
  <files>app.js</files>
  <action>
    Modify the `GoogleStrategy` callback in `app.js` to:
    1. Set `isGoogleAuth: true` when creating a new user.
    2. Update `isGoogleAuth: true` for existing users login via Google if not already set.
  </action>
  <verify>Check `app.js` for `isGoogleAuth` assignment in GoogleStrategy.</verify>
  <done>Strategy updates `isGoogleAuth` field.</done>
</task>

## Success Criteria
- User model has `isGoogleAuth` field.
- Authentication via Google sets `isGoogleAuth` to true.
