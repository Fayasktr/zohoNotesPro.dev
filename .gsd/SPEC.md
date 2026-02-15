# Specification: Google Authentication & User Management

**Status**: FINALIZED

## Overview
Enhance the existing Google Authentication implementation and manage user properties for social logins.

## Requirements
1. **Google Authentication Integration**: Ensure the application correctly uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env`.
2. **User Model Update**: Add a field `isGoogleAuth` (boolean, default: false) to the `User` model to explicitly track social sign-ups.
3. **Password Change Restriction**: Users authenticated via Google (where `isGoogleAuth` is true) should be prevented from changing or setting a password through standard password management routes.
4. **Login Flow Update**: When a user logs in via Google, the `isGoogleAuth` field should be set to `true`.

## Constraints
- Do not break existing local login functionality.
- Ensure session persistence works correctly for both auth types.
- Maintain CSRF protection.
