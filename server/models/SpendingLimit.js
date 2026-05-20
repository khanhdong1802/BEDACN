const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SpendingLimitSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    category_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    months: {
      type: Number,
      enum: [1, 3, 6, 12],
      default: 1,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    start_date: {
      type: Date,
      default: Date.now,
    },

    end_date: {
      type: Date,
    },

    alert_percent: {
      type: Number,
      default: 80,
      min: 1,
      max: 100,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

SpendingLimitSchema.pre("save", function (next) {
  if (!this.end_date && this.start_date && this.months) {
    const endDate = new Date(this.start_date);
    endDate.setMonth(endDate.getMonth() + this.months);
    this.end_date = endDate;
  }

  next();
});

module.exports = mongoose.model("SpendingLimit", SpendingLimitSchema);