# Setting Up Admin Role on MongoDB Atlas

If you are moving your database to MongoDB Atlas, follow these steps to ensure your admin account is correctly set up.

## Method 1: Using the Seed Script (Recommended)

1. Update your `.env` file with your Atlas connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/zoho
   ```
2. Run the seed script:
   ```powershell
   node seed_admin.js
   ```

## Method 2: Manual Update in Atlas UI

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Go to **Database** -> **Browse Collections**.
3. Locate the `users` collection in your `zoho` database.
4. Find your user (e.g., `admin@gmail.com`).
5. Click **Edit (pencil icon)**.
6. Add/Update the following:
   - **Field**: `role`
   - **Type**: `String`
   - **Value**: `admin`
7. Click **Update**.

## Pro-Tip: Fixing Existing Users
I have updated the dashboard to show **all users** except admins. Even if your old users don't have a `role` field yet, they will now show up correctly!
