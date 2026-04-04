// models/JarExpense.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const JarExpenseSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cycle_id: { type: Schema.Types.ObjectId, ref: "JarCycle", required: true },
    template_id: { type: Schema.Types.ObjectId, ref: "JarTemplate", required: true },

    amount: { type: Number, required: true },
    note: { type: String, default: "" },
    spentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JarExpense", JarExpenseSchema);
