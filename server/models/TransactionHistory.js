const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TransactionHistorySchema = new Schema({
  transaction_type: {
    type: String,
    enum: [
      "expense",
      "income",
      "debt_payment",
      "contribution",
      "groupExpense",
    ],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  transaction_date: {
    type: Date,
    default: Date.now,
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    default: null,
  },
  description: {
    type: String,
    default: "",
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  group_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    default: null,
  },
  status: {
    type: String,
    enum: ["completed", "pending", "failed"],
    default: "completed",
  },
});

module.exports = mongoose.model("TransactionHistory", TransactionHistorySchema);