This is a brand new next.js app created from `npx create-next-app@latest`. It needs to be built in the similar design fashion from the neighboring repo `goal-tracker-bus321` with the same motion, design, transitions, mobile first design, etc. The only difference will be the colors. 

So what is `budget-tracker`? Good question! Budget tracker is a personalized, private, single user budget tracking app. It will run with Google OIDC auth and will follow the same .env conventions as bus321. By default, the only allowed user should be under the email `nigel.nds.smith@gmail.com` as a config (not secret, so don't worry about committing that in the .env.example). Then any users that log in will be disabled by defualt, needing activation from the admin.

The actual report of my budget was created as a single HTML page, this serves as a starting point for budget and stuff. This is found in the untracked `base.html` file and should stay untracked in git. This will be your context, and you should think about what that page does rather than just trusting values. 

Go ahead and create the application in its entirety. It will need a neon postgresql database and will be entirely hosted in vercel. Your job is to make the app and ensure that it works locally. Your job is NOT to deploy it. So, leave that to me.
