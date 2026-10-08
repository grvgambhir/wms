# AWS setup, step by step

Written for someone who has not used AWS before. Every step names the exact page and the
exact button. Nothing here is guesswork — if a screen does not match, stop and ask rather
than clicking something that looks similar.

Our region is **Europe (Stockholm) / `eu-north-1`**. Our user pool is **`wms`**, id
`eu-north-1_eLAmBFEkU`. Check the region in the **top-right of the AWS console** before every
task — AWS shows you a *different, empty* console if you are in the wrong region, and it looks
exactly like "everything is gone".

---

## Task 1 — Turn on SRP sign-in for the admin app client

**Why:** the admin portal signs in with SRP (a method where the password never leaves the
browser in plain form). If the app client does not allow it, sign-in fails with a confusing
"Could not sign in", even when the password is correct. The participant client already has it.

1. Go to **Amazon Cognito** → **User pools** → click **wms**.
2. In the left sidebar, under **Applications**, click **App clients**.
3. Click the client named **`wms_admin`**.
4. Find the **Authentication flows** section and click **Edit** on it.
   *(It may sit under a "Login pages" or "App client information" panel depending on the
   console version — it is the box that lists `ALLOW_...` checkboxes.)*
5. Tick these two:
   - **ALLOW_USER_SRP_AUTH** — what the admin portal actually uses.
   - **ALLOW_REFRESH_TOKEN_AUTH** — without it the user is thrown out the moment the access
     token expires (an hour), instead of being renewed silently.
6. Optionally tick **ALLOW_USER_PASSWORD_AUTH**. This is only so the developer script
   `npm run token -- <email> <password> admin` works from the terminal. It sends the password
   to AWS over TLS, which is fine for a dev pool. If you would rather not, leave it off — the
   portal does not need it.
7. **Save changes.**

**How you know it worked:** sign in at `http://localhost:5173` with a confirmed Cognito user.
"Could not sign in" should be gone.

---

## Task 2 — An IAM user so the backend can create invited users

**Why:** so far every Cognito call the backend makes is authorised by *the end user's own
token* — the user proves who they are, the backend just forwards it. `AdminCreateUser` is
different: nobody is signed in yet. The **backend itself** must be authorised, and in AWS that
means an IAM identity with its own credentials.

**IAM** is where AWS keeps identities and permissions. A **policy** is a list of what is
allowed. We give this identity exactly one permission on exactly one pool — if these keys ever
leak, the worst anyone can do is create users in our dev pool.

### 2a. Create the policy

1. Go to **IAM** (search "IAM" in the top search bar). IAM has **no region** — it is global,
   so the region selector does not apply here.
2. Left sidebar → **Policies** → **Create policy**.
3. Click the **JSON** tab and replace everything in the box with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InviteOcUsers",
      "Effect": "Allow",
      "Action": "cognito-idp:AdminCreateUser",
      "Resource": "arn:aws:cognito-idp:eu-north-1:337820987578:userpool/eu-north-1_eLAmBFEkU"
    }
  ]
}
```

That `Resource` line is the whole point. `"Resource": "*"` would let these keys touch every
pool in the account; naming one pool means they cannot.

4. **Next** → Policy name: **`wms-backend-invite`** → **Create policy**.

### 2b. Create the user

1. IAM → **Users** → **Create user**.
2. User name: **`wms-backend`**.
3. **Do NOT tick** "Provide user access to the AWS Management Console". This identity is for a
   program, not a person — it should never be able to log into the console at all.
4. **Next** → **Attach policies directly** → search **`wms-backend-invite`** → tick it.
5. **Next** → **Create user**.

### 2c. Create the access key

1. Click the **`wms-backend`** user → **Security credentials** tab.
2. Scroll to **Access keys** → **Create access key**.
3. Use case: **Application running outside AWS** → **Next** → **Create access key**.
4. You now see **Access key ID** and **Secret access key**.
   **The secret is shown once and never again.** Copy both now.

### 2d. Put them in the backend's `.env`

Open `wms_backend/.env` and add:

```
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=<the access key id>
AWS_SECRET_ACCESS_KEY=<the secret>
```

**Only in `.env`.** Never in a source file, never in `.env.example`, never in a commit.
`.env` is git-ignored; that is the only reason this is safe.

If a key is ever pasted somewhere public: IAM → Users → `wms-backend` → Security credentials
→ **Deactivate** then **Delete** the key, and create a new one. Deleting the key is instant
and total — do that first and worry about the cause afterwards.

---

## Task 3 — Check email delivery with a real inbox

**Why:** a sign-up test to a disposable address (`uberip.com`, `mailinator.com` and similar)
proves nothing. Those domains are widely blocked, and a bounce there looks identical to a
broken pool.

1. On `http://localhost:8081`, sign up with **your own Gmail**.
2. The code should arrive within a minute. Check spam.
3. If it does arrive, email is fine and nothing needs doing.
4. If it does not, then check Cognito → **wms** → **Messaging**: whether the pool sends
   **with Cognito** (the built-in sender, capped at **50 emails a day**) or **with SES**.
   50/day is plenty for OC invites and for testing. It is *not* enough for 14,000 athletes —
   that is what SES is for, and it is a separate, later task.

---

## The two Cognito emails are not the same email

This trips people up, so it is worth being explicit.

| | Sent when | Contains |
|---|---|---|
| **Verification message** | someone signs themselves up | a **6-digit code** |
| **User invitation message** | an admin creates them (`AdminCreateUser`) | their **username + a temporary password** |

Different templates, different triggers. Turning one on does not turn the other on, and an
invited user never receives a 6-digit code. On first sign-in they use the temporary password,
and Cognito immediately requires them to choose a real one.

---

