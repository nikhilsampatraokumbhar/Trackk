# Building the APK — Two Easy Methods

## Method 1: GitHub Actions (Recommended — No Setup Needed)

This is the easiest. GitHub builds the APK for you in the cloud.

### Step 1: Push to GitHub
```bash
# On your Mac, in a terminal:
cd ~/Desktop
mkdir Trackk
# Copy the project files here, then:
git init
git add -A
git commit -m "Trackk app"
git remote add origin https://github.com/YOUR_USERNAME/trackk.git
git push -u origin main
```

Or just drag the project folder to GitHub Desktop and push.

### Step 2: Wait for Build (~5-8 minutes)
- Go to your repo on GitHub
- Click the **Actions** tab
- Watch "Build APK" workflow run

### Step 3: Download Your APK
- When the build is green, click on it
- Scroll down to **Artifacts**
- Download **Trackk-Debug-APK**
- Extract the zip → you have your `.apk` file!

### Step 4: Install on Your Android Phone
- Transfer the `.apk` to your phone (WhatsApp, Google Drive, USB, etc.)
- On Android: **Settings → Security → Install Unknown Apps** → enable for your file manager
- Open the APK file → tap Install

---

## Method 2: EAS Build (Expo's Cloud Build Service)

### Step 1: Create a Free Expo Account
- Go to https://expo.dev/signup (it's free)

### Step 2: Install EAS CLI
```bash
npm install -g @expo/eas-cli
```

### Step 3: Login and Build
```bash
eas login
eas build --platform android --profile preview
```

- EAS will ask if you want to create a new project → Yes
- Wait ~10-15 minutes for the cloud build
- It will print a download URL for your APK

---

## What Trackk Does

### Automatic Transaction Detection
- When you enable a tracker, the app reads incoming bank SMS
- After a UPI/card transaction, you'll get a notification:
  - **1 tracker ON** → "Add to Personal" button in notification
  - **2+ trackers ON** → "Choose Tracker" button opens app
- Tap the notification action to save instantly — no manual entry!

### Trackers Available
1. **Personal** — Daily spending
2. **Reimbursement** — Office/business expenses
3. **Groups** — Split with friends (auto-calculates who owes whom)

### Testing With Real Transactions
1. Open app → Home screen
2. Tap "Personal Expenses" toggle → turns green = TRACKING
3. Make a UPI payment on PhonePe/GPay or card swipe
4. Your bank sends an SMS → app detects it → notification pops up
5. Tap "Add to Personal" in the notification
6. Open app → transaction is saved with amount, merchant, date

### Permissions Required
When you first open the app, it asks for:
- **SMS** — to read transaction messages
- **Notifications** — to show the "Add" button

Grant both for full functionality.

---

## Technical Details

- **Low battery usage** — event-driven SMS detection, no background polling
- Banks supported: HDFC, SBI, ICICI, Axis, Kotak, PNB, Paytm, PhonePe, GPay, 20+ more
