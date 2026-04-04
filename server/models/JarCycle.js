// models/JarCycle.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const JarCycleSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    monthKey: { type: String, required: true }, // "2025-12"

    fundedAmount: { type: Number, default: 0 }, // đã nạp vào hũ tháng
    fundedAt: { type: Date, default: null },

    // snapshot các bucket tháng này (từ template)
    buckets: [
      {
        template_id: { type: Schema.Types.ObjectId, ref: "JarTemplate" },
        name: String,
        icon: String,
        color: String,
        monthlyLimit: Number,   // budget tháng cho bucket
      },
    ],
  },
  { timestamps: true }
);

JarCycleSchema.index({ user_id: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model("JarCycle", JarCycleSchema);
