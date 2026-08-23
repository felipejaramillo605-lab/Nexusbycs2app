# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session

```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  auth_method: 'google',
  role: 'owner',
  active: true,
  access_status: 'approved',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API

```
# Auth endpoint
curl -X GET "$PREVIEW_URL/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Origin: $PREVIEW_URL" -H "Sec-Fetch-Site: same-origin"
```

## Step 3: Browser Testing

Set cookie `session_token` with `httpOnly=true`, `secure=true`, `sameSite=None`, navigate to `/manager/dashboard`.

## Checklist
- [ ] `user_id` custom UUID (never `_id`)
- [ ] Session user_id matches user_id exactly
- [ ] All queries use `{"_id": 0}` projection
- [ ] Backend accepts either cookie or Authorization header
- [ ] AuthCallback processes `session_id` in URL hash BEFORE `/auth/me` check
- [ ] Origin header always sent (Sec-Fetch-Site: same-origin)

## Notes for Nexus by CS2
- Existing manual auth (email+password) MUST keep working (`POST /api/auth/login`, `auth_method="manual"`)
- Google new users are created with `auth_method="google"`, `access_status="pending"`
- Users matched by email (case-insensitive) reuse existing user_id
- After callback → navigate to `/manager/dashboard` (owner) or `/staff/appointments` (staff)
