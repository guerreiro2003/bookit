# 🚀 How to put your site online

A super simple guide to getting your Book It website live on the internet, even if you've never done it before.

**Time needed:** About 30 minutes.
**Money:** Free. Everything we use has a free plan.

---

## 🧰 What you need (5 minutes setup)

Before we start, you'll need three free accounts. Don't worry — they're all free and take 2 minutes each to create.

| Account | What it is | Sign up here |
|---|---|---|
| 📦 **GitHub** | A safe place online where your code lives | [github.com/signup](https://github.com/signup) |
| 🌍 **Netlify** | The service that puts your site on the internet | [netlify.com/signup](https://app.netlify.com/signup) |
| 🔥 **Firebase** | Stores your bookings and handles logins | [firebase.google.com](https://firebase.google.com) |

> 💡 **Tip:** Use the same email for all three accounts. Easier to remember.

✅ **Checklist before you continue:**
- [ ] I created a GitHub account
- [ ] I created a Netlify account
- [ ] I have a Google account (Firebase uses Google login)

---

## 1️⃣ GitHub — where your code lives

### What is GitHub?

Imagine GitHub like Google Drive, but for code. It's a website where you keep your files safely online. When you make changes, GitHub remembers every version so nothing gets lost. Netlify will look at GitHub and automatically put your website online whenever you make changes.

### Step-by-step

**1.** Go to **[github.com](https://github.com)** and log in.

**2.** In the top-right corner you'll see a **+** button (like a plus sign). Click it, then click **"New repository"**.

> 📷 *You will see a big page that says "Create a new repository" at the top.*

**3.** Fill in the form:
- **Repository name:** type `bookit`
- **Description:** leave empty (or write "My salon booking site")
- **Public** or **Private**: choose **Public** (free).
- **Add a README file**: leave unchecked.
- Leave everything else as it is.

**4.** Click the big green button **"Create repository"** at the bottom.

> 📷 *You will see a page with code instructions. Don't panic.*

**5.** Now we need to upload your files. The easiest way:

- On that same page, find the link that says **"uploading an existing file"** (it's in the middle of the page, in blue).
- Click it.
- A new page opens with a big dotted box that says **"Drag files here to add them to your repository"**.
- Open the folder on your computer where your `bookit-main` files are.
- Select **all the files** inside (not the folder itself — the files: `index.html`, `admin.html`, `styles.css`, etc.).
- Drag them all into that dotted box.
- Wait for them to upload (you'll see green checkmarks).

**6.** Scroll down. Below the upload box you'll see a section called **"Commit changes"**.
- In the **first text box**, type: `First upload`
- Click the green button **"Commit changes"** at the bottom.

**7.** You're done with GitHub. The page will refresh and you'll see all your files in a list.

✅ **Checklist:**
- [ ] I created a repository called `bookit`
- [ ] I uploaded all the files inside the `bookit-main` folder
- [ ] I can see `index.html`, `admin.html`, `styles.css`, and the others in the file list

---

## 2️⃣ Netlify — what puts it on the internet

### What is Netlify?

Netlify is a service that takes the files you put on GitHub and makes them visible on the internet at a real web address (like `mysalon.netlify.app`). You can connect your own custom address later if you have one (like `mysalon.com`).

### Step-by-step

**1.** Go to **[app.netlify.com](https://app.netlify.com)** and log in.

**2.** You'll see a big page with a button that says **"Add new site"**. Click it, then choose **"Import an existing project"**.

> 📷 *A page opens asking "Connect to Git provider".*

**3.** Click the **GitHub** button (it has the GitHub octopus-cat logo).

**4.** A pop-up window opens asking permission. Click **"Authorize Netlify"** and follow what it asks (it might ask for your GitHub password).

**5.** Back in Netlify, you'll see a list of all your GitHub repositories. Find **`bookit`** and click it.

> 📷 *A page opens with the title "Site settings for ...". Don't change anything!*

**6.** Just scroll to the bottom and click the dark button **"Deploy bookit"**.

**7.** Netlify starts working. You'll see a page that says **"Site deploy in progress"**. It takes about 30 seconds.

**8.** When it's done, you'll see at the top of the page a green box with a link like:

```
https://random-words-12345.netlify.app
```

🎉 **This is your website's address.** Click it to see your site online.

### Rename your site (optional but nice)

The random name is ugly. Let's fix it:

**1.** Click **"Site configuration"** in the left menu, then **"Change site name"**.
**2.** Type a name you like, for example `mysalon` or `zenorganic-pt`.
**3.** Click **"Save"**.

Your new address is: `https://mysalon.netlify.app`.

### Use your own domain (only if you bought one)

If you bought a domain like `mysalon.pt`:

**1.** In Netlify, click **"Domain management"** → **"Add a domain you already own"**.
**2.** Type your domain (e.g., `mysalon.pt`) and click **"Verify"**.
**3.** Netlify will tell you to add two things ("nameservers") at the company where you bought the domain.
**4.** Go to that company's website (GoDaddy, Namecheap, IONOS, etc.), find your domain, and replace the **nameservers** with the ones Netlify gave you.
**5.** Wait. It can take a few minutes or up to 24 hours.

> 💡 **What's a domain?** A domain is your custom internet address. `mysalon.pt` is a domain. `mysalon.netlify.app` is also kind of a domain, but it's a "subdomain" given to you for free by Netlify. A real custom domain costs around €10-15/year.

✅ **Checklist:**
- [ ] My site is online at a `.netlify.app` address
- [ ] I clicked the link and saw my Book It site
- [ ] (Optional) I changed the name to something I like

---

## 3️⃣ Firebase — your database and login system

### What is Firebase?

Firebase is a Google service that **remembers** the bookings, customers, and lets people log in safely. It's free for small businesses.

### Step-by-step

**1.** Go to **[firebase.google.com](https://firebase.google.com)** and click **"Go to console"** (top-right).

**2.** Click the big card **"Create a project"** (or **"Add project"** if you've used Firebase before).

**3.** **Project name:** type `bookit-mysalon` (or any name you like — no special characters or accents).

**4.** Click **"Continue"**. You might be asked about Google Analytics — choose **"Don't enable"** (we don't need it), then click **"Create project"**.

**5.** Wait about 30 seconds. You'll see a checkmark and the text **"Your new project is ready"**. Click **"Continue"**.

> 📷 *You're now inside your Firebase project. The left menu has options like Build, Run, Analytics.*

### Turn on Authentication (logins)

**6.** In the left menu, click **"Build"** → **"Authentication"**.

**7.** Click the big button **"Get started"**.

**8.** A list appears. Click **"Email/Password"** (the first option).

**9.** A panel opens. Turn **ON** the first switch (Email/Password). Leave the second one (Email link) off. Click **"Save"**.

### Turn on Firestore Database

**10.** Back in the left menu, click **"Build"** → **"Firestore Database"**.

**11.** Click **"Create database"**.

**12.** A dialog opens:
- **Location:** choose **`eur3 (europe-west)`** (or the one closest to you).
- Click **"Next"**.

**13.** Choose **"Start in production mode"** (it's safer). Click **"Create"**.

**14.** Wait ~30 seconds for the database to be created.

### Copy the Firebase keys

Now we need to tell your website how to talk to Firebase.

**15.** Click the **⚙️ gear icon** at the very top of the left menu, then **"Project settings"**.

**16.** Scroll down to **"Your apps"** section. You'll see "There are no apps in your project". Click the **`</>`** icon (web icon, with angle brackets).

**17.** Give your app a nickname: `bookit-web`. **Don't** check "Firebase Hosting". Click **"Register app"**.

**18.** Now Firebase shows you some code. Look for the block that starts with `const firebaseConfig = {`. **Copy** the part inside the curly braces `{ ... }`.

Example of what you'll see:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyABK6...",
  authDomain: "bookit-mysalon.firebaseapp.com",
  projectId: "bookit-mysalon",
  storageBucket: "bookit-mysalon.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

**19.** Open the file `firebase.js` from your bookit project (you can edit it directly on **GitHub**: go to your repo, click `firebase.js`, click the pencil icon ✏️ in the top-right).

**20.** Find the section that looks the same as what Firebase gave you. **Replace** it with your new Firebase config (the one from step 18).

**21.** Scroll down on the GitHub edit page. Click the green button **"Commit changes"** to save.

### Set up Firestore security rules (very important)

Without this step, anyone could read or delete your data. We're going to lock it down.

**22.** Back in Firebase, click **"Firestore Database"** → top tab **"Rules"**.

**23.** Delete everything in the editor and paste **exactly** this:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth() { return request.auth != null; }
    function isAdmin(salonId) {
      return isAuth() &&
        get(/databases/$(database)/documents/salons/$(salonId)).data.adminUid == request.auth.uid;
    }

    match /salons/{salonId} {
      allow read: if true;
      allow update: if isAdmin(salonId);
      allow create: if isAuth() && request.resource.data.adminUid == request.auth.uid;
      allow delete: if false;

      match /config/{document=**} {
        allow read: if true;
        allow write: if isAdmin(salonId);
      }
      match /users/{uid} {
        allow read, write: if isAdmin(salonId) || request.auth.uid == uid;
      }
      match /services/{id}    { allow read: if true; allow write: if isAdmin(salonId); }
      match /staff/{id}       { allow read: if true; allow write: if isAdmin(salonId); }
      match /promotions/{id}  { allow read: if true; allow write: if isAdmin(salonId); }

      match /clients/{clientId} {
        allow read, update: if isAdmin(salonId)
          || (isAuth() && resource.data.uid == request.auth.uid)
          || (isAuth() && resource.data.email == request.auth.token.email);
        allow create: if true;
        allow delete: if isAdmin(salonId);
      }

      match /bookings/{id} {
        allow read: if isAdmin(salonId)
          || (isAuth() && resource.data.clientEmail == request.auth.token.email);
        allow create: if true;
        allow update: if isAdmin(salonId)
          || (isAuth() && resource.data.clientEmail == request.auth.token.email
              && request.resource.data.status == 'cancelled');
        allow delete: if isAdmin(salonId);
      }
    }
  }
}
```

**24.** Click **"Publish"** at the top-right. Confirm.

✅ **Checklist:**
- [ ] Firebase project created
- [ ] Authentication "Email/Password" is ON
- [ ] Firestore database is created
- [ ] I copied my Firebase keys into `firebase.js` on GitHub
- [ ] I pasted the security rules and clicked "Publish"

---

## 4️⃣ Connect everything

### Trigger a fresh deploy

You already updated `firebase.js` on GitHub. Netlify automatically detects the change and re-deploys.

**1.** Go to **Netlify** → click your site name (e.g., `mysalon`).

**2.** You should see at the top **"Site deploy in progress"** or **"Production: main@..."** with a green dot.

**3.** Wait ~30 seconds.

### How to know it worked

**4.** Open a **new private/incognito tab** (so you don't see cached stuff):
- Chrome: `Cmd+Shift+N` (Mac) or `Ctrl+Shift+N` (Windows)
- Safari: `Cmd+Shift+N`
- Firefox: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)

**5.** Go to: `https://your-site.netlify.app/setup.html`

**6.** You should see a page titled **"Setup do salão"**. 🎉

> ⚠️ If you see a **white page** or strange errors, see the Troubleshooting section below.

✅ **Checklist:**
- [ ] Netlify is finished deploying (green checkmark)
- [ ] I opened `setup.html` and saw the setup form

---

## 5️⃣ First time setup (after going live)

### Create your salon

**1.** On the setup page, fill in:
- **Salon name:** your business name (e.g., "Zen Organic Hair Concept")
- **Slug:** a short version with no spaces, like `zenorganic` (this appears in URLs)
- **Tagline, Address, Phone, Email:** fill them in (optional but recommended)
- **Color:** click the colored square and pick the color you want for the site
- **Admin email and password:** this is YOUR login. Use something secure.
- **Schedule:** set the opening/closing times for each day

**2.** Click the big button **"Criar salão e conta admin"**.

**3.** You should see **"Salão criado com sucesso!"** and be redirected to the login page.

### Log in for the first time

**4.** Type the email and password you just created.
**5.** Click **"Entrar"**.
**6.** Welcome to your admin dashboard! 🎉

### Add your first service

**7.** On the left side, click **"Serviços"**.
**8.** In the form at the top:
- **Name:** e.g., "Haircut"
- **Price:** e.g., `25`
- **Duration:** e.g., `30` minutes
- **Type:** "Individual service"
**9.** Click **"Adicionar serviço"**.

You should see your service appear in the list below. 🎉

### Add your first staff member

**10.** Click **"Equipa"** in the menu.
**11.** Fill in:
- **Name:** e.g., "Ana"
- **Role:** e.g., "Hairdresser"
**12.** Click **"Adicionar colaborador"**.

### Set the team password (so staff can log in)

**13.** Click **"Configurações"** in the menu.
**14.** Scroll down. In the field **"Password da equipa"**, type a password your team will use.
**15.** Click **"Guardar configurações"**.

### Test a booking

**16.** Open a new tab. Go to: `https://your-site.netlify.app/?salon=YOURSLUG`
(replace `YOURSLUG` with the slug you chose, e.g., `zenorganic`)

**17.** Make a fake booking from start to finish.

**18.** Go back to the admin dashboard. You should see the booking under "Marcações de hoje".

✅ **Checklist:**
- [ ] I created my salon
- [ ] I'm logged in as admin
- [ ] I added at least one service
- [ ] I added at least one staff member
- [ ] I set the team password
- [ ] I made a test booking and saw it appear in admin

---

## 🛟 Troubleshooting

### "I see a white page when I open my site"
- The most common cause is wrong Firebase keys in `firebase.js`. Re-check step 18-21.
- Try opening DevTools (right-click → Inspect → Console tab) — look for red errors. Most errors mention exactly what's wrong.

### "Login doesn't work / says wrong email or password"
- Make sure Authentication → Email/Password is ON in Firebase (step 8).
- Try password reset: click "Esqueci-me da password" on the login page.

### "Bookings aren't saving"
- Check the security rules (step 23). The rules paste must be **exactly** as shown.
- Open DevTools → Console: if you see "Missing or insufficient permissions", the rules are wrong.

### "I see a permissions error in the console"
- Re-check Firestore rules. The most common mistake is missing a `match` block or curly brace.

### "I changed `firebase.js` but the site still looks broken"
- Netlify needs 30 seconds to deploy your change. Wait, then **hard refresh** the browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows).

### "I lost my admin password"
- Click "Esqueci-me da password" on `/login.html`. You'll get an email to reset it.

### "I want to delete the test bookings"
- Open `/admin.html` → **Marcações** → for each booking, click **Cancelar** (or open Firebase Console → Firestore → `salons/{your-slug}/bookings` → delete documents directly).

### "Dark mode looks weird"
- In the admin sidebar, click the moon/sun icon to toggle it. Choice is remembered per browser.

### "The site is slow when I select a staff member and date"
- This means a Firestore "composite index" is missing. Open the browser console — there will be a link to create it automatically. Click the link and Firebase creates it in 1 minute.

### "My team can't log in to staff.html"
- Did you set the team password in **Admin → Configurações**? Without it, no team login is possible.

### "I want to start over"
- In Firebase Console → Firestore → Delete the `salons/{your-slug}` document. Then re-run `setup.html`.

---

## 🎓 Congratulations

Your salon booking site is live. Customers can book online, your team can manage the day's schedule, and you have full control over everything.

🔗 **Your important links** (save these somewhere safe):

- **Public booking page:** `https://your-site.netlify.app/?salon=YOURSLUG`
- **Customer account area:** `https://your-site.netlify.app/account.html?salon=YOURSLUG`
- **Staff portal:** `https://your-site.netlify.app/staff.html?salon=YOURSLUG`
- **Admin dashboard:** `https://your-site.netlify.app/admin.html`

📖 **Next read:** check [GUIDE.md](GUIDE.md) to learn how to use every feature of Book It.

🆘 **Need help?** Email the developers or check the troubleshooting section above.
