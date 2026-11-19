import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCOD-8r6C492ULiRxHwzBglF2Pop1zhHsU",
  authDomain: "cutvutpro.firebaseapp.com",
  projectId: "cutvutpro"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

signInWithEmailAndPassword(auth, 'bhawna@pvtchopra.com', 'Fine@123')
  .then(u => {
    console.log('SUCCESS: bhawna signed in with Fine@123, uid:', u.user.uid);
    process.exit(0);
  })
  .catch(err => {
    console.log('FAILED to sign in bhawna with Fine@123:', err.code, err.message);
    process.exit(1);
  });

