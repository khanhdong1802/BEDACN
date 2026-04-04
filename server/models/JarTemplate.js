// models/JarTemplate.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const JarTemplateSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },          // "Ăn uống"
    icon: { type: String, default: "utensils" },     // FE map icon
    color: { type: String, default: "from-rose-500 to-pink-500" },

    // Cách phân bổ tháng
    allocateType: { type: String, enum: ["fixed", "percent"], default: "fixed" },
    allocateValue: { type: Number, default: 0 },     // fixed = tiền, percent = %

    // Hạn mức tháng (budget)
    monthlyLimit: { type: Number, default: 0 },
    
    // Cho phép vượt nhẹ và tỉ lệ cảnh báo (phần trăm so với gợi ý/ngày)
    allowOver: { type: Boolean, default: true },
    warningPercent: { type: Number, default: 120 },

    isActive: {
  type: Boolean,
  default: true,
  index: true,
},

  },
  { timestamps: true }
);

module.exports = mongoose.model("JarTemplate", JarTemplateSchema);