## Task 4 — When an invitation email never arrives

The symptom that leads here: the user **exists** in Cognito with status
**`Force change password`** and `Email verified = Yes`, the backend recorded them, the role is
attached — and no email reached the inbox. That combination means `AdminCreateUser` succeeded
and the *delivery* is what failed. Nothing in our code can cause it; the setting is on the pool.

### Step 1 — Find out which sender the pool uses

1. **Cognito** → **User pools** → **wms** → the **Messaging** tab.
2. Look at the **Email** panel. It says one of two things:
   - **"Send email with Cognito"** — the built-in sender. Goes to any address, **capped at 50
     emails per day** across the whole pool.
   - **"Send email with Amazon SES"** — our SES account is the sender.

**This one line explains almost every missing email**, and the two cases have different fixes.

### Step 2a — If it says "Send email with Amazon SES"

This is very likely the answer, and here is why it fits: **SES starts every new account in
"sandbox" mode, and a sandbox account can only send to addresses you have verified.** An
address that is not on that list gets nothing — no bounce shown to you, no error from
Cognito, because Cognito's call to SES succeeded. It is the single most confusing failure in
AWS email.

Check it:

1. Go to **Amazon SES** (search "SES") → make sure the region reads **Europe (Stockholm)**.
2. Left sidebar → **Account dashboard**. Near the top it either says your account is **in the
   sandbox**, or that you have production access.
3. Left sidebar → **Identities**. This is the list of addresses that *can* receive mail while
   in the sandbox.

If your own address is on that list and the invited person's is not, that is your answer.

**Two ways forward:**

- **For now (dev):** SES → **Identities** → **Create identity** → **Email address** → enter
  the invited person's address → they get a "verify this email" mail from AWS → they click
  it. Now Cognito's mail will reach them. Do this per address. Tedious, but instant.
- **Properly (before launch):** SES → Account dashboard → **Request production access**. AWS
  asks what you send and how you handle bounces; approval usually takes a day. After that,
  any address works. This is needed for athletes anyway — 14,000 people cannot each be
  verified by hand.

### Step 2b — If it says "Send email with Cognito"

Then delivery is not address-restricted, and it is one of:

- **The 50/day cap.** It counts every email the pool sends — sign-up codes, password resets,
  invitations. A day of testing reaches it quickly, and once hit, sends simply stop until
  UTC midnight.
- **Spam.** The sender is `no-reply@verificationemail.com`, which Gmail files as spam or
  Promotions more often than not. Search the mailbox for `verificationemail` rather than
  scrolling the inbox.

Switching to SES is the fix for the cap — but read 2a first, because SES brings the sandbox
restriction with it.

### Step 3 — Check the template exists

**Messaging** → **Message templates** → **User invitation message**. It should have a subject
and a body containing `{username}` and `{####}` (the temporary password). If someone edited
it and removed `{####}`, the mail sends but is useless.

Note this is a **different template** from **Verification message**, which is the one that
sends 6-digit sign-up codes. The sign-up codes arriving does **not** prove invitations work —
they are separate templates and, if the pool uses SES, the same sandbox restriction applies
to both but you may have verified only your own address.

### Step 4 — Once email works, resend

Do not delete and re-create the person: their `idp_subject` is already recorded in our
database and a new Cognito user would have a different `sub`, orphaning the row.
Use the **Resend invite** action in the admin portal, which calls `AdminCreateUser` again with
`MessageAction: 'RESEND'` — same user, same `sub`, new temporary password, fresh email.

---

## Task 5 — Two more IAM actions (for purge and for MFA)

Two later tasks each need one more Cognito permission. Both go on the **same** policy
(`wms-backend-invite`) and the **same** single-pool `Resource` — do not create a second policy
and do not widen `Resource` to `*`.

| Action | Needed by | What it lets the backend do |
|---|---|---|
| `cognito-idp:AdminDeleteUser` | Purge invited user | Remove a pool user who never signed in and has no records |
| `cognito-idp:AdminSetUserMFAPreference` | MFA reset | Clear a locked-out OC user's authenticator so they can enrol again |
| `cognito-idp:AdminUserGlobalSignOut` | MFA enrol | Invalidate refresh tokens issued before TOTP enrolment |

**How to apply:**

1. **IAM** → **Policies** → search **`wms-backend-invite`** → click it.
2. **Permissions** tab → **Edit** → **JSON** tab.
3. Replace the whole document with this, then **Next** → **Save changes**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageOcUsers",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminSetUserMFAPreference",
        "cognito-idp:AdminUserGlobalSignOut"
      ],
      "Resource": "arn:aws:cognito-idp:eu-north-1:337820987578:userpool/eu-north-1_eLAmBFEkU"
    }
  ]
}
```

`AdminCreateUser` with `MessageAction: "RESEND"` — the resend-invite flow — is the **same**
action, so resending needs no new permission.

**Why this list stays short.** Each of these lets the backend act on a user account without
anyone being signed in, so each is a thing the service can do that a person did not ask for.
Three is the whole set it needs; if a task asks for a fourth, that is a conversation, not a
policy edit.

If an agent reports `AccessDeniedException` on one of these, that is the expected failure until
you apply the policy above — not a bug in their code.

### One MFA setting, and it is not IAM

**Cognito** → **User pools** → **wms** → **Sign-in** (or **MFA** depending on console version)
→ set multi-factor authentication to **Optional**, with **Authenticator apps (TOTP)** enabled.

Not "Required". The pool setting applies to **every** user in it, and both apps share this pool
— "Required" would force MFA on all 14,000 athletes. OC users are held to MFA by our own code,
which knows from `core.person_role` who is privileged. Cognito provides the mechanism; the rule
lives with us.
