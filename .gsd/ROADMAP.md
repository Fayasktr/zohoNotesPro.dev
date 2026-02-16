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
---

### Phase 3: Admin Analytics & User Interaction
**Status**: ✅ Complete
**Objective**: Implement a circle graph visualizing 3-day user activity and an interactive popup for user details.
**Depends on**: Phase 2

**Tasks**:
- [ ] Create API for 3-day activity stats (Active vs Inactive)
- [ ] Implement circle graph (Chart.js) in Admin Dashboard
- [ ] Add interactive popup for graph clicks
- [ ] Implement user list sorting (Last Used top) in popup

**Verification**:
- Verify activity stats match database records
- Verify graph interactivity and popup rendering
---

### Phase 4: Folder-level File Creation
**Status**: ⬜ Not Started
**Objective**: Setup a button/option within a folder to create a new file (note) directly inside that folder.
**Depends on**: Phase 3

**Tasks**:
- [ ] TBD (run /plan 4 to create)

**Verification**:
- TBD
