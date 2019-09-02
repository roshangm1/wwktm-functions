import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

exports.upvoteAQuestion = functions.https.onCall(async (data, context) => {
  var questionId = data.questionId;
  var uid = context.auth!.uid;
  var question = (await admin
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
    return ele != value;
  });
}

exports.onCommentAdded = functions.firestore
  .document("/feed/{postId}/comments/{commentId}")
  .onUpdate(async (snap, context) => {
    var count = (await admin
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
