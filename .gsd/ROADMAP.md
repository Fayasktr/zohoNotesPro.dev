# Roadmap

## Milestone 1: Initial Mapping & Setup
- [x] Phase 1: Codebase Mapping

## Milestone 2: Authentication Enhancements

### Phase 2: Setup gAuth and Database Management
**Status**: ✅ Complete
**Objective**: Properly configure Google OAuth, update user schema, and restrict password changes for social users.
**Depends on**: Phase 1

**Tasks**:
- [ ] Implement `isGoogleAuth` field in `User` model
- [ ] Update Google Strategy callback to set `isGoogleAuth: true`
- [ ] Add backend logic/middleware to prevent password updates for Google users
- [ ] (Optional) Update UI to hide password fields for Google users

**Verification**:
- Verify `isGoogleAuth` is set on new Google signups
- Attempt to change password via API for a Google user and verify failure
- Confirm local users can still change passwords
