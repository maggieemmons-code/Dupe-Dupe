# Supabase email templates

The sign-in emails Supabase sends, in the black and white look from `DESIGN.md`. Supabase doesn't read these files: they're kept here so the wording and links are saved in the repo. To change an email, edit the file here, then paste it into Supabase again.

| File | Supabase template | Subject | When it's sent |
| --- | --- | --- | --- |
| `magic_link.html` | Magic link | Your Dupe Dupe sign-in link | Every sign-in after the first |
| `confirm_signup.html` | Confirm sign up | Welcome to Dupe Dupe | A friend's very first sign-in |
| `invite_user.html` | Invite user | You're invited to Dupe Dupe | Only when Maggie uses "Invite user" in Supabase |
| `change_email.html` | Change email address | Confirm your new email for Dupe Dupe | Not used yet (no way to change email in the app) |
| `reset_password.html` | Reset password | Reset your Dupe Dupe password | Not used (Dupe Dupe has no passwords) |
| `reauthentication.html` | Reauthentication | Your Dupe Dupe code | Not used yet |

## Links must keep this exact shape

Sign-in works through `/auth/confirm` with a one-time token, so a link asked for on a laptop still works on a phone (`NOTES.md` › Phase 1). Don't switch these to `{{ .ConfirmationURL }}`.

- Magic link and Confirm sign up: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. `RedirectTo` is the `/auth/confirm` address the app sends.
- Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. Invites sent from the dashboard don't come through the app, so they use the Site URL.
- Change email: `type=email_change`. Reset password: `type=recovery`. Both use the Site URL too.

## Pasting them into Supabase

1. Open https://supabase.com/dashboard/project/_/auth/templates and pick the Dupe Dupe project.
2. Click a template's tab, for example **Magic link**.
3. Replace the **Subject** with the one in the table above.
4. In the message box, select everything and delete it. If you see a **Source** tab, use that, not **Preview**.
5. Open the matching `.html` file here in TextEdit, select all, copy, and paste it into the message box.
6. Click **Save changes**.
7. Repeat for each template.

Then check two settings:

- **Authentication › URL Configuration › Site URL** must be the live address (`https://dupe-dupe.vercel.app`, or `https://dupedupe.studio` once that domain points at the app). The invite link depends on it.
- **Authentication › Sign In / Providers › Email** (or Settings): the email OTP expiration. The magic link and reset emails say "expires in 1 hour," which matches the default of 3600 seconds. Update the wording if that setting is different.

Leave the **Security notifications** (password changed, email changed and so on) off. Dupe Dupe has no passwords, phone numbers or two-factor sign-in, so they'd never fire.

## Testing

Sign out, then sign in with one of the `+test` Gmail addresses. The email should arrive in the new look, and tapping the button should land you signed in on the home screen. Try it once on your phone with a link you asked for on your laptop.

## Inviting with the Invite user email

To send a friend the invite email instead of telling them yourself:

1. Add their email to the invite list first, in the SQL Editor: `insert into public.invites (email) values ('friend@example.com');`. Without this, the database's invite-only gatekeeper blocks the invite.
2. In Supabase, go to **Authentication › Users**, click **Add user** › **Send invitation**, type their email and send.
