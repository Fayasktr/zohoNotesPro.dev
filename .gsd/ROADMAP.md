# Roadmap

## Milestone 1: Initial Mapping & Setup
- [x] Phase 1: Codebase Mapping

## Milestone 2: Authentication Enhancements

### Phase 2: Setup gAuth and Database Management
**Status**: ✅ Complete
**Objective**: Properly configure Google OAuth, update user schema, and restrict password changes for social users.
**Depends on**: Phase 1

**Tasks**:
- [x] Implement `isGoogleAuth` field in `User` model
- [x] Update Google Strategy callback to set `isGoogleAuth: true`
- [x] Add backend logic/middleware to prevent password updates for Google users
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
- [x] Create API for 3-day activity stats (Active vs Inactive)
- [x] Implement circle graph (Chart.js) in Admin Dashboard
- [x] Add interactive popup for graph clicks
- [x] Implement user list sorting (Last Used top) in popup

**Verification**:
- Verify activity stats match database records
- Verify graph interactivity and popup rendering
- Confirm user list sorting is correct

---

### Phase 4: Folder-level File Creation
**Status**: ✅ Complete
**Objective**: Setup a button/option within a folder to create a new file (note) directly inside that folder.
**Depends on**: Phase 3

**Tasks**:
- [x] Add Phase 4 to Roadmap
- [x] Research current folder/file creation logic
- [x] Implement plus-square button on folder items
- [x] Verify file creation logic

**Verification**:
- PASS (see VERIFICATION.md)

---

### Phase 5: Search Bar Relocation
**Status**: ✅ Complete
**Objective**: Move the sidebar search bar to the "New Folder" button's position and remove the "New Folder" button to streamline UI.
**Depends on**: Phase 4

---

### Phase 6: Note Label Search logic
**Status**: ✅ Complete
**Objective**: Implement search functionality for notes based on labels/tags at the current header search position.
**Depends on**: Phase 5
