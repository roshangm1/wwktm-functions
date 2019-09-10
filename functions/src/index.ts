import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
const gcs = require("@google-cloud/storage")();
const spawn = require("child-process-promise").spawn;
const mkdirp = require("mkdirp-promise");
const path = require("path");
const os = require("os");
const fs = require("fs");

admin.initializeApp();

exports.upvoteAQuestion = functions.https.onCall(async (data, context) => {
  const questionId = data.questionId;
  const uid = context.auth!.uid;
  const question = (await admin
    .firestore()
    .collection("questions")
    .doc(questionId)
    .get()).data()!;

  if (question.voters.includes(uid)) {
    question.voters = arrayRemove(question.voters, uid);
  } else {
    question.voters.push(uid);
  }
  question.upvotes = question.voters.length;

  await admin
    .firestore()
    .collection("questions")
    .doc(questionId)
    .update(question);
});

function arrayRemove(arr: [], value: string) {
  return arr.filter(function(ele) {
    return ele !== value;
  });
}

exports.onCommentAdded = functions.firestore
  .document("/feed/{postId}/comments/{commentId}")
  .onWrite(async (snap, context) => {
    const count = (await admin
      .firestore()
      .collection("feed")
      .doc(context.params.postId)
      .collection("comments")
      .listDocuments()).length;
    await admin
      .firestore()
      .collection("feed")
      .doc(context.params.postId)
      .update({ commentCount: count });
  });

exports.onQuestionEdited = functions.firestore
  .document("/questions/{questionId}")
  .onWrite(async (snap, context) => {
    const count = snap.after.data()!.voters.length;

    await admin
      .firestore()
      .collection("questions")
      .doc(context.params.questionId)
      .update({ upvoteCount: count });
  });

exports.compressNewImage = functions.storage.object().onFinalize(data => {
  // File and directory paths.
  const filePath = data.name;
  const tempLocalFile = path.join(os.tmpdir(), filePath);
  const tempLocalDir = path.dirname(tempLocalFile);

  // Exit if this is triggered on a file that is not an image.
  if (!data.contentType!.startsWith("image/")) {
    console.log("This is not an image.");
    return null;
  }

  if (data.metadata && data.metadata!.optimized) {
    console.log("This image has been already compressed or optimized");
    return null;
  }

  // Cloud Storage files.
  const bucket = gcs.bucket(data.bucket);
  const file = bucket.file(filePath);
  return mkdirp(tempLocalDir)
    .then(() => file.download({ destination: tempLocalFile }))
    .then(() => {
      console.log("The file has been downloaded to", tempLocalFile);
      return spawn("convert", [
        tempLocalFile,
        "-strip",
        "-interlace",
        "Plane",
        "-quality",
        "90",
        tempLocalFile
      ]);
    })
    .then(() => {
      console.log("Optimized image created at", tempLocalFile);
      // Uploading the Optimized image.
      return bucket.upload(tempLocalFile, {
        destination: file,
        metadata: {
          metadata: {
            optimized: true
          }
        }
      });
    })
    .then(() => {
      console.log("Optimized image uploaded to Storage at", file);
      // Once the image has been uploaded delete the local files to free up disk space.
      fs.unlinkSync(tempLocalFile);
      return null;
    });
});
