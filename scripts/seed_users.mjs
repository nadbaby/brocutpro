import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCOD-8r6C492ULiRxHwzBglF2Pop1zhHsU",
  authDomain: "cutvutpro.firebaseapp.com",
  projectId: "cutvutpro",
  storageBucket: "cutvutpro.firebasestorage.app",
  messagingSenderId: "754184596804",
  appId: "1:754184596804:web:b45592d76cabb35009fb11"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const usersToEnsure = [
  { email: 'dipanshu@pvtchopra.com', name: 'Dipanshu', role: 'admin', password: 'Fine@123' },
  { email: 'bhawna@pvtchopra.com', name: 'Bhawna', role: 'user', password: 'Fine@123' },
  { email: 'roshini@pvtchopra.com', name: 'Roshini', role: 'user', password: 'Fine@123' },
  { email: 'suman@pvtchopra.com', name: 'Suman', role: 'user', password: 'Fine@123' },
  { email: 'rajwant@pvtchopra.com', name: 'Rajwant', role: 'user', password: 'Fine@123' },
];

async function setup() {
  for (const u of usersToEnsure) {
    try {
      console.log(`Checking ${u.email}...`);
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, u.email, u.password);
        console.log(`  Signed in existing user: ${u.email}`);
      } catch (signInErr) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          userCredential = await createUserWithEmailAndPassword(auth, u.email, u.password);
          console.log(`  Created user: ${u.email}`);
        } else {
          console.warn(`  Sign-in issue for ${u.email}:`, signInErr.code, signInErr.message);
          continue;
        }
      }

      if (userCredential && userCredential.user) {
        try {
          await updateProfile(userCredential.user, { displayName: u.name });
        } catch (e) {}

        // Save role in Firestore users collection
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: u.email,
            displayName: u.name,
            role: u.role,
            canAddInventory: u.role === 'admin',
            canEditInventory: u.role === 'admin',
            canDeleteInventory: u.role === 'admin',
            canCreateCuts: true,
            canViewInventory: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`  Saved user profile & role in Firestore for: ${u.email} (Role: ${u.role})`);
        } catch (fsErr) {
          console.warn(`  Firestore write warning for ${u.email}:`, fsErr.message);
        }
      }
    } catch (err) {
      console.error(`Error configuring ${u.email}:`, err.message);
    }
  }
}

setup().then(() => {
  console.log('User setup complete!');
  process.exit(0);
}).catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});

