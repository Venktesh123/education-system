const mongoose = require("mongoose");

async function withTransaction(operations) {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const result = await operations(session);

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    throw error;
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
}

module.exports = {
  withTransaction,
};
