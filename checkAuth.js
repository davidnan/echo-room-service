const admin = require("firebase-admin")

const serviceAccount = require("./secrets/echoroom-a7c85-firebase-adminsdk-o5ag1-50bc9a8635.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function getUserAuthenticationInfo(accessToken) {
  return await admin.auth().verifyIdToken(accessToken)
}

async function setUserAuthenticationRequest(req, res) {
  try{
    if (!req.body) {
      res.status(401).send('Invalid Credentials');
    }
    return await getUserAuthenticationInfo(req.body.accessToken)
  } catch (e) {
    res.status(401).send('Invalid Credentials');
  }
}

async function isAuthenticated(accessToken) {
  console.log(accessToken)
  if (!accessToken) {
    return false
  }
  const user = await getUserAuthenticationInfo(accessToken)
  return user != null;
}

exports.setUserAuthenticationRequest = setUserAuthenticationRequest;
exports.isAuthenticated = isAuthenticated;
exports.getUserAuthenticationInfo = getUserAuthenticationInfo;
exports.admin = admin;
