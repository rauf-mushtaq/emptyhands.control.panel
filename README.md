# EmptyHands coach panel

The control panel for EmptyHands coaches: send notices to students, see who's registered, and publish each year's dojo calendar.

**Live at <https://rauf-mushtaq.github.io/emptyhands.control.panel/>**. The student side is in [emptyhands.student](https://github.com/rauf-mushtaq/emptyhands.student) (<https://rauf-mushtaq.github.io/emptyhands.student/>). Both use the same Firebase project.

| Tab | What it does |
| --- | --- |
| **Requests** | New student sign-ups. **Accept** adds them to the EmptyHands menu; **Decline** turns them away (you can still accept them later from *Students → Declined requests*). A badge and pop-up show new requests. |
| **EmptyHands menu** | **Private messages** with each accepted student and their family (unread replies are marked), plus the **Group chat** for everyone and the students' **Training journal**. Your messages show in bold; you can delete any message in the group chat or journal. |
| **Homework** | Set homework for everyone, a group or one student, with an optional due date. See how many have ticked it off and who. |
| **Notices** | Send a notice to everyone, or just Karate / Tai Chi / Yoga students, one dojo, or black belts. Shows how many students it will reach. Delete sent notices. |
| **Students** | Everyone who has signed up: classes, dojo, belt and contact details. Change a student's **belt** from the dropdown (e.g. after a grading) and they see it straight away. Search, filter, download as CSV, remove or restore. |
| **Calendar** | Mark training dates, closures, black-belt classes and gradings, add notes to dates, edit class times, then **Publish**. |
| **Coaches** | Add or remove coach emails. |

Until the Firebase setup below is done, both sites run in **demo mode**: they work, but everything is saved only in the browser you're using. A yellow banner shows while that's the case. The two sites share demo data if you open them in the same browser.

## Turn on GitHub Pages (both repositories)

In each repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.** The site appears at the address above a minute or two later.

## Go live with Firebase (free, about 15 minutes)

1. Go to <https://console.firebase.google.com>, **Add project**, name it e.g. `emptyhands`. Google Analytics isn't needed.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. Still in Authentication, check that `rauf-mushtaq.github.io` is listed under **Settings → Authorised domains**, and add it if it isn't.
4. **Build → Firestore Database → Create database.** Choose the `europe-west2 (London)` location and start in **production mode**.
5. In Firestore, open the **Rules** tab, replace what's there with everything from `firebase/firestore.rules`, and press **Publish**.
6. **Project settings (⚙) → General → Your apps → Web (`</>`)**. Register the app (no hosting needed) and copy the `firebaseConfig` values into `js/config.js` **in both repositories**.
7. Head coaches: put your coach email(s) in `OWNER_EMAILS` in `js/config.js` (both repositories) and in `OWNERS()` in `firebase/firestore.rules`. It's set to `info@emptyhands.co.uk` for now. Re-publish the rules if you change them.
8. Commit, then open the coach panel, choose **New coach account** with a head-coach email, click the link in the verification email, and press **check again**.

The Firebase config values aren't secret. The security rules are what protect the data: only registered students can read notices, only coaches can see the student list, send notices or publish calendars, and students can only edit their own profile.

## Push notifications for the phone apps

The App Store / Google Play apps (see `mobile/README.md` in emptyhands.student) get a push notification when you send a notice. That's done by the function in `firebase/functions`, which needs the Firebase **Blaze** (pay-as-you-go) plan; for a dojo it should cost about £0. Deploy it with:

```sh
npm install -g firebase-tools
firebase login
cd firebase
firebase use --add            # pick your project
firebase deploy --only functions,firestore:rules
```

## Each year

1. **Calendar → New year…** → enter the year. Leave "mark every Thursday as training" ticked.
2. Pick **Closed** and click the closure dates. Use **Black belt** for black-belt classes, **Grading / workshop** for gradings, and **Add note** to attach details (e.g. "Kyu grading, Epping (invite only) 12:30pm").
3. Check the class times, add a link to the PDF if you have one, then press **Publish**.

Students see the new calendar straight away. They see the current year by default and can switch years. Until 2026 has been published from the panel, students see the 2026 dates from the printed PDF, which are built into `js/calendar-data.js`.

## What students see as "relevant"

- Training and closure dates: everyone.
- Gradings and workshops: students who ticked Karate.
- Black-belt classes: students who chose Black belt.

Notices follow the audience you chose when sending.

## Shared files

`app.css` and everything in `js/` except `coach.js` are the same as in emptyhands.student. If you change one of them, copy the change to the other repository.

## Coach sign-in approval (email to info@emptyhands.co.uk)

When `COACH_LOGIN_APPROVAL` is `true` in `js/config.js`, every new sign-in to the coach panel shows "Approve this sign-in" and emails **info@emptyhands.co.uk** a link with **Approve / Decline** buttons. The panel opens by itself once approved; a declined sign-in is signed out. The security rules require an approved sign-in for every coach action, so a stolen password alone isn't enough.

It needs the Blaze plan, a [Resend](https://resend.com) account created with info@emptyhands.co.uk (free), and deploying the functions, secret and rules together:

```sh
cd firebase
firebase functions:secrets:set RESEND_API_KEY     # paste the Resend API key
firebase deploy --only functions,firestore:rules
```

Then set `COACH_LOGIN_APPROVAL = true` in `js/config.js` in both repositories.

**Locked out?** (e.g. email not arriving) In the Firebase console → Firestore → Rules, publish the previous rules version from the rules history, and set `COACH_LOGIN_APPROVAL = false`.

## Fees: who has paid, and reminders

**Payments → Who has paid** lists every accepted student for a month as Paid / Unpaid / Exempt.

- **Mark paid** records cash or bank payments. **Undo** removes a record. **Exempt** is for students who don't pay a monthly fee (pay-as-you-go, family arrangements).
- **Remind** / **Remind everyone unpaid** sends a private EmptyHands-menu message ("your October fees haven't been paid yet…"), which also arrives as a phone notification once the functions are deployed.
- Students see "October fees paid ✓" or "not paid yet" and their payment history on **Pay fees**.

**Automatic (needs the Blaze plan and functions deployed):**
- `paypalIpn` records PayPal payments made from the student app against the student, after checking each one with PayPal. A monthly fee only counts if it was paid in full to your PayPal account. Turn it on with `PAYPAL_AUTO_TRACK = true` in `js/config.js` (both repositories). In PayPal you may also need to turn on Instant Payment Notifications (Account Settings → Notifications → Instant payment notifications) with the URL `https://europe-west2-emptyhands-student-portal.cloudfunctions.net/paypalIpn`.
- `monthlyReminders` runs at 10am on the 7th of each month and reminds everyone unpaid, if **Send reminders automatically** is ticked (and saved) in the Payments tab. Nobody is reminded twice in a month.
